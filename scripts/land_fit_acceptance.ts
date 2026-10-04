import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import {
  BUILDING_LIST,
  HEXES,
  LAND_ACQUISITION_ORDER,
  STARTER_HEX_ID,
  frontierHexIds,
  hexAttribute,
  hexForParcel,
  landPrice,
  parcelForHex,
  placementFitMultiplier,
} from "@plotgo/game";

// Land & placement-fit acceptance (Financial_Empire_Balancing_Model_v0.2):
// the full 35-parcel land table served by GET /api/land must mirror the
// canonical game package (LVI within 0.1, grades, price schedule, trophy
// gate, acquisition order), and the placement-fit projection must reproduce
// hand-computed workbook values on sampled building × hex pairs. Spawned API
// on port 8798.

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(scriptDir, "package.json"));
dotenv.config({ path: path.resolve(scriptDir, "../.env") });

const repoRoot = path.resolve(scriptDir, "..");
const apiCwd = path.join(repoRoot, "apps", "api");
const tsxCli = path.join(path.dirname(require.resolve("tsx/package.json", { paths: [apiCwd] })), "dist", "cli.mjs");
const apiPort = 8798;
const baseUrl = `http://127.0.0.1:${apiPort}`;
const playerId = `land-fit-${randomUUID()}`;
const playerIds = [playerId];
const prisma = new PrismaClient();

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
  throw new Error("Timed out waiting for the land-fit acceptance API");
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
    for (const delegate of delegates) {
      // @ts-expect-error dynamic delegate access for fixture cleanup
      await tx[delegate].deleteMany({ where: { playerId: { in: playerIds } } });
    }
    await tx.plotgoLand.deleteMany({ where: { playerId: { in: playerIds } } });
    await tx.player.deleteMany({ where: { id: { in: playerIds } } });
  });
}

// Hand-computed workbook projections:
//   fit = clamp(0.8, 1.25, round5dp(1 + acqSens×(acquisitionMod−1)
//         + premiumSens×(premiumMixMod−1) + effSens×(efficiencyMod−1)
//         + riskSens×(riskMod−1)))
// (category sensitivities from v02/affinities.json, hex mods from
// v02/hex_balance.json; values computed independently of the engine).
const HAND_COMPUTED_FIT: { category: string; hexId: string; expected: number }[] = [
  { category: "Retail Finance", hexId: "35", expected: 1.00232 }, // kiosk on D05 (workbook example)
  { category: "Banking & Savings", hexId: "11", expected: 1.10372 }, // A01 Prime
  { category: "Treasury, Vault & Custody", hexId: "24", expected: 1.01419 }, // C07 Entry
  { category: "Institutional Finance", hexId: "16", expected: 1.14138 }, // A04 Trophy
  { category: "Research, Data & Fintech", hexId: "33", expected: 1.01549 }, // D04 Entry
];

