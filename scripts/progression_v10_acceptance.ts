import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
// Scripts are not a workspace package, so workspace imports use repo-relative
// source paths (the API's own @plotgo/game imports resolve from apps/api).
import { landGradeXpMultiplier, landPrice, utcDay } from "../packages/game/src/index.ts";
import { awardDailyObjective, awardHunt } from "../apps/api/src/domains/player/empire.service";

// Empire_Progression_System_v1.0 acceptance: fresh-player bootstrap (75 XP land
// grant, level 1), construction XP (+100 Humble), stage-2 upgrade XP (+50),
// frontier-deed land XP (75 × grade), the 75/day objective cap and 60/day hunt
// cap, settle awarding zero XP, and the v1.0 hexBoard fields. Spawned API on
// port 8785; fixtures are cleaned up and the server is killed at the end.

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(scriptDir, "package.json"));
dotenv.config({ path: path.resolve(scriptDir, "../.env") });

const repoRoot = path.resolve(scriptDir, "..");
const apiCwd = path.join(repoRoot, "apps", "api");
const tsxCli = path.join(path.dirname(require.resolve("tsx/package.json", { paths: [apiCwd] })), "dist", "cli.mjs");
const apiPort = 8785;
const baseUrl = `http://127.0.0.1:${apiPort}`;
const playerId = `progression-v10-${randomUUID()}`;
const playerIds = [playerId];
const prisma = new PrismaClient();

const STARTER_HEX = "35"; // parcel D05, order-1 starter grant (Entry grade)
const DEED_HEX = "33"; // parcel D04, order-6 frontier deed (Entry grade, level 4)

type JsonObject = Record<string, any>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function post(pathname: string, body: JsonObject): Promise<JsonObject> {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-player-id": playerId },
    body: JSON.stringify(body),
  });
  const result = { status: response.status, ...(await response.json().catch(() => ({}))) } as JsonObject;
  assert(response.status === 200, `POST ${pathname} failed: ${JSON.stringify(result)}`);
  return result;
}

