import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { hexDistance } from "@plotgo/game";

// Onboarding acceptance (v0.2 land edition): the first-5-minute flow now runs
// on owned parcels — the starter grant (hex 35) carries the Cash Kiosk, a
// frontier deed (D04/hex 33) and a cash purchase (C10/hex 34) open the next
// parcels, and the kiosk/savings synergy fires at hex distance 1 through the
// owned+frontier path (no relocation correction needed). The retired v0.1
// new-player boost is gone: the v0.2 settle derives customers from the board's
// net Cash, so first customers are structural. Spawned API on port 8790.

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(scriptDir, "package.json"));
dotenv.config({ path: path.resolve(scriptDir, "../.env") });

const repoRoot = path.resolve(scriptDir, "..");
const apiCwd = path.join(repoRoot, "apps", "api");
const tsxCli = path.join(path.dirname(require.resolve("tsx/package.json", { paths: [apiCwd] })), "dist", "cli.mjs");
const apiPort = 8790;
const baseUrl = `http://127.0.0.1:${apiPort}`;
const playerIds = [`onboarding-acceptance-${randomUUID()}`, `onboarding-first-settle-${randomUUID()}`];
const prisma = new PrismaClient();

const STARTER_HEX = "35"; // starter grant (D05)
const DEED_HEX = "33"; // frontier deed (D04, 0 cost, requiredLevel 4)
const PURCHASE_HEX = "34"; // cash purchase (C10, 16000 minor, requiredLevel 7)

