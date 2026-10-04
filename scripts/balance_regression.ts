import {
  BUILDING_LIST,
  CARDS,
  HEXES,
  HEX_COUNT,
  RING_ORDER,
  LAND_ACQUISITION_ORDER,
  STARTER_HEX_ID,
  XP_FOR_LEVEL,
  MAX_EMPIRE_LEVEL,
  PLACEMENT_FIT_MIN,
  PLACEMENT_FIT_MAX,
  canAcquire,
  cumulativeBuildings,
  frontierHexIds,
  hexAttribute,
  hexById,
  hexDistance,
  hexForParcel,
  hexNeighbors,
  landPrice,
  levelForXp,
  maxHexesForLevel,
  placementFitMultiplier,
  progressionRow,
  rankForLevel,
  segmentValueMultiplier,
  buildingsUnlockedAtOrBelow,
  upgradeCostMinor,
  settleDistrict,
  // Empire_Progression_System_v1.0 (canonical XP curve / gates / sources).
  DAILY_XP_CAPS,
  XP_SOURCE_BASE,
  PROMOTION_GATES,
  RANK_XP_MULTIPLIER,
  LAND_GRADE_XP_MULTIPLIER,
  REVENUE_MILESTONE_THRESHOLDS_MINOR,
  evaluateProgression,
  promotionGateForLevel,
  rankXpMultiplier,
  landGradeXpMultiplier,
  type HexGrade,
} from "@plotgo/game";
import affinities from "../packages/game/src/v02/affinities.json" with { type: "json" };

// ---------------------------------------------------------------------------
// Balance regression — Financial_Empire_Balancing_Model_v0.2 level geometry +
// Empire_Progression_System_v1.0 XP (canonical; replaces the v0.2-flat XP).
// Exact-number reproductions of the v0.2 workbook (packages/game/src/v02):
// building economics, 24-level progression geometry, the 35-parcel land table,
// placement fit, and a settle smoke test; plus the v1.0 cumulative XP curve,
// promotion gates, evaluateProgression workbook example, rank/grade multiplier
// tables, daily caps and XP source base amounts. Retired v0.1 sections (30-day
// kiosk ramp, rep/service/competition modifiers, congestion bands, Humble
// 5-building scenario, customer Model Checks) tested mechanics that no longer
// exist in the engine and were removed with them.
// ---------------------------------------------------------------------------

const fail = (message: string): never => { throw new Error(`balance regression: ${message}`); };
const assert = (condition: unknown, message: string): asserts condition => { if (!condition) fail(message); };
const approx = (actual: number, expected: number, tolerance: number, message: string) => {
  if (!(Math.abs(actual - expected) <= tolerance)) fail(`${message}: expected ${expected}, got ${actual}`);
};

// --- (a) Building economics (v02/buildings.json via the catalog) -------------
const kiosk = CARDS.cash_kiosk;
assert(kiosk.baseNetPerDay === 25, `BLD001 kiosk baseNetPerDay must be 25, got ${kiosk.baseNetDay ?? kiosk.baseNetPerDay}`);
assert(kiosk.category === "Retail Finance", "BLD001 category must be Retail Finance");
// Stage multipliers (v02/assumptions.json): 1 / 1.35 / 1.8.
approx(kiosk.baseNetPerDay * 1.35, 33.75, 1e-12, "kiosk stage-2 net must be 33.75");
approx(kiosk.baseNetPerDay * 1.8, 45, 1e-12, "kiosk stage-3 net must be 45");
assert(upgradeCostMinor("cash_kiosk", 1) === 4_375, `kiosk stage-2 upgrade must cost 4375 minor, got ${upgradeCostMinor("cash_kiosk", 1)}`);
assert(upgradeCostMinor("cash_kiosk", 2) === 9_000, `kiosk stage-3 upgrade must cost 9000 minor, got ${upgradeCostMinor("cash_kiosk", 2)}`);
assert(BUILDING_LIST.length === 50, `catalog must hold 50 buildings, got ${BUILDING_LIST.length}`);
assert(BUILDING_LIST[49]!.name === "Financial Empire Headquarters" && BUILDING_LIST[49]!.baseNetPerDay === 20_000, "BLD050 Financial Empire Headquarters must net 20000/day");
assert(BUILDING_LIST[23]!.baseNetPerDay === 520, "BLD024 spot-check must net 520/day");
assert(BUILDING_LIST[39]!.baseNetPerDay === 2_850, "BLD040 spot-check must net 2850/day");
// v0.2 workbook cost basis: stage 2 = 0.35×base×5, stage 3 = 0.45×base×8.
for (const spec of BUILDING_LIST) {
  const s2 = Math.round(spec.baseNetPerDay * 0.35 * 5 * 100) / 100;
  const s3 = Math.round(spec.baseNetPerDay * 0.45 * 8 * 100) / 100;
  approx(upgradeCostMinor(spec.id, 1) / 100, s2, 0.011, `${spec.id} stage-2 upgrade diverged from 0.35×base×5`);
  approx(upgradeCostMinor(spec.id, 2) / 100, s3, 0.011, `${spec.id} stage-3 upgrade diverged from 0.45×base×8`);
  assert(spec.baseNetPerDay > 0, `${spec.id} must have a positive base net`);
}