async function runAcceptance(): Promise<void> {
  // Fresh player (the session route grants the starter parcel).
  const session = await request("/api/session", { method: "POST", body: JSON.stringify({ playerId }) });
  assert(session.status === undefined || session.status === 200, `session bootstrap failed: ${JSON.stringify(session)}`);

  // --- 1. Full land table via the API mirrors the canonical game package. ---
  const land = await request("/api/land", {}, playerId);
  assert(land.status === 200, `GET /api/land must 200: ${JSON.stringify(land)}`);
  assert(land.ownedCount === 1 && land.capacityForLevel === 1 && land.empireLevel === 1, "fresh land view diverged");
  const apiHexes = land.hexes as JsonObject[];
  assert(apiHexes.length === 35, `land view must hold 35 parcels, got ${apiHexes.length}`);
  const grades: Record<string, number> = {};
  for (const row of apiHexes) {
    const attr = hexAttribute(row.hexId as string);
    assert(attr, `hex ${row.hexId} missing from the canonical balance table`);
    assert(Math.abs((row.lvi as number) - attr.lvi) <= 0.1, `LVI mismatch on ${row.hexId}: api=${row.lvi} workbook=${attr.lvi}`);
    assert(row.grade === attr.grade, `grade mismatch on ${row.hexId}: api=${row.grade} workbook=${attr.grade}`);
    assert(row.parcelId === attr.parcelId && parcelForHex(row.hexId as string) === row.parcelId,
      `parcel mapping mismatch on hex ${row.hexId}`);
    const price = landPrice(attr.parcelId);
    assert(price, `missing price row for ${attr.parcelId}`);
    assert((row.price as JsonObject).cost === price.cost
      && (row.price as JsonObject).requiredLevel === price.requiredLevel
      && (row.price as JsonObject).method === price.method,
      `price row mismatch on ${attr.parcelId}: api=${JSON.stringify(row.price)} workbook=${JSON.stringify(price)}`);
    grades[row.grade as string] = (grades[row.grade as string] ?? 0) + 1;
  }
  assert(grades.Entry === 6 && grades.Growth === 7 && grades.Premium === 12 && grades.Prime === 9 && grades.Trophy === 1,
    `grade distribution diverged: ${JSON.stringify(grades)}`);

  // --- 2. Acquisition order: unique, covers all 35, requiredLevel
  // non-decreasing, first parcel is the starter grant. --------------------
  assert(LAND_ACQUISITION_ORDER.length === 35 && new Set(LAND_ACQUISITION_ORDER).size === 35, "acquisition order must cover 35 unique parcels");
  let previousLevel = 0;
  for (const parcelId of LAND_ACQUISITION_ORDER) {
    const price = landPrice(parcelId)!;
    assert(price.requiredLevel >= previousLevel, `requiredLevel must be non-decreasing across the acquisition order at ${parcelId}`);
    previousLevel = price.requiredLevel;
  }
  assert(landPrice(LAND_ACQUISITION_ORDER[0]!)!.method === "Starter Grant" && hexForParcel(LAND_ACQUISITION_ORDER[0]!) === STARTER_HEX_ID,
    "order 1 must be the starter grant on hex 35");
  for (let order = 1; order <= 6; order++) {
    const row = LAND_ACQUISITION_ORDER.map((parcelId) => landPrice(parcelId)!).find((price) => price.order === order)!;
    assert(row.cost === 0, `order-${order} parcel ${row.parcelId} must be free`);
  }

  // --- 3. Trophy gate: exactly one Trophy parcel, A04 @ level 12 for
  // 247800 Cash, and the rareRequiredLevel mirror agrees. ------------------
  const trophyParcels = LAND_ACQUISITION_ORDER.filter((parcelId) => landPrice(parcelId)!.grade === "Trophy");
  assert(trophyParcels.length === 1 && trophyParcels[0] === "A04", `expected exactly the A04 trophy, got ${trophyParcels.join(",")}`);
  const trophyHex = hexForParcel("A04")!;
  const trophyPrice = landPrice("A04")!;
  assert(trophyHex === "16" && trophyPrice.cost === 247_800 && trophyPrice.requiredLevel === 12,
    `A04 trophy gate diverged: ${JSON.stringify(trophyPrice)}`);
  assert(hexAttribute(trophyHex)!.rareRequiredLevel === 12, "A04 rareRequiredLevel must gate at 12");
  const apiTrophy = apiHexes.find((row) => row.hexId === trophyHex);
  assert(apiTrophy.grade === "Trophy" && (apiTrophy.price as JsonObject).requiredLevel === 12
    && (apiTrophy.price as JsonObject).cost === 247_800, "API trophy row diverged");

  // --- 4. Frontier flags on the fresh board match the game's frontier set. -
  const expectedFrontier = new Set(frontierHexIds([STARTER_HEX_ID], 1));
  for (const row of apiHexes) {
    const isStarter = row.hexId === STARTER_HEX_ID;
    assert(row.owned === isStarter, `owned flag mismatch on ${row.hexId}`);
    assert((row.frontier === true) === expectedFrontier.has(row.hexId as string),
      `frontier flag mismatch on ${row.hexId}: api=${row.frontier} expected=${expectedFrontier.has(row.hexId as string)}`);
  }

  // --- 5. Placement projection: engine + API agree with hand-computed
  // workbook values on the sampled building × hex pairs. -------------------
  for (const sample of HAND_COMPUTED_FIT) {
    const engineFit = placementFitMultiplier(sample.category, sample.hexId);
    assert(engineFit === sample.expected, `engine fit ${sample.category}@${sample.hexId} = ${engineFit}, hand-computed ${sample.expected}`);
    const building = BUILDING_LIST.find((spec) => spec.category === sample.category)!.id;
    const fit = await request(`/api/land/fit?hexId=${sample.hexId}&type=${building}`, {}, playerId);
    assert(fit.status === 200 && fit.multiplier === sample.expected,
      `API fit ${building}@${sample.hexId} = ${fit.multiplier}, hand-computed ${sample.expected}: ${JSON.stringify(fit)}`);
    const breakdownSum = (fit.breakdown as JsonObject[]).reduce((sum: number, entry: JsonObject) => sum + entry.delta, 0);
    assert(Math.abs(1 + breakdownSum - sample.expected) < 1e-9, `fit breakdown must sum to ${sample.expected}`);
  }
  // The workbook's published example: Cash Kiosk on D05 → 1.00232 exactly.
  const kioskD05 = await request(`/api/land/fit?hexId=${STARTER_HEX_ID}&type=cash_kiosk`, {}, playerId);
  assert(kioskD05.multiplier === 1.00232, "kiosk on D05 must reproduce the workbook's 1.00232");

  // --- 6. Full-table sweep: every category × hex stays inside the workbook
  // clamp band (asserted through the game package over all 35 hexes). ------
  const categories = [...new Set(BUILDING_LIST.map((spec) => spec.category))];
  assert(categories.length === 11, `11 workbook categories expected, got ${categories.length}`);
  for (const category of categories) {
    for (const hex of HEXES) {
      const fit = placementFitMultiplier(category, hex.id);
      assert(fit >= 0.8 && fit <= 1.25, `fit ${category}@${hex.id} = ${fit} left the [0.8, 1.25] band`);
    }
  }

  console.log("land-fit acceptance passed: 35-parcel API table mirrors the workbook (LVI ≤0.1, grades 6/7/12/9/1, prices, frontier flags), acquisition order unique with non-decreasing requiredLevel + free orders 1-6 + starter grant on hex 35, single A04 trophy gate (247800 Cash @ level 12, rare gate 12), and the placement projection reproduces all five hand-computed building×hex pairs (kiosk@D05 = 1.00232) with the full 11×35 sweep inside [0.8, 1.25]");
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
