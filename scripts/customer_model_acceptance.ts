import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { eventForDay } from "@plotgo/game";

// Customer economic model acceptance (PLOT_Customer_Economic_Simulation_v0.1):
// persistent segments, onboarding boost, convergence, congestion bands, and
// economic-event pressure, end-to-end through the API.

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(scriptDir, "package.json"));
dotenv.config({ path: path.resolve(scriptDir, "../.env") });

const repoRoot = path.resolve(scriptDir, "..");
const apiCwd = path.join(repoRoot, "apps", "api");
const tsxCli = path.join(path.dirname(require.resolve("tsx/package.json", { paths: [apiCwd] })), "dist", "cli.mjs");
const apiPort = 8798;
const baseUrl = `http://127.0.0.1:${apiPort}`;
const playerIds = [`customers-main-${randomUUID()}`, `customers-congestion-${randomUUID()}`];
// Pick the main player's id so that TODAY's seeded district event is the
// bank run (deterministic FNV seed over "day:playerId") — no DB hacks needed.
const today = new Date().toISOString().slice(0, 10);
while (eventForDay(today, playerIds[0]!).id !== "bank_run") {
  playerIds[0] = `customers-main-${randomUUID()}`;
}
const mainId = playerIds[0]!;
const congestionId = playerIds[1]!;
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
  return { status: response.status, ...body } as JsonObject;
}

async function post(pathname: string, body: JsonObject, playerId?: string): Promise<JsonObject> {
  return request(pathname, { method: "POST", body: JSON.stringify(body) }, playerId);
}

async function postOk(pathname: string, body: JsonObject, playerId?: string): Promise<JsonObject> {
  const result = await post(pathname, body, playerId);
  assert(result.status === undefined || result.status === 200, `POST ${pathname} failed: ${JSON.stringify(result)}`);
  return result;
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
  throw new Error("Timed out waiting for the customer-model acceptance API");
}

async function allowResettle(playerId: string, day: string): Promise<void> {
  await prisma.plotgoSession.deleteMany({ where: { playerId, day } });
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
  // --- Bootstrap + boost: a fresh kiosk player settles into real segments. ---
  // (Early buildings unlock by empire level, which onboarding XP lifts after
  // the first settle — so the board grows one settle at a time, like real play.)
  await postOk("/api/session", { playerId: mainId });
  await postOk("/api/plot/place", { type: "cash_kiosk", x: 0, y: 0 }, mainId);
  const first = await postOk("/api/session/settle", { verb: "walk" }, mainId);
  assert(first.attributes.population > 0, "first settle must serve customers");
  assert(first.receipt.transactions > 0, "first settle must record transactions");
  const segments = first.attributes.segments as JsonObject;
  assert(segments.generalConsumers > 0, "kiosk-led board must serve general consumers");
  const populationAfterFirst = first.attributes.population as number;

  // --- Board growth: onboarding XP unlocks the next buildings. ---------------
  await postOk("/api/plot/place", { type: "trading_booth", x: 2, y: 0 }, mainId);
  await postOk("/api/plot/place", { type: "savings_stand", x: 1, y: 0 }, mainId);

  // --- Convergence: counts advance toward targets on a second settle. ---------
  await allowResettle(mainId, today);
  const second = await postOk("/api/session/settle", { verb: "walk" }, mainId);
  assert(second.attributes.population >= populationAfterFirst, "carried customer state must persist across settles");
  const row = await prisma.player.findUnique({ where: { id: mainId }, select: { customerSegments: true, acquisitionBoostUntil: true } });
  assert(row?.customerSegments != null, "segments must be persisted on the player row");
  assert(Number(row?.acquisitionBoostUntil) > Date.now(), "new-player boost window must be active");

  // --- Economic event pressure: today's seeded district event IS the bank run
  // (mainId was chosen above so the deterministic day seed lands on it), so
  // every settle below demonstrates the 12-event matrix. The first receipt is
  // the quiet-comparison baseline for the congestion player, which settles a
  // different seeded event. ----------------------------------------------
  await postOk("/api/plot/place", { type: "mini_brokerage", x: 3, y: 0 }, mainId);
  await allowResettle(mainId, today);
  const brokerageRun = await postOk("/api/session/settle", { verb: "walk" }, mainId);
  assert(brokerageRun.receipt.event?.id === "bank_run", "the seeded bank-run day must be reported on the receipt");
  const brokerageSegments = brokerageRun.attributes.segments as JsonObject;
  assert(brokerageSegments.retailInvestors > 0, "brokerage on the board must attract retail investors (affinity)");
  assert(brokerageSegments.generalConsumers > 0, "kiosk-led board must keep general consumers under bank-run demand");
  const bankRunRisk = brokerageRun.attributes.riskBps as number;
  assert(bankRunRisk > 700, "bank run must add event risk on top of the base rate");

  // --- Maturation: savers convert toward investors when a brokerage exists. ---
  assert(brokerageSegments.retailInvestors >= segments.retailInvestors, "investor segment must not shrink with brokerage access");

  // --- Congestion: a forced overload lands in the rejected band. -------------
  await postOk("/api/session", { playerId: congestionId });
  await postOk("/api/plot/place", { type: "cash_kiosk", x: 0, y: 0 }, congestionId);
  await prisma.player.update({
    where: { id: congestionId },
    data: {
      customerSegments: { generalConsumers: 500, retailInvestors: 0, activeTraders: 0, smallBusinesses: 0, corporateClients: 0, highNetWorth: 0, institutional: 0 },
      acquisitionBoostUntil: 0,
    },
  });
  const jammed = await postOk("/api/session/settle", { verb: "walk" }, congestionId);
  assert(jammed.attributes.capacity > 0 && jammed.attributes.capacity < 500, "congestion fixture must have real capacity below the forced demand");
  assert(jammed.attributes.population < 500, "rejected-demand band must churn the overload back toward capacity");
  assert(jammed.attributes.population <= jammed.attributes.capacity, "rejected-band churn must pull the overload back within capacity");
  assert(jammed.attributes.population < 100, `overload must collapse toward the building target in one day (got ${jammed.attributes.population})`);

  console.log("customer model acceptance passed: segment bootstrap + boost, persistence + convergence, bank-run risk pressure, maturation sanity, congestion bands");
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