// --- (b) Progression (v02/progression.json) ---------------------------------
assert(MAX_EMPIRE_LEVEL === 24, "v0.2 caps the empire at 24 levels");
assert(XP_FOR_LEVEL.length === 24, "XP table must cover 24 levels");
let unlockSum = 0;
for (let level = 1; level <= 24; level++) unlockSum += progressionRow(level).unlocksThisLevel;
assert(unlockSum === 50, `unlock counts must sum to the 50-building catalog, got ${unlockSum}`);
assert(cumulativeBuildings(1) === 2, "level 1 unlocks 2 buildings");
assert(cumulativeBuildings(4) === 10, "level 4 unlocks 10 buildings");
assert(cumulativeBuildings(12) === 30, "level 12 unlocks 30 buildings");
assert(cumulativeBuildings(24) === 50, "level 24 unlocks all 50 buildings");
const expectedMaxHexes = [1, 2, 4, 6, 8, 11, 14, 18, 22, 26, 30, 35];
for (let level = 1; level <= 24; level++) {
  const expected = level <= 12 ? expectedMaxHexes[level - 1]! : 35;
  assert(maxHexesForLevel(level) === expected, `maxHexesForLevel(${level}) must be ${expected}, got ${maxHexesForLevel(level)}`);
}
assert(rankForLevel(4) === "humble" && rankForLevel(5) === "starter" && rankForLevel(12) === "growing"
  && rankForLevel(16) === "established" && rankForLevel(20) === "elite" && rankForLevel(24) === "tycoon",
  "rank bands must be 1-4 humble / 5-8 starter / 9-12 growing / 13-16 established / 17-20 elite / 21-24 tycoon");
assert(levelForXp(0) === 1, "0 XP is level 1");
assert(levelForXp(250) === 2, "250 XP (first v1.0 threshold) is level 2");
assert(levelForXp(249) === 1, "249 XP is still level 1");
assert(levelForXp(650) === 3, "650 XP is level 3");
assert(levelForXp(173000) === 24, "173000 XP (last v1.0 threshold) is level 24");
assert(levelForXp(173001) === 24, "XP past the table still clamps to level 24");
for (let index = 1; index < XP_FOR_LEVEL.length; index++) {
  assert(XP_FOR_LEVEL[index]! > XP_FOR_LEVEL[index - 1]!, `XP threshold ${index + 1} is not monotonic`);
}