type JsonObject = Record<string, any>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function request(pathname: string, init: RequestInit = {}, playerId?: string): Promise<JsonObject> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (playerId) headers.set("x-player-id", playerId);
  const response = await fetch(`${baseUrl}${pathname}`, { ...init, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${pathname} failed (${response.status}): ${JSON.stringify(body)}`);
  return body as JsonObject;
}

async function post(pathname: string, body: JsonObject, playerId?: string): Promise<JsonObject> {
  return request(pathname, { method: "POST", body: JSON.stringify(body) }, playerId);
}

async function waitForApi(): Promise<void> {
  // Fail fast with a clear message if a stale server still owns the port.
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
  throw new Error("Timed out waiting for the onboarding acceptance API");
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
  ] as const;
  await prisma.$transaction(async (tx) => {
    for (const delegate of delegates) {
      // @ts-expect-error dynamic delegate access for fixture cleanup
      await tx[delegate].deleteMany({ where: { playerId: { in: playerIds } } });
    }
    await tx.plotgoLand.deleteMany({ where: { playerId: { in: playerIds } } });
    await tx.player.deleteMany({ where: { id: { in: playerIds } } });
  });
}

async function runAcceptance(): Promise<void> {
  const playerId = playerIds[0]!;
  const started = await post("/api/session", { playerId });
  assert(started.plot.onboarding.guide.target === "build-cash-kiosk", "new players must start at the Cash Kiosk guide");
  assert(started.plot.onboarding.recovery.firstCustomerAssistUsed === false, "first-customer recovery must start unused");
  assert(started.plot.onboarding.recovery.freeTutorialRelocationUsed === false, "relocation recovery must start unused");
  const hexBoard = started.plot.hexBoard as JsonObject;
  assert(hexBoard.ownedCount === 1, "a fresh player owns exactly the starter parcel");
  assert((hexBoard.hexes as JsonObject[]).find((hex: JsonObject) => hex.hexId === STARTER_HEX)?.owned === true,
    `the starter hex ${STARTER_HEX} must be owned at creation`);

  // --- 1. The starter grant carries the Cash Kiosk; the first settle serves
  // real customers and records the first-customer milestone. ------------
  const firstBuild = await post("/api/plot/place", { type: "cash_kiosk", hexId: STARTER_HEX }, playerId);
  assert(firstBuild.onboarding.step === "onboarding_first_customer", "Cash Kiosk placement must advance onboarding");
  const kioskId = firstBuild.cards.find((card: JsonObject) => card.type === "cash_kiosk")?.id;
  assert(typeof kioskId === "string", "Cash Kiosk card must be present after placement");

  const firstSession = await post("/api/session/settle", { verb: "walk" }, playerId);
  assert(firstSession.receipt.transactions > 0, "the first session must produce real customer transactions");
  assert(firstSession.attributes.population > 0, "the first session must serve a positive population");
  assert(firstSession.onboarding.milestones.some((milestone: JsonObject) => milestone.id === "onboarding_first_customer"),
    "first customer milestone must be recorded");

  // --- 2. Empire growth fixture: level 8 (= 6,000 XP on the v1.0 cumulative
  // curve, XP_FOR_LEVEL[7]) opens the capacity (18 hexes) for the D04 frontier
  // deed (level 4) and the C10 cash purchase (level 7). Level and XP must stay
  // consistent because every award re-resolves the displayed level via
  // refreshProgression; the persisted "Starter" promotion flag keeps the
  // gate at level 5 passed so the displayed level holds at 8 (the player does
  // not meet the gate's hex/business counters). The XP award paths themselves
  // are covered by the hex/progression suites. ------------------------------
  await prisma.player.update({ where: { id: playerId }, data: { empireXp: 6000, empireLevel: 8, promotions: ["Starter"] } });

  // --- 3. Owned+frontier path: deed-grant the frontier parcel first, then
  // buy the neighboring parcel; both acquisitions come through the API. ---
  const deed = await post("/api/land/acquire", { hexId: DEED_HEX }, playerId);
  assert(deed.ownedCount === 2, "the D04 deed must raise ownedCount to 2");
  assert(deed.ownership.method === "frontier_deed" && deed.ownership.priceMinor === 0, "D04 must be a free frontier deed");
  // A risk-event settle can drain a fresh account below the parcel price, so
  // top up for a deterministic debit assertion (the acquire path runs no
  // offline catch-up, so the balance delta is exactly the price). C10 costs
  // 16000 Cash = 1_600_000 minor.
  await prisma.player.update({ where: { id: playerId }, data: { cashMinor: 5_000_000 } });
  const cashBeforePurchase = Number((await prisma.player.findUnique({ where: { id: playerId }, select: { cashMinor: true } }))!.cashMinor);
  const purchase = await post("/api/land/acquire", { hexId: PURCHASE_HEX }, playerId);
  assert(purchase.ownedCount === 3, "the C10 purchase must raise ownedCount to 3");
  assert(purchase.ownership.method === "cash_purchase" && purchase.ownership.priceMinor === 1_600_000,
    `C10 must cost exactly 16000 Cash (1.6M minor), got ${JSON.stringify(purchase.ownership)}`);
  const cashAfterPurchase = Number((await prisma.player.findUnique({ where: { id: playerId }, select: { cashMinor: true } }))!.cashMinor);
  assert(cashAfterPurchase === cashBeforePurchase - 1_600_000, `C10 purchase must debit exactly 1.6M minor, got ${cashBeforePurchase - cashAfterPurchase}`);
  assert(hexDistance(STARTER_HEX, DEED_HEX) === 1 && hexDistance(STARTER_HEX, PURCHASE_HEX) === 1,
    "both new parcels must sit at hex distance 1 from the kiosk");

  // --- 4. Trading Booth on the purchased parcel. -------------------------
  const secondBuild = await post("/api/plot/place", { type: "trading_booth", hexId: PURCHASE_HEX }, playerId);
  assert(secondBuild.onboarding.step === "onboarding_third_business", "Trading Booth placement must advance onboarding");

  // --- 5. Savings Stand placed directly at hex distance 1 from the kiosk
  // (owned via the deed) fires the tutorial synergy on placement. ---------
  const thirdBuild = await post("/api/plot/place", { type: "savings_stand", hexId: DEED_HEX }, playerId);
  const savingsId = thirdBuild.cards.find((card: JsonObject) => card.type === "savings_stand")?.id;
  assert(typeof savingsId === "string", "Savings Stand card must be present after placement");
  assert(thirdBuild.onboarding.step === "onboarding_first_upgrade", "distance-1 kiosk/savings adjacency must record the synergy and advance onboarding");
  assert(thirdBuild.onboarding.milestones.some((milestone: JsonObject) => milestone.id === "onboarding_first_synergy"),
    "first synergy milestone must be recorded from the distance-1 placement");
  assert(thirdBuild.onboarding.recovery.freeTutorialRelocationUsed === false,
    "placing directly at distance 1 must not consume the relocation correction");
  const links = (thirdBuild.placement.links as JsonObject[]) ?? [];
  assert(links.some((link: JsonObject) => link.rule === "cash_kiosk+savings_stand"),
    `placement links must include the kiosk/savings rule: ${JSON.stringify(links)}`);

  // --- 6. First settle on a fresh account (second player): v0.2 derives
  // customers from the board's net Cash, so first customers are structural
  // even with a damaged reputation — no boost window, no demand-assist SLA. -
  const freshPlayer = playerIds[1]!;
  const freshSession = await post("/api/session", { playerId: freshPlayer });
  assert(freshSession.plot.hexBoard.ownedCount === 1, "fresh fixture player owns the starter parcel");
  await post("/api/plot/place", { type: "cash_kiosk", hexId: STARTER_HEX }, freshPlayer);
  await prisma.player.update({ where: { id: freshPlayer }, data: { reputationBps: -28_200 } });
  const firstSettle = await post("/api/session/settle", { verb: "walk" }, freshPlayer);
  assert(firstSettle.attributes.population > 0, "a fresh kiosk board must serve customers on the very first settle");
  assert(firstSettle.receipt.transactions > 0, "a fresh kiosk board must record transactions on the very first settle");
  assert(Array.isArray(firstSettle.receipt.onboardingRecovery), "settle receipt must expose the (empty) recovery path");
  assert(firstSettle.onboarding.milestones.some((milestone: JsonObject) => milestone.id === "onboarding_first_customer"),
    "first customer milestone must be recorded on the fresh path");

  console.log("onboarding acceptance passed: starter-grant first build + settle, frontier deed + cash purchase through the API, Trading Booth + distance-1 Savings Stand synergy via the owned+frontier path (no relocation correction), and structural first customers on a fresh account");
}

async function main(): Promise<void> {
  let server: ChildProcess | undefined;
  try {
    server = spawn(process.execPath, [tsxCli, "src/index.ts"], {
      cwd: apiCwd,
      env: { ...process.env, PORT: String(apiPort) },
      stdio: "ignore",
    });
    await waitForApi();
    await runAcceptance();
  } finally {
    if (server && !server.killed) {
      if (process.platform === "win32" && server.pid) execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
      else server.kill();
    }
    await cleanupFixtures();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
