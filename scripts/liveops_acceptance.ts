import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

/** LiveOps P0–P2 acceptance: bag + campaigns + daily/business cases + notifications. */

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(scriptDir, "package.json"));
dotenv.config({ path: path.resolve(scriptDir, "../apps/api/.env") });
dotenv.config({ path: path.resolve(scriptDir, "../.env") });

const repoRoot = path.resolve(scriptDir, "..");
const apiCwd = path.join(repoRoot, "apps", "api");
const tsxCli = path.join(path.dirname(require.resolve("tsx/package.json", { paths: [apiCwd] })), "dist", "cli.mjs");
const apiPort = 8799;
const baseUrl = `http://127.0.0.1:${apiPort}`;
const playerId = `liveops-${randomUUID()}`;
const playerIds = [playerId];
const prisma = new PrismaClient();
const STARTER_HEX = "35";

type JsonObject = Record<string, any>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function request(pathname: string, init: RequestInit = {}): Promise<JsonObject> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  headers.set("x-player-id", playerId);
  const response = await fetch(`${baseUrl}${pathname}`, { ...init, headers });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, ...body } as JsonObject;
}

async function post(pathname: string, body: JsonObject): Promise<JsonObject> {
  return request(pathname, { method: "POST", body: JSON.stringify(body) });
}

async function postOk(pathname: string, body: JsonObject): Promise<JsonObject> {
  const result = await post(pathname, body);
  assert(result.status === 200, `POST ${pathname} failed: ${JSON.stringify(result)}`);
  return result;
}

async function waitForApi(): Promise<void> {
  try {
    const response = await fetch(`${baseUrl}/health`);
    if (response.ok) throw new Error(`port ${apiPort} is already serving an API; a stale test server may still be running`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("already serving")) throw error;
  }
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for the liveops acceptance API");
}

async function cleanupFixtures(): Promise<void> {
  const delegates = [
    "liveopsShopPurchase",
    "liveopsShopQuote",
    "liveopsPassClaim",
    "liveopsSeasonPass",
    "liveopsCase",
    "liveopsPity",
    "liveopsMilestoneClaim",
    "liveopsCampaignScore",
    "liveopsGrantEvent",
    "playerLiveopsItem",
    "plotgoOnboardingMilestone",
    "plotgoTutorialRecoveryLedger",
    "card",
    "fragment",
    "plotgoPosition",
    "marketHuntSlot",
    "weeklyPerformance",
    "plotgoLedger",
    "plotgoDistrictDay",
    "plotgoSession",
    "plotgoPlacementAudit",
    "plotgoPlayerEvent",
    "plotgoEventMission",
    "plotgoEventAudit",
    "plotgoModuleRewardEvent",
    "playerModuleInventory",
    "buildingModuleLoadout",
    "moduleLoadoutAudit",
    "buildingMasteryProgress",
    "modulePartsBalance",
    "modulePartsLedger",
    "moduleCraftJob",
    "plotgoOfflineSession",
    "plotgoOfflineBucket",
    "plotgoOfflineSummary",
    "plotgoObjectiveState",
    "playerDailyState",
    "notificationOutbox",
    "plotgoLand",
  ] as const;
  await prisma.$transaction(async (tx) => {
    await tx.plotgoVisit.deleteMany({ where: { OR: [{ visitorId: { in: playerIds } }, { hostId: { in: playerIds } }] } });
    await tx.plotgoInvestment.deleteMany({ where: { OR: [{ visitorId: { in: playerIds } }, { hostId: { in: playerIds } }] } });
    for (const delegate of delegates) {
      // @ts-expect-error dynamic delegate access for fixture cleanup
      await tx[delegate].deleteMany({ where: { playerId: { in: playerIds } } });
    }
    await tx.player.deleteMany({ where: { id: { in: playerIds } } });
  });
}