// --- (b2) Empire progression v1.0 (v02/progression_v10.json, canonical) ------
// Promotion gates: five rank-entry gates, all allRequired, 300 XP reward each.
assert(PROMOTION_GATES.length === 5, `v1.0 defines exactly 5 promotion gates, got ${PROMOTION_GATES.length}`);
const EXPECTED_GATES = [
  { promotionTo: "Starter", requiredLevel: 5, xpThreshold: 2000, minOwnedHexes: 6, minBuiltBusinesses: 6, minStage2Plus: 2, uniqueStocks: 3 },
  { promotionTo: "Growing", requiredLevel: 9, xpThreshold: 8200, minOwnedHexes: 18, minBuiltBusinesses: 14, minStage2Plus: 5, uniqueStocks: 6 },
  { promotionTo: "Established", requiredLevel: 13, xpThreshold: 22400, minOwnedHexes: 26, minBuiltBusinesses: 22, minStage2Plus: 8, uniqueStocks: 10 },
  { promotionTo: "Elite", requiredLevel: 17, xpThreshold: 50800, minOwnedHexes: 30, minBuiltBusinesses: 30, minStage2Plus: 12, uniqueStocks: 14 },
  { promotionTo: "Tycoon", requiredLevel: 21, xpThreshold: 105000, minOwnedHexes: 32, minBuiltBusinesses: 38, minStage2Plus: 18, uniqueStocks: 18 },
] as const;
for (let index = 0; index < EXPECTED_GATES.length; index++) {
  const gate = PROMOTION_GATES[index]!;
  const expected = EXPECTED_GATES[index]!;
  assert(gate.promotionTo === expected.promotionTo && gate.requiredLevel === expected.requiredLevel
    && gate.xpThreshold === expected.xpThreshold && gate.minOwnedHexes === expected.minOwnedHexes
    && gate.minBuiltBusinesses === expected.minBuiltBusinesses && gate.minStage2Plus === expected.minStage2Plus
    && gate.uniqueStocks === expected.uniqueStocks,
    `gate ${index} diverged from the v1.0 table: ${JSON.stringify(gate)}`);
  assert(gate.allRequired === true && gate.rewardXp === 300, `gate ${gate.promotionTo} must be allRequired with a 300 XP reward`);
}
assert(promotionGateForLevel(5)?.promotionTo === "Starter", "level 5 must gate on Starter");
assert(promotionGateForLevel(9)?.promotionTo === "Growing", "level 9 must gate on Growing");
assert(promotionGateForLevel(13)?.promotionTo === "Established", "level 13 must gate on Established");
assert(promotionGateForLevel(17)?.promotionTo === "Elite", "level 17 must gate on Elite");
assert(promotionGateForLevel(21)?.promotionTo === "Tycoon", "level 21 must gate on Tycoon");
assert(promotionGateForLevel(6) === null && promotionGateForLevel(24) === null, "non-gate levels must not resolve a gate");
// Workbook simulator example, exact: xp 8450, 16 hexes, 14 businesses,
// 5 stage2+, 6 stocks, no promotions → candidate 9, displayed 8 (Growing gate
// at 9 unmet), Starter gate (at 5) passes because its requirements are met.
const workbookEval = evaluateProgression({
  xp: 8450,
  ownedHexes: 16,
  builtBusinesses: 14,
  stage2PlusBuildings: 5,
  uniqueStocks: 6,
  completedPromotions: [],
});
assert(workbookEval.candidateLevel === 9, `workbook candidate level must be 9, got ${workbookEval.candidateLevel}`);
assert(workbookEval.displayedLevel === 8, `workbook displayed level must be 8, got ${workbookEval.displayedLevel}`);
assert(workbookEval.activeGate !== null, "workbook example must surface an active gate");
assert(workbookEval.activeGate!.promotionTo === "Growing" && workbookEval.activeGate!.requiredLevel === 9,
  `workbook active gate must be Growing@9, got ${JSON.stringify(workbookEval.activeGate)}`);
assert(workbookEval.activeGate!.met === false, "workbook Growing gate must be unmet");
assert(JSON.stringify(workbookEval.activeGate!.requirements) === JSON.stringify({ ownedHexes: 18, builtBusinesses: 14, stage2PlusBuildings: 5, uniqueStocks: 6 }),
  `workbook gate requirements diverged: ${JSON.stringify(workbookEval.activeGate!.requirements)}`);
assert(JSON.stringify(workbookEval.activeGate!.progress.ownedHexes) === JSON.stringify({ current: 16, required: 18 }),
  "workbook ownedHexes progress must be 16/18");
assert(JSON.stringify(workbookEval.activeGate!.progress.builtBusinesses) === JSON.stringify({ current: 14, required: 14 }),
  "workbook builtBusinesses progress must be 14/14");
assert(JSON.stringify(workbookEval.activeGate!.progress.stage2PlusBuildings) === JSON.stringify({ current: 5, required: 5 }),
  "workbook stage2PlusBuildings progress must be 5/5");
assert(JSON.stringify(workbookEval.activeGate!.progress.uniqueStocks) === JSON.stringify({ current: 6, required: 6 }),
  "workbook uniqueStocks progress must be 6/6");
