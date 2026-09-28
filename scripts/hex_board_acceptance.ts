import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
// Scripts are not a workspace package, so workspace imports use repo-relative
// source paths (the API's own @plotgo/game imports resolve from apps/api).
import { landGradeXpMultiplier, landPrice, utcDay, XP_FOR_LEVEL } from "../packages/game/src/index.ts";

// Land-edition hex board acceptance (Financial_Empire_Balancing_Model_v0.2 land
// geometry + Empire_Progression_System_v1.0 XP): the snapshot hexBoard v2
// (owned/frontier/grade/priceMinor/requiredLevel/empire progress incl. the v1.0
// candidateLevel/activeGate), starter-grant bootstrap (75 XP), ownership-gated
// placement (403 "Acquire this parcel first"), 0-cost frontier deeds +
// idempotent replay, trophy level gating, the placement-fit preview, settle (0
// XP), the exact v0.2 upgrade cash delta, and v1.0 XP awards. Spawned API on
// port 8793.

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(scriptDir, "package.json"));
dotenv.config({ path: path.resolve(scriptDir, "../.env") });

const repoRoot = path.resolve(scriptDir, "..");
const apiCwd = path.join(repoRoot, "apps", "api");
const tsxCli = path.join(path.dirname(require.resolve("tsx/package.json", { paths: [apiCwd] })), "dist", "cli.mjs");
const apiPort = 8793;
const baseUrl = `http://127.0.0.1:${apiPort}`;
const playerId = `hex-land-${randomUUID()}`;
const playerIds = [playerId];
const prisma = new PrismaClient();

const STARTER_HEX = "35"; // parcel D05, order-1 starter grant
const DEED_HEX = "33"; // parcel D04, order-6 frontier deed (0 cost, requiredLevel 4)
const TROPHY_HEX = "16"; // parcel A04, Trophy cash purchase (247800, requiredLevel 12)

type JsonObject = Record<string, any>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function request(pathname: string, init: RequestInit = {}, forPlayerId?: string): Promise<JsonObject> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (forPlayerId) headers.set("x-player-id", forPlayerId);
  const response = await fetch(`${baseUrl}${pathname}`, { ...init, headers });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, ...body } as JsonObject;
}

async function post(pathname: string, body: JsonObject, forPlayerId?: string): Promise<JsonObject> {
  return request(pathname, { method: "POST", body: JSON.stringify(body) }, forPlayerId);
}

async function postOk(pathname: string, body: JsonObject, forPlayerId?: string): Promise<JsonObject> {
  const result = await post(pathname, body, forPlayerId);
  assert(result.status === 200, `POST ${pathname} failed: ${JSON.stringify(result)}`);
  return result;
}

async function postExpectStatus(pathname: string, body: JsonObject, status: number): Promise<JsonObject> {
  const result = await post(pathname, body, playerId);
  assert(result.status === status, `POST ${pathname} expected ${status}, got ${JSON.stringify(result)}`);
  return result;
}

async function cashOf(id: string): Promise<number> {
  const row = await prisma.player.findUnique({ where: { id }, select: { cashMinor: true } });
  return Number(row?.cashMinor ?? 0);
}

async function xpOf(id: string): Promise<number> {
  const row = await prisma.player.findUnique({ where: { id }, select: { empireXp: true, empireLevel: true } });
  return Number(row?.empireXp ?? 0);
}

/** Pre-complete today's objective lanes so evidence-driven completion awards don't pollute exact XP deltas. */
async function silenceObjectives(): Promise<void> {
  await prisma.plotgoObjectiveState.updateMany({
    where: { playerId, day: utcDay(), status: "active" },
    data: { status: "complete" },
  });
}

async function waitForApi(): Promise<void> {
  try {
    const response = await fetch(`${baseUrl}/health`);
    if (response.ok) throw new Error(`port ${apiPort} is already serving an API; a stale test server may still be running`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("already serving")) throw error;
  }
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // The API is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for the land hex board acceptance API");
}

