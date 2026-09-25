import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

// Load the repo-root .env so DATABASE_URL is available for the fixture client
// and inherited by the spawned API server.
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(scriptDir, "package.json"));
dotenv.config({ path: path.resolve(scriptDir, "../.env") });

const repoRoot = path.resolve(scriptDir, "..");
const apiCwd = path.join(repoRoot, "apps", "api");
const tsxCli = path.join(path.dirname(require.resolve("tsx/package.json", { paths: [apiCwd] })), "dist", "cli.mjs");
const apiPort = 8790;
const baseUrl = `http://127.0.0.1:${apiPort}`;
const playerIds = [`onboarding-acceptance-${randomUUID()}`, `onboarding-assist-${randomUUID()}`];
const prisma = new PrismaClient();

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

async function mutateAssistFixture(playerId: string): Promise<void> {
  await prisma.player.update({
    where: { id: playerId },
    data: {
      onboardingStartedAt: Date.now() - 3 * 60_000,
      reputationBps: -28200,
      lastMeaningfulActionAt: Date.now(),
    },
  });
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
    await tx.player.deleteMany({ where: { id: { in: playerIds } } });
  });
}

async function runAcceptance(): Promise<void> {
  const playerId = playerIds[0]!;
  const started = await post("/api/session", { playerId });
  assert(started.plot.onboarding.guide.target === "build-cash-kiosk", "new players must start at the Cash Kiosk guide");
  assert(started.plot.onboarding.recovery.firstCustomerAssistUsed === false, "first-customer recovery must start unused");
  assert(started.plot.onboarding.recovery.freeTutorialRelocationUsed === false, "relocation recovery must start unused");

  const firstBuild = await post("/api/plot/place", { type: "cash_kiosk", x: 0, y: 0 }, playerId);
  assert(firstBuild.onboarding.step === "onboarding_first_customer", "Cash Kiosk placement must advance onboarding");
  const kioskId = firstBuild.cards.find((card: JsonObject) => card.type === "cash_kiosk")?.id;
  assert(typeof kioskId === "string", "Cash Kiosk card must be present after placement");

  const firstSession = await post("/api/session/settle", { verb: "walk" }, playerId);
  assert(firstSession.receipt.transactions > 0, "the first session must produce real customer transactions");
  assert(firstSession.onboarding.milestones.some((milestone: JsonObject) => milestone.id === "onboarding_first_customer"), "first customer milestone must be recorded");

  const secondBuild = await post("/api/plot/place", { type: "trading_booth", x: 2, y: 0 }, playerId);
  assert(secondBuild.onboarding.step === "onboarding_third_business", "Trading Booth placement must advance onboarding");
  const thirdBuild = await post("/api/plot/place", { type: "savings_stand", x: 4, y: 0 }, playerId);
  const savingsId = thirdBuild.cards.find((card: JsonObject) => card.type === "savings_stand")?.id;
  assert(typeof savingsId === "string", "Savings Stand card must be present after placement");
  assert(thirdBuild.onboarding.step === "onboarding_first_synergy", "Savings Stand placement must advance to synergy guidance");

  const corrected = await post("/api/plot/move", { cardId: savingsId, x: 1, y: 0 }, playerId);
  assert(corrected.onboarding.recovery.freeTutorialRelocationUsed === true, "the guided relocation correction must be consumed");
  assert(corrected.onboarding.step === "onboarding_first_upgrade", "Cash Kiosk/Savings Stand adjacency must record the first synergy and advance onboarding");
  assert(corrected.onboarding.milestones.some((milestone: JsonObject) => milestone.id === "onboarding_first_synergy"), "first synergy milestone must be recorded");

  const recoveryRow = await prisma.plotgoTutorialRecoveryLedger.findFirst({
    where: { playerId, kind: "free_tutorial_relocation" },
  });
  assert(recoveryRow?.kind === "free_tutorial_relocation" && Number(recoveryRow.creditedMinor) >= 0, "relocation correction must be auditable");

  const assistPlayer = playerIds[1]!;
  await post("/api/session", { playerId: assistPlayer });
  const assistBuild = await post("/api/plot/place", { type: "cash_kiosk", x: 0, y: 0 }, assistPlayer);
  assert(assistBuild.cards.length === 1, "assist fixture must have one active building");
  await mutateAssistFixture(assistPlayer);
  const assisted = await post("/api/session/settle", { verb: "walk" }, assistPlayer);
  assert(assisted.receipt.onboardingRecovery.includes("first_customer_assist"), "first-customer demand assist must be reported in the receipt");
  assert(assisted.attributes.population > 0, "demand assist must create real customer state");
  assert(assisted.onboarding.recovery.firstCustomerAssistUsed === true, "first-customer demand assist must be one-time");

  console.log("onboarding acceptance passed: first-5-minute flow, synergy correction, recovery audit, and first-customer demand assist");
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