// Auto-promotion semantics: a met-but-unpersisted gate surfaces in
// justPromoted; once persisted it drops out and the displayed level advances.
assert(JSON.stringify(workbookEval.justPromoted) === JSON.stringify(["Starter"]), "workbook example must auto-promote Starter");
const starterPersisted = evaluateProgression({ xp: 8450, ownedHexes: 16, builtBusinesses: 14, stage2PlusBuildings: 5, uniqueStocks: 6, completedPromotions: ["Starter"] });
assert(starterPersisted.justPromoted.length === 0 && starterPersisted.displayedLevel === 8,
  "persisted Starter must leave Growing capping the display at 8");
const growingMet = evaluateProgression({ xp: 8450, ownedHexes: 18, builtBusinesses: 14, stage2PlusBuildings: 5, uniqueStocks: 6, completedPromotions: ["Starter"] });
assert(growingMet.displayedLevel === 9 && JSON.stringify(growingMet.justPromoted) === JSON.stringify(["Growing"]) && growingMet.activeGate === null,
  "meeting the Growing gate must display level 9 with no further active gate");
// Rank / land-grade XP multiplier tables (exact).
assert(JSON.stringify(RANK_XP_MULTIPLIER) === JSON.stringify({ Humble: 1, Starter: 1.4, Growing: 1.9, Established: 2.6, Elite: 3.5, Tycoon: 4.75 }),
  `rank multiplier table diverged: ${JSON.stringify(RANK_XP_MULTIPLIER)}`);
assert(JSON.stringify(LAND_GRADE_XP_MULTIPLIER) === JSON.stringify({ Entry: 1, Growth: 1.2, Premium: 1.5, Prime: 2, Trophy: 3 }),
  `land-grade multiplier table diverged: ${JSON.stringify(LAND_GRADE_XP_MULTIPLIER)}`);
assert(rankXpMultiplier("tycoon") === 4.75 && rankXpMultiplier("Humble") === 1 && rankXpMultiplier(undefined) === 1 && rankXpMultiplier("???") === 1,
  "rankXpMultiplier must be case-insensitive and default to 1 (Humble)");
assert(landGradeXpMultiplier("Trophy") === 3 && landGradeXpMultiplier("entry") === 1 && landGradeXpMultiplier(null) === 1,
  "landGradeXpMultiplier must be case-insensitive and default to 1 (Entry)");
// Hard daily XP caps (UTC day) and the ten canonical XP source base amounts.
assert(JSON.stringify(DAILY_XP_CAPS) === JSON.stringify({ dailyObjectiveXp: 75, dailyMarketHuntXp: 60 }),
  `daily XP caps diverged: ${JSON.stringify(DAILY_XP_CAPS)}`);
assert(JSON.stringify(XP_SOURCE_BASE) === JSON.stringify({
  construction: 100, stage2Upgrade: 50, stage3Upgrade: 100, land: 75, stockDiscovery: 40,
  stockSet: 250, revenueMilestone: 100, dailyObjective: 25, hunt: 20, promotion: 300,
}), `XP source base amounts diverged: ${JSON.stringify(XP_SOURCE_BASE)}`);
assert(REVENUE_MILESTONE_THRESHOLDS_MINOR.length === 5
  && REVENUE_MILESTONE_THRESHOLDS_MINOR[0] === 1_000 && REVENUE_MILESTONE_THRESHOLDS_MINOR[4] === 10_000_000,
  "revenue milestone tiers must span 1k..10M minor");

// --- (c) Land (v02/hex_balance.json + v02/land_prices.json) -----------------
assert(HEX_COUNT === 35, "the canonical layout must hold exactly 35 hexes");
assert(LAND_ACQUISITION_ORDER.length === 35, "the acquisition schedule must hold 35 parcels");
assert(new Set(LAND_ACQUISITION_ORDER).size === 35, "acquisition order must be unique");
const gradeCounts: Record<HexGrade, number> = { Entry: 0, Growth: 0, Premium: 0, Prime: 0, Trophy: 0 };
for (const hex of HEXES) {
  const attr = hexAttribute(hex.id);
  assert(attr, `hex ${hex.id} must carry a v0.2 balance row`);
  gradeCounts[attr.grade] += 1;
}
// Distribution verified from hex_balance.json (Entry 6 / Growth 7 / Premium 12 / Prime 9 / Trophy 1).
assert(gradeCounts.Entry === 6 && gradeCounts.Growth === 7 && gradeCounts.Premium === 12
  && gradeCounts.Prime === 9 && gradeCounts.Trophy === 1,
  `grade distribution diverged from the workbook: ${JSON.stringify(gradeCounts)}`);