async function cleanupFixtures(): Promise<void> {
  const delegates = [
    "plotgoOnboardingMilestone", "plotgoTutorialRecoveryLedger", "card", "fragment",
    "plotgoPosition", "marketHuntSlot", "weeklyPerformance",
    "plotgoLedger", "plotgoDistrictDay", "plotgoSession", "plotgoPlacementAudit",
    "plotgoPlayerEvent", "plotgoEventMission", "plotgoEventAudit", "plotgoModuleRewardEvent",
    "playerModuleInventory", "buildingModuleLoadout", "moduleLoadoutAudit", "buildingMasteryProgress",
    "modulePartsBalance", "modulePartsLedger", "moduleCraftJob", "plotgoOfflineSession",
    "plotgoOfflineBucket", "plotgoOfflineSummary",
    "plotgoObjectiveState", "playerDailyState", "notificationOutbox",
  ] as const;
  await prisma.$transaction(async (tx) => {
    await tx.plotgoVisit.deleteMany({ where: { OR: [{ visitorId: { in: playerIds } }, { hostId: { in: playerIds } }] } });
    await tx.plotgoInvestment.deleteMany({ where: { OR: [{ visitorId: { in: playerIds } }, { hostId: { in: playerIds } }] } });
    for (const delegate of delegates) {
      // @ts-expect-error dynamic delegate access for fixture cleanup
      await tx[delegate].deleteMany({ where: { playerId: { in: playerIds } } });
    }
    await tx.plotgoLand.deleteMany({ where: { playerId: { in: playerIds } } });
    await tx.player.deleteMany({ where: { id: { in: playerIds } } });
  });
}