async function runAcceptance(): Promise<void> {
  const session = await postOk("/api/session", { playerId });
  const plot = session.plot as JsonObject;
  assert(Array.isArray(plot.liveops?.inventory), "snapshot must expose liveops.inventory");
  assert(Array.isArray(plot.liveops?.campaigns), "snapshot must expose liveops.campaigns");
  assert(plot.liveops?.cases?.dailyAvailable === true, "Daily Case must be available on a fresh day");
  const gfw = (plot.liveops.campaigns as JsonObject[]).find((campaign) => campaign.id === "global_finance_week");
  assert(gfw, "Global Finance Week must be an active campaign");

  const dailyReady = await prisma.notificationOutbox.findFirst({
    where: { playerId, type: "liveops_case_ready" },
  });
  assert(dailyReady, "Daily Case ready notification must be queued on snapshot");

  const opened = await postOk("/api/liveops/cases/open", { caseType: "daily" });
  assert(typeof opened.caseResult?.label === "string" && opened.caseResult.label.length > 0, `daily open must return a label: ${JSON.stringify(opened.caseResult)}`);
  assert(opened.liveops?.cases?.dailyAvailable === false, "Daily Case must flip unavailable after open");
  const second = await post("/api/liveops/cases/open", { caseType: "daily" });
  assert(second.status === 409, `second daily open must be 409, got ${JSON.stringify(second)}`);

  const noKey = await post("/api/liveops/cases/open", { caseType: "business" });
  assert(noKey.status === 409, `Business Case without a key must be 409, got ${JSON.stringify(noKey)}`);
  await prisma.playerLiveopsItem.create({
    data: { playerId, itemId: "business_key", quantity: 1, updatedAt: Date.now() },
  });
  const business = await postOk("/api/liveops/cases/open", { caseType: "business" });
  assert(typeof business.caseResult?.label === "string", "Business Case open must return loot");
  assert(business.liveops?.cases?.businessKeys === 0, "Business Key must be spent");

  const placed = await postOk("/api/plot/place", { type: "cash_kiosk", hexId: STARTER_HEX });
  const gfwAfter = (placed.liveops.campaigns as JsonObject[]).find((campaign) => campaign.id === "global_finance_week");
  assert((gfwAfter?.points ?? 0) >= 8, `placing during Finance Week must score points, got ${gfwAfter?.points}`);

  await prisma.liveopsCampaignScore.updateMany({
    where: { playerId, eventId: "global_finance_week" },
    data: { points: 15 },
  });
  const kiosk = (placed.cards as JsonObject[]).find((card) => card.type === "cash_kiosk");
  assert(kiosk?.id, "placed kiosk must exist");
  const upgraded = await postOk("/api/plot/upgrade", { cardId: kiosk.id });
  const gfwUp = (upgraded.liveops.campaigns as JsonObject[]).find((campaign) => campaign.id === "global_finance_week");
  const claimed = (gfwUp?.milestones as JsonObject[] | undefined)?.some((milestone) => milestone.claimed);
  assert(claimed, "crossing 16 Finance Week points must claim a milestone");
  const milestoneNote = await prisma.notificationOutbox.findFirst({
    where: { playerId, type: "liveops_milestone" },
  });
  assert(milestoneNote, "milestone grant must queue a notification");
  assert(!/profit|guaranteed|last chance/i.test(`${milestoneNote.payloadJson}`), "liveops copy must stay free of profit language");
  assert(typeof gfwUp?.rank === "number" && gfwUp.fieldSize >= 1, "campaign snapshot must include leaderboard rank");
  assert(upgraded.liveops?.pass?.seasonId, "snapshot must expose the season pass");

  const broke = await post("/api/liveops/pass/unlock", {});
  assert(broke.status === 409, `premium unlock without $PLOT must be 409, got ${JSON.stringify(broke)}`);
  await prisma.player.update({ where: { id: playerId }, data: { plotBalance: { increment: 5_000 } } });
  const unlocked = await postOk("/api/liveops/pass/unlock", {});
  assert(unlocked.liveops?.pass?.premium === true, "unlock must set premium when $PLOT is paid");
  const starter = (unlocked.liveops?.shop?.offers as JsonObject[] | undefined)?.find((offer) => offer.sku === "starter_expansion");
  assert(starter?.quoteId, "shop must quote the starter pack");
  const bought = await postOk("/api/liveops/shop/buy", { sku: "starter_expansion", quoteId: starter.quoteId });
  assert(bought.shopItem === "Starter Expansion Pack", `starter pack buy must land, got ${bought.shopItem}`);
  const replayPack = await post("/api/liveops/shop/buy", { sku: "starter_expansion", quoteId: starter.quoteId });
  assert(replayPack.status === 409, "starter pack is 1/account");
  await prisma.liveopsSeasonPass.updateMany({ where: { playerId }, data: { xp: 100 } });
  const claimedPass = await postOk("/api/liveops/pass/claim", { level: 1, track: "free" });
  assert(typeof claimedPass.passReward === "string", "free track claim must return a reward label");
  const replayClaim = await post("/api/liveops/pass/claim", { level: 1, track: "free" });
  assert(replayClaim.status === 409, "duplicate pass claim must be 409");

  await prisma.playerLiveopsItem.upsert({
    where: { playerId_itemId: { playerId, itemId: "executive_key" } },
    create: { playerId, itemId: "executive_key", quantity: 1, updatedAt: Date.now() },
    update: { quantity: { increment: 1 } },
  });
  const executive = await postOk("/api/liveops/cases/open", { caseType: "executive" });
  assert(typeof executive.caseResult?.label === "string", "Executive Case must open with a key");

  const board = await request("/api/liveops/leaderboard?eventId=global_finance_week");
  assert(board.status === 200 && Array.isArray(board.top), `leaderboard must return a top list: ${JSON.stringify(board)}`);

  console.log("liveops acceptance passed: bag + campaigns, cases, season pass, executive case, leaderboard");
}

async function main(): Promise<void> {
  let server: ChildProcess | undefined;
  try {
    const command = `"${process.execPath}" "${tsxCli}" src/index.ts`;
    server = spawn(command, {
      cwd: apiCwd,
      env: { ...process.env, PORT: String(apiPort), PLOTGO_AUTH_MODE: "dev" },
      stdio: "ignore",
      shell: true,
      windowsHide: true,
    });
    await waitForApi();
    await runAcceptance();
  } finally {
    if (server && !server.killed) {
      try {
        if (process.platform === "win32" && server.pid) {
          execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
        } else server.kill();
      } catch {
        // never mask the acceptance result
      }
    }
    await cleanupFixtures();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