async function xpOf(): Promise<number> {
  const row = await prisma.player.findUnique({ where: { id: playerId }, select: { empireXp: true } });
  return row?.empireXp ?? -1;
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
  throw new Error("Timed out waiting for the progression v1.0 acceptance API");
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
  // --- 1. Fresh player: starter grant awards 75 × Entry = 75 XP at level 1,
  // and the v1.0 hexBoard exposes candidateLevel / activeGate. ------------
  const session = await post("/api/session", { playerId });
  const hexBoard = session.plot.hexBoard as JsonObject;
  assert(hexBoard.empireXp === 75, `bootstrap must leave 75 XP (75 × Entry), got ${hexBoard.empireXp}`);
  assert(hexBoard.empireLevel === 1, `fresh player displayed level must be 1, got ${hexBoard.empireLevel}`);
  assert(hexBoard.candidateLevel === 1, `fresh player candidate level must be 1, got ${hexBoard.candidateLevel}`);
  assert(hexBoard.activeGate === null, `no gate is active below level 5, got ${JSON.stringify(hexBoard.activeGate)}`);
  assert(hexBoard.xpForNextLevel === 250 - 75, `xpForNextLevel must be 175, got ${hexBoard.xpForNextLevel}`);
  const row = await prisma.player.findUnique({ where: { id: playerId }, select: { empireXp: true, empireLevel: true } });
  assert(row?.empireXp === 75 && row.empireLevel === 1, `persisted bootstrap state diverged: ${JSON.stringify(row)}`);

  // --- 2. Place a kiosk: +100 construction XP (Humble × 1) = 175. --------
  await silenceObjectives();
  const beforePlace = await xpOf();
  const placed = await post("/api/plot/place", { type: "cash_kiosk", hexId: STARTER_HEX });
  const kiosk = (placed.cards as JsonObject[]).find((card: JsonObject) => card.type === "cash_kiosk");
  assert(kiosk, "kiosk must be placed");
  assert((await xpOf()) - beforePlace === 100, `placing must award exactly +100, got +${(await xpOf()) - beforePlace}`);

  // --- 3. Upgrade to stage 2: +50 XP (Humble × 1) = 225. -----------------
  await silenceObjectives();
  const beforeUpgrade = await xpOf();
  const upgraded = await post("/api/plot/upgrade", { cardId: kiosk.id });
  const upgradedKiosk = (upgraded.cards as JsonObject[]).find((card: JsonObject) => card.id === kiosk.id);
  assert(upgradedKiosk?.stage === 2, "kiosk must be stage 2");
  assert((await xpOf()) - beforeUpgrade === 50, `upgrading must award exactly +50, got +${(await xpOf()) - beforeUpgrade}`);

  // --- 4. Frontier deed: 75 × grade. Fixture-bump the level so D04 (level 4)
  // is acquirable, then assert the grade-scaled award. --------------------
  const grade = landPrice("D04")!.grade;
  const expectedLandXp = Math.round(75 * landGradeXpMultiplier(grade));
  await prisma.player.update({ where: { id: playerId }, data: { empireXp: 2000, empireLevel: 4 } });
  const beforeDeed = 2000;
  const deed = await post("/api/land/acquire", { hexId: DEED_HEX });
  assert(deed.replayed === false, "first acquire must not replay");
  assert((await xpOf()) - beforeDeed === expectedLandXp, `deed must award 75 × ${grade} = ${expectedLandXp}, got +${(await xpOf()) - beforeDeed}`);
  const replayXp = await xpOf();
  const replay = await post("/api/land/acquire", { hexId: DEED_HEX });
  assert(replay.replayed === true, "re-acquire must replay");
  assert((await xpOf()) === replayXp, "replayed acquire must not re-award XP");

  // --- 5. Daily objective cap: 4 completions clamp at 75/day. ------------
  const beforeObjectives = await xpOf();
  const awards = [];
  for (let index = 0; index < 4; index++) awards.push((await awardDailyObjective(playerId)).awarded);
  assert(JSON.stringify(awards) === JSON.stringify([25, 25, 25, 0]), `objective awards must be 25/25/25/0, got ${JSON.stringify(awards)}`);
  assert((await xpOf()) - beforeObjectives === 75, `objective XP delta must be 75, got +${(await xpOf()) - beforeObjectives}`);
  const afterObjectives = await prisma.player.findUnique({ where: { id: playerId }, select: { dailyObjectiveXp: true } });
  assert(afterObjectives?.dailyObjectiveXp === 75, `dailyObjectiveXp must be 75, got ${afterObjectives?.dailyObjectiveXp}`);

  // --- 6. Daily hunt cap: 4 claims clamp at 60/day. ----------------------
  const beforeHunts = await xpOf();
  const huntAwards = [];
  for (let index = 0; index < 4; index++) huntAwards.push((await awardHunt(playerId)).awarded);
  assert(JSON.stringify(huntAwards) === JSON.stringify([20, 20, 20, 0]), `hunt awards must be 20/20/20/0, got ${JSON.stringify(huntAwards)}`);
  assert((await xpOf()) - beforeHunts === 60, `hunt XP delta must be 60, got +${(await xpOf()) - beforeHunts}`);
  const afterHunts = await prisma.player.findUnique({ where: { id: playerId }, select: { dailyHuntXp: true } });
  assert(afterHunts?.dailyHuntXp === 60, `dailyHuntXp must be 60, got ${afterHunts?.dailyHuntXp}`);

  // --- 7. Settle awards zero XP. ------------------------------------------
  // Seed the revenue milestone tracker at tier 5 so the earned_minor the settle
  // adds cannot cross a new tier — this isolates the settle route's own award
  // (the flat session-settle XP was removed; the revenue milestone is a
  // separate v1.0 source exercised by refreshProgression).
  await prisma.player.update({ where: { id: playerId }, data: { promotions: ["revenue_tier:5"] } });
  const beforeSettle = await xpOf();
  await post("/api/session/settle", { verb: "walk" });
  assert((await xpOf()) === beforeSettle, `settle must award 0 XP, got +${(await xpOf()) - beforeSettle}`);

  console.log("progression v1.0 acceptance passed: bootstrap 75 XP @ level 1, place +100, upgrade +50, deed 75×" + grade + " (=" + expectedLandXp + ") with idempotent replay, objective cap 75/day (25/25/25/0), hunt cap 60/day (20/20/20/0), settle 0 XP, hexBoard candidateLevel/activeGate");
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