// LVI attribute weights per category sum to ~1 (v02/affinities.json).
for (const row of affinities as { category: string; commerceW: number; footfallW: number; roadW: number; prestigeW: number; capitalW: number; dataW: number; securityW: number; amenityW: number }[]) {
  const sum = row.commerceW + row.footfallW + row.roadW + row.prestigeW + row.capitalW + row.dataW + row.securityW + row.amenityW;
  approx(sum, 1, 0.02, `${row.category} LVI weights must sum to 1`);
}
const a04 = landPrice("A04");
assert(a04 && a04.grade === "Trophy" && a04.cost === 247_800 && a04.requiredLevel === 12,
  `A04 must be {Trophy, 247800, requiredLevel 12}, got ${JSON.stringify(a04)}`);
assert(hexAttribute(hexForParcel("A04")!)!.rareRequiredLevel === 12, "A04 trophy rare gate must require level 12");
for (const parcelId of LAND_ACQUISITION_ORDER) {
  const price = landPrice(parcelId);
  assert(price, `missing land price row for ${parcelId}`);
  const attr = hexAttribute(price.hexId);
  assert(attr && attr.parcelId === parcelId, `parcel ${parcelId} must resolve back to its hex attribute`);
}
// Orders 1-6 are the free bootstrap parcels (1 starter grant + 5 frontier deeds).
for (let order = 1; order <= 6; order++) {
  const price = LAND_ACQUISITION_ORDER.map((parcelId) => landPrice(parcelId)!).find((row) => row.order === order)!;
  assert(price.cost === 0, `order ${order} parcel ${price.parcelId} must be free, got ${price.cost}`);
}
assert(landPrice(LAND_ACQUISITION_ORDER[0]!)!.method === "Starter Grant", "order 1 must be the starter grant");
assert(STARTER_HEX_ID === "35", `starter hex must be 35 (parcel D05), got ${STARTER_HEX_ID}`);
const starterFrontier = frontierHexIds([STARTER_HEX_ID], 2);
assert(starterFrontier.length > 0, "the starter parcel must expose a non-empty frontier");
// canAcquire cases: fresh level-1 starter OK; trophy level-gated; capacity-gated at maxHexes.
assert(canAcquire(1, 0, [], STARTER_HEX_ID).ok, "a fresh level-1 player must acquire the starter parcel");
assert(canAcquire(1, 0, [], "33").reason === "level", "a level-1 fresh player must be level-gated off the D04 deed");
const a04Hex = hexForParcel("A04")!;
assert(canAcquire(11, 5, [STARTER_HEX_ID], a04Hex).reason === "level", "A04 must be level-gated below 12");
assert(canAcquire(1, 1, [STARTER_HEX_ID], starterFrontier[0]!).reason === "capacity", "acquisition past maxHexesForLevel must report capacity");

// --- (d) Placement fit (v02/affinities.json × hex_balance.json) --------------
const fit = placementFitMultiplier("Retail Finance", STARTER_HEX_ID);
assert(fit === 1.00232, `kiosk on D05 fit must be exactly 1.00232, got ${fit}`);
const categories = [...new Set(BUILDING_LIST.map((spec) => spec.category))];
assert(categories.length === 11, `workbook defines 11 building categories, got ${categories.length}`);
for (const category of categories) {
  for (const hex of HEXES) {
    const value = placementFitMultiplier(category, hex.id);
    assert(value >= PLACEMENT_FIT_MIN && value <= PLACEMENT_FIT_MAX,
      `fit ${category}@${hex.id} = ${value} left [${PLACEMENT_FIT_MIN}, ${PLACEMENT_FIT_MAX}]`);
  }
}
// Prime (A01) must fit at least as well as Entry (C07) for most categories.
const a01Hex = hexForParcel("A01")!;
const c07Hex = hexForParcel("C07")!;
assert(hexAttribute(a01Hex)!.grade === "Prime" && hexAttribute(c07Hex)!.grade === "Entry", "A01/C07 fixture grades diverged");
let primeAtLeastEntry = 0;
for (const category of categories) {
  if (placementFitMultiplier(category, a01Hex) >= placementFitMultiplier(category, c07Hex)) primeAtLeastEntry += 1;
}
assert(primeAtLeastEntry >= categories.length - 1, `prime must fit >= entry for nearly all categories (${primeAtLeastEntry}/${categories.length})`);