async function runAcceptance(): Promise<void> {
  // --- 1. Fresh player: the starter parcel is granted at creation and the
  // hexBoard v2 snapshot exposes ownership, frontier, grade, price, and the
  // empire-progress row. -----------------------------------------------
  const session = await postOk("/api/session", { playerId });
  const hexBoard = session.plot.hexBoard as JsonObject;
  assert(hexBoard.ownedCount === 1, `fresh player must own exactly 1 parcel, got ${hexBoard.ownedCount}`);
  assert(hexBoard.capacityForLevel === 1, `level-1 capacity must be 1 hex, got ${hexBoard.capacityForLevel}`);
  assert(hexBoard.empireLevel === 1, `fresh player empire level must be 1, got ${hexBoard.empireLevel}`);
  assert(hexBoard.empireXp === 75, `starter grant must award 75 land XP (75 × Entry), got ${hexBoard.empireXp}`);
  assert(hexBoard.candidateLevel === 1, `fresh player candidate level must be 1, got ${hexBoard.candidateLevel}`);
  assert(hexBoard.activeGate === null, `no gate is active below level 5, got ${JSON.stringify(hexBoard.activeGate)}`);
  assert(hexBoard.xpForNextLevel === XP_FOR_LEVEL[1]! - 75, `level 2 at ${XP_FOR_LEVEL[1]} XP means ${XP_FOR_LEVEL[1]! - 75} to go, got ${hexBoard.xpForNextLevel}`);
  const hexes = hexBoard.hexes as JsonObject[];
  assert(hexes.length === 35, `hexBoard must list all 35 hexes, got ${hexes.length}`);
  const starterRow = hexes.find((hex) => hex.hexId === STARTER_HEX);
  assert(starterRow && starterRow.owned === true, `starter hex ${STARTER_HEX} must be owned: ${JSON.stringify(starterRow)}`);
  assert(starterRow.acquisitionMethod === "Starter Grant", `starter row method diverged: ${starterRow.acquisitionMethod}`);
  assert(starterRow.grade === "Entry" && typeof starterRow.lvi === "number", "starter row must carry grade + LVI");
  assert(starterRow.priceMinor === 0 && starterRow.requiredLevel === 1, "starter row price/level diverged");
  assert(hexes.some((hex) => hex.frontier === true), "a fresh board must expose frontier hexes");
  const trophyRow = hexes.find((hex) => hex.hexId === TROPHY_HEX);
  // The snapshot's `priceMinor` field is true minor units (cost x 100), so A04
  // reads 24_780_000 minor = $247,800 Cash from the workbook price model.
  assert(trophyRow && trophyRow.grade === "Trophy" && trophyRow.priceMinor === 24_780_000 && trophyRow.requiredLevel === 12,
    `A04 snapshot row must be {Trophy, 24_780_000 minor ($247,800), level 12}: ${JSON.stringify(trophyRow)}`);
  const landRow = await prisma.plotgoLand.findUnique({ where: { playerId_hexId: { playerId, hexId: STARTER_HEX } } });
  assert(landRow && landRow.method === "starter_grant" && Number(landRow.priceMinor) === 0, "plotgo_land starter row diverged");

  // --- 2. Placement requires ownership: the starter hex works, an unowned
  // hex is rejected with the acquisition guidance. v1.0: placing awards
  // exactly +100 construction XP (100 × Humble 1.0). --------------------
  await silenceObjectives();
  const xpBeforePlace = await xpOf(playerId);
  const placed = await postOk("/api/plot/place", { type: "cash_kiosk", hexId: STARTER_HEX }, playerId);
  const kiosk = (placed.cards as JsonObject[]).find((card: JsonObject) => card.type === "cash_kiosk");
  assert(kiosk && kiosk.hexId === STARTER_HEX, `kiosk must sit on ${STARTER_HEX}`);
  const kioskId = kiosk.id as string;
  const placeXpDelta = (await xpOf(playerId)) - xpBeforePlace;
  assert(placeXpDelta === 100, `placing a building must award exactly +100 (construction × Humble), got +${placeXpDelta}`);

  const unownedHex = hexes.find((hex) => hex.hexId !== STARTER_HEX)!.hexId as string;
  const denied = await postExpectStatus("/api/plot/place", { type: "cash_kiosk", hexId: unownedHex }, 403);
  assert(String(denied.error ?? "") === "Acquire this parcel first", `unowned-hex 403 must say "Acquire this parcel first": ${JSON.stringify(denied)}`);
  const occupied = await postExpectStatus("/api/plot/place", { type: "trading_booth", hexId: STARTER_HEX }, 409);
  assert(/occupied/i.test(String(occupied.error ?? "")), "a second building on an occupied hex must 409");

  // --- 3. Trophy gating: A04 (level 12) is rejected at level 1 with the
  // level reason (the API checks the level gate before capacity/frontier). ---
  const gated = await postExpectStatus("/api/land/acquire", { hexId: TROPHY_HEX }, 403);
  assert(/level is too low/i.test(String(gated.error ?? "")), `A04 acquire must 403 with the level reason: ${JSON.stringify(gated)}`);

  // --- 4. Empire growth fixture: level 4 (= 1,200 XP on the v1.0 cumulative
  // curve) opens the capacity (6 hexes) and the D04 frontier deed
  // (requiredLevel 4). The award path itself is covered by the starter-grant
  // and deed XP assertions below. --------------------------------
  await prisma.player.update({ where: { id: playerId }, data: { empireXp: XP_FOR_LEVEL[3]!, empireLevel: 4 } });

  // --- 5. A 0-cost frontier deed acquires cleanly, debits nothing, awards
  // 75 × land-grade XP and replays idempotently. ------------------------
  await silenceObjectives();
  const cashBeforeDeed = await cashOf(playerId);
  const xpBeforeDeed = await xpOf(playerId);
  const deedGrade = landPrice("D04")!.grade;
  const expectedDeedXp = Math.round(75 * landGradeXpMultiplier(deedGrade));
  const deed = await postOk("/api/land/acquire", { hexId: DEED_HEX }, playerId);
  assert(deed.replayed === false, "first acquire must not be a replay");
  assert(deed.ownership.method === "frontier_deed" && deed.ownership.priceMinor === 0, `deed ownership diverged: ${JSON.stringify(deed.ownership)}`);
  assert(deed.ownedCount === 2, `ownedCount must be 2 after the deed, got ${deed.ownedCount}`);
  assert((await cashOf(playerId)) === cashBeforeDeed, "a 0-cost deed must not debit Cash");
  assert((await xpOf(playerId)) === xpBeforeDeed + expectedDeedXp, `acquiring land must award 75 × ${deedGrade} = ${expectedDeedXp} XP`);
  const hexesAfterDeed = (deed.hexes as JsonObject[]).find((hex: JsonObject) => hex.hexId === DEED_HEX);
  assert(hexesAfterDeed.owned === true && hexesAfterDeed.acquiredMethod === "frontier_deed", "deed row must flip to owned");
  const replay = await postOk("/api/land/acquire", { hexId: DEED_HEX }, playerId);
  assert(replay.replayed === true, "re-acquiring an owned hex must report replayed:true");
  assert(replay.ownedCount === 2, "replayed acquire must not duplicate ownership");
  assert((await xpOf(playerId)) === xpBeforeDeed + expectedDeedXp, "replayed acquire must not re-award XP");

  // --- 6. Placement on the newly owned deed hex succeeds (v1.0: another
  // +100 construction XP, not asserted exactly here). ------------------
  await silenceObjectives();
  const booth = await postOk("/api/plot/place", { type: "trading_booth", hexId: DEED_HEX }, playerId);
  const boothCard = (booth.cards as JsonObject[]).find((card: JsonObject) => card.type === "trading_booth");
  assert(boothCard && boothCard.hexId === DEED_HEX, `trading booth must sit on ${DEED_HEX}`);

  // --- 7. Fit preview: kiosk on the starter hex reproduces the workbook
  // 1.00232 exactly, and the per-factor breakdown sums to the multiplier. ----
  const fit = await request(`/api/land/fit?hexId=${STARTER_HEX}&type=cash_kiosk`, {}, playerId);
  assert(fit.status === 200 && fit.multiplier === 1.00232, `kiosk-on-${STARTER_HEX} fit must be 1.00232: ${JSON.stringify(fit)}`);
  const breakdownSum = (fit.breakdown as JsonObject[]).reduce((sum: number, entry: JsonObject) => sum + entry.delta, 0);
  assert(Math.abs(1 + breakdownSum - fit.multiplier) < 1e-9, `fit breakdown must sum to the multiplier: ${breakdownSum}`);
  assert((fit.breakdown as JsonObject[]).length === 4, "fit breakdown must expose all four factors");

  // --- 8. Settle produces a receipt, moves cash, and awards zero XP.
  // Pre-seed the revenue-milestone tracker at tier 5 (earned_minor crosses no
  // new tier) and silence objectives so the settle snapshot cannot complete an
  // objective lane — v1.0 removed all XP from settle itself. -----------
  await silenceObjectives();
  await prisma.player.update({ where: { id: playerId }, data: { promotions: ["revenue_tier:5"] } });
  const cashBeforeSettle = await cashOf(playerId);
  const xpBeforeSettle = await xpOf(playerId);
  const settle = await postOk("/api/session/settle", { verb: "walk" }, playerId);
  assert(settle.receipt && typeof settle.receipt.cashAfterMinor === "number", "settle must return a receipt");
  assert((settle.receipt.lines as JsonObject[]).length > 0, "settle receipt must carry ledger lines");
  assert((await cashOf(playerId)) !== cashBeforeSettle, "settle must change the player's cash");
  assert((await xpOf(playerId)) === xpBeforeSettle, `settle must award 0 XP, got +${(await xpOf(playerId)) - xpBeforeSettle}`);

  // --- 9. Upgrading in place charges exactly the v0.2 workbook cost
  // (kiosk stage 2 = 43.75 Cash = 4375 minor), stays on the hex, and awards
  // exactly +50 XP (stage-2 upgrade × Humble 1.0). ----------------------
  await silenceObjectives();
  const xpBeforeUpgrade = await xpOf(playerId);
  const cashBeforeUpgrade = await cashOf(playerId);
  const upgraded = await postOk("/api/plot/upgrade", { cardId: kioskId }, playerId);
  const upgradedKiosk = (upgraded.cards as JsonObject[]).find((card: JsonObject) => card.id === kioskId);
  assert(upgradedKiosk?.stage === 2 && upgradedKiosk?.hexId === STARTER_HEX, "kiosk must upgrade to stage 2 in place");
  const cashAfterUpgrade = await cashOf(playerId);
  const upgradeLedger = await prisma.plotgoLedger.findMany({ where: { playerId, reason: "upgrade" } });
  const upgradeRow = upgradeLedger.find((row) => (row.metadataJson as JsonObject).cardId === kioskId);
  // The v0.2 workbook cost is exact on the ledger row; the raw balance delta can
  // also include the offline catch-up credit processed inside the same request.
  assert(upgradeRow && Number(upgradeRow.amountMinor) === -4_375, `stage-2 kiosk upgrade must debit exactly 4375 minor: ${JSON.stringify(upgradeRow, (key, value) => typeof value === "bigint" ? value.toString() : value)}`);
  assert(cashAfterUpgrade < cashBeforeUpgrade, "upgrade must leave the player poorer despite catch-up credits");
  const upgradeXpDelta = (await xpOf(playerId)) - xpBeforeUpgrade;
  assert(upgradeXpDelta === 50, `upgrading must award exactly +50 XP (stage-2 × Humble), got +${upgradeXpDelta}`);

  console.log("land hex board acceptance passed: hexBoard v2 (starter grant owned, capacity/empire progress + v1.0 candidateLevel/activeGate, frontier, grade/price rows incl. A04 Trophy 247800 @12), bootstrap 75 XP @ level 1, ownership-gated placement (403 Acquire this parcel first / 409 occupied, place +100 XP), trophy level gate, 0-cost frontier deed +75×grade XP + idempotent replay (no double XP/cash), placement on the deed, fit preview 1.00232 with breakdown, settle receipt + 0 XP, exact 4375-minor upgrade ledger delta +50 XP");
}

async function main(): Promise<void> {
  let server: ChildProcess | undefined;
  try {
    const command = `"${process.execPath}" "${tsxCli}" src/index.ts`;
    server = spawn(command, {
      cwd: apiCwd,
      env: { ...process.env, PORT: String(apiPort) },
      stdio: "ignore",
      shell: true,
      windowsHide: true,
    });
    await waitForApi();
    await runAcceptance();
  } finally {
    if (server && !server.killed) {
      try {
        if (process.platform === "win32" && server.pid) execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
        else server.kill();
      } catch {
        // The spawned shell may already be gone; never mask the acceptance result.
      }
    }
    await cleanupFixtures();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