// --- (e) Settle smoke: 1-card kiosk board on the starter hex -----------------
{
  const quiet = { id: "quiet_day", title: "Quiet day", description: "", activityBps: 10_000, populationBps: 10_000, riskDeltaBps: 0 };
  const settled = settleDistrict(
    [{ id: "smoke-kiosk", type: "cash_kiosk", hexId: STARTER_HEX_ID, stage: 1 }],
    quiet, "walk", { cashMinor: 1_000_000, reputationBps: 5_000, conditionBps: 10_000 }, 7,
  );
  assert(Number.isFinite(settled.cashDeltaMinor), "settle cash delta must be finite");
  assert(settled.riskBps >= 0 && settled.riskBps <= 9_500, `risk ${settled.riskBps} left [0, 9500]`);
  assert(settled.capacity >= settled.population && settled.population > 0,
    `population/capacity sanity failed: population=${settled.population} capacity=${settled.capacity}`);
  assert(settled.lines.length > 0, "settle must emit receipt lines");
  assert(settled.revenue.length === 1 && settled.revenue[0]!.amountMinor > 0, "kiosk must produce a positive revenue line");
  const expectedPopulation = Math.round(25 * 1.00232 * segmentValueMultiplier(STARTER_HEX_ID) * 2);
  assert(settled.population === expectedPopulation, `kiosk population projection diverged: ${settled.population} != ${expectedPopulation}`);
}

// --- (f) Retained hex geometry invariants ------------------------------------
assert(HEXES.length === 35 && new Set(HEXES.map((hex) => hex.id)).size === 35, "35 unique hexes required");
for (const hex of HEXES) {
  const neighbors = hexNeighbors(hex.id);
  assert(neighbors.length <= 6, `${hex.id} has degree ${neighbors.length} > 6`);
  for (const neighbor of neighbors) {
    assert(hexNeighbors(neighbor).includes(hex.id), `adjacency is not symmetric between ${hex.id} and ${neighbor}`);
  }
}
assert(hexDistance(RING_ORDER[0]!, RING_ORDER[0]!) === 0, "hexDistance identity must be 0");
for (const neighbor of hexNeighbors(RING_ORDER[0]!)) {
  assert(hexDistance(RING_ORDER[0]!, neighbor) === 1, `hexDistance(center, ${neighbor}) must be 1`);
}

console.log(`balance regression passed: v0.2 workbook reproductions — buildings (BLD001 kiosk net 25 / s2 33.75 / s3 45 / upgrades 4375+9000 minor, BLD050 20000, BLD024 520, BLD040 2850, 50-building catalog), progression geometry (24 levels, unlocks sum 50, cumulative 2/10/30/50, maxHexes 1..35 with 35 from 12, rank bands), progression v1.0 (XP curve levelForXp 0→1 / 250→2 / 650→3 / 173000→24, 5 promotion gates exact with 300 XP rewards, evaluateProgression workbook example candidate 9/displayed 8/Growing 16/18, rank multipliers 1/1.4/1.9/2.6/3.5/4.75, grade multipliers 1/1.2/1.5/2/3, daily caps 75/60, XP sources 100/50/100/75/40/250/100/25/20/300), land (35 parcels, grades 6/7/12/9/1, LVI weights ~1, A04 Trophy 247800 @12, free orders 1-6, starter 35, frontier + canAcquire level/capacity/starter gates), placement fit (kiosk@D05 = 1.00232 exactly, all 11 categories × 35 hexes within [0.8, 1.25], prime ≥ entry ${primeAtLeastEntry}/11), settle smoke (finite cash, risk in band, capacity ≥ population > 0, receipt lines), and hex geometry (35 unique, adjacency symmetric, degree ≤ 6)`);
