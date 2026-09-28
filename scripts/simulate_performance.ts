import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  allocateWeeklyPayouts,
  calculatePerformanceScore,
  eventForDay,
  buildingsUnlockedAtOrBelow,
  maxHexesForLevel,
  progressionRow,
  settleDistrict,
  BUILDING_LIST,
  RING_ORDER,
  CASH_SCALE,
  PERFORMANCE_STAGE_RULES,
  type MarketStage,
  type PerformanceMetrics,
  type PlacedCard,
} from "@plotgo/game";

// ---------------------------------------------------------------------------
// Performance runtime-target simulator (Financial_Empire_Balancing_Model_v0.2).
// One deterministic 7-day settle loop per rank on a LEGAL v0.2 board: the
// mid-band level of the rank's level band, maxHexesForLevel(level) hexes
// occupied by the highest-net buildings unlocked at or below that level
// (duplicates cycle the unlocked catalog when the catalog is smaller than the
// hex count, as the place route allows), stage-mixed toward the workbook's
// expectedAvgStage. The measured weekly aggregates are written into
// PERFORMANCE_RUNTIME_TARGETS in packages/game/src/performance.ts and compared
// against the workbook cash-flow anchors (Level Cash Flow sheet):
//   level 4 ≈ 549.18 Cash/day, level 8 ≈ 3739.77, level 12 ≈ 16376.85
// (these are the land-acquisition sheet's expectedNetAtUnlock projections for
// parcels gating at those levels: D04, and the level-8/12 cash purchases).
// ---------------------------------------------------------------------------

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const performanceTsPath = path.resolve(scriptDir, "../packages/game/src/performance.ts");

const stages: MarketStage[] = ["humble", "starter", "growing", "established", "elite", "tycoon"];
const stageLevel: Record<MarketStage, number> = { humble: 4, starter: 8, growing: 12, established: 15, elite: 19, tycoon: 24 };

/**
 * Stage mix per rank (share of the board at stage 3 / stage 2 / stage 1).
 * Humble/starter/growing mixes are tuned so the simulated weekly revenue
 * average lands inside 25% of the workbook cash-flow anchors (549.18 /
 * 3739.77 / 16376.85 Cash/day): the center-out ring placement carries a
 * ~1.28 combined fit × segment-value lift over the raw base-net sum.
 */
const STAGE_MIX: Record<MarketStage, [number, number, number]> = {
  humble: [0, 0, 1],
  starter: [0, 0.5, 0.5],
  growing: [0.1, 0.3, 0.6],
  established: [0.4, 0.4, 0.2],
  elite: [0.7, 0.3, 0],
  tycoon: [0.7, 0.3, 0],
};

/** Workbook cash-flow anchors (Cash/day) for the mid-band levels. */
const KPI_ANCHORS: Partial<Record<MarketStage, number>> = { humble: 549.18, starter: 3739.77, growing: 16376.85 };

function boardFor(stage: MarketStage): { board: PlacedCard[]; level: number } {
  const level = stageLevel[stage];
  const hexCount = maxHexesForLevel(level);
  const unlocked = new Set(buildingsUnlockedAtOrBelow(level));
  // Highest-net unlocked buildings first; cycle the catalog for duplicate cards
  // when the board has more hexes than the unlocked catalog.
  const pool = BUILDING_LIST.filter((spec) => unlocked.has(spec.id)).sort((a, b) => b.baseNetPerDay - a.baseNetPerDay);
  const picked = Array.from({ length: hexCount }, (_, index) => pool[index % pool.length]!);
  const [share3, share2] = STAGE_MIX[stage];
  const cut3 = Math.round(hexCount * share3);
  const cut2 = cut3 + Math.round(hexCount * share2);
  const board: PlacedCard[] = picked.map((spec, index) => ({
    id: `${stage}-${spec.id}-${index}`,
    type: spec.id,
    hexId: RING_ORDER[index % RING_ORDER.length]!,
    stage: (index < cut3 ? 3 : index < cut2 ? 2 : 1) as 1 | 2 | 3,
  }));
  return { board, level };
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function simulateWeek(stage: MarketStage) {
  const { board, level } = boardFor(stage);
  const playerId = `simulation-${stage}`;
  let state = { cashMinor: 1_000_000_000, reputationBps: 5_000, conditionBps: 10_000 };
  let previousPopulation = 0;
  let activityMinor = 0;
  let revenueMinor = 0;
  let populationTotal = 0;
  let newRetainedCustomers = 0;
  let utilizationTotal = 0;
  let reputationTotal = 0;
  let riskTotal = 0;
  const start = Date.UTC(2026, 8, 14);

  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const day = new Date(start + dayIndex * 86_400_000).toISOString().slice(0, 10);
    const result = settleDistrict(board, eventForDay(day, playerId), "walk", state, dayIndex + 17);
    activityMinor += result.volumeMinor;
    revenueMinor += result.revenue.reduce((sum, line) => sum + Math.max(0, line.amountMinor), 0);
    populationTotal += result.population;
    newRetainedCustomers += Math.max(0, result.population - previousPopulation);
    utilizationTotal += result.capacity > 0 ? result.population / result.capacity : 0;
    reputationTotal += result.reputationBps;
    riskTotal += result.riskBps;
    previousPopulation = result.population;
    state = { cashMinor: Math.max(0, state.cashMinor + result.cashDeltaMinor), reputationBps: result.reputationBps, conditionBps: result.conditionBps };
  }

  const metrics: PerformanceMetrics = {
    stage,
    activityMinor,
    revenueMinor,
    averageActiveCustomers: populationTotal / 7,
    newRetainedCustomers,
    averageUtilization: utilizationTotal / 7,
    reputation: reputationTotal / 7 / 100,
    riskIndex: riskTotal / 7 / 100,
    completedHunts: PERFORMANCE_STAGE_RULES[stage].huntTarget,
    activeDays: 7,
    plotAgeHours: 168,
    finalized: true,
  };
  const score = calculatePerformanceScore(metrics);
  return {
    stage,
    level,
    hexes: board.length,
    avgStage: round(board.reduce((sum, card) => sum + card.stage, 0) / board.length),
    activityPerWeek: round(activityMinor / CASH_SCALE),
    revenuePerWeek: round(revenueMinor / CASH_SCALE),
    revenuePerDay: round(revenueMinor / CASH_SCALE / 7),
    activeCustomers: round(metrics.averageActiveCustomers),
    newRetainedCustomers: round(metrics.newRetainedCustomers),
    utilization: round(metrics.averageUtilization * 100, 1),
    score: score.weightedScore,
    eligible: score.eligible,
  };
}

const profiles = stages.map((stage) => simulateWeek(stage));

// --- Workbook KPI anchor comparison (level 4 / 8 / 12 cash-flow model) -------
console.log("KPI comparison vs workbook cash-flow anchors (25% tolerance):");
for (const profile of profiles) {
  const anchor = KPI_ANCHORS[profile.stage];
  if (anchor == null) continue;
  const variance = (profile.revenuePerDay - anchor) / anchor;
  const ok = Math.abs(variance) <= 0.25;
  console.log(`  ${profile.stage} (L${profile.level}): sim ${profile.revenuePerDay}/day vs workbook ${anchor}/day -> ${(variance * 100).toFixed(1)}% ${ok ? "OK" : "OUT OF BAND"}`);
  if (!ok) throw new Error(`${profile.stage} weekly revenue average diverged >25% from the workbook anchor`);
}

// --- Persist the new runtime targets into packages/game/src/performance.ts ---
const targets = Object.fromEntries(profiles.map((profile) => [profile.stage, {
  activityPerWeek: profile.activityPerWeek,
  revenuePerWeek: profile.revenuePerWeek,
  activeCustomers: profile.activeCustomers,
  newRetainedCustomers: profile.newRetainedCustomers,
}]));

let source = fs.readFileSync(performanceTsPath, "utf8");
const lines: string[] = [];
lines.push("  humble: { activityPerWeek: " + targets.humble!.activityPerWeek + ", revenuePerWeek: " + targets.humble!.revenuePerWeek + ", activeCustomers: " + targets.humble!.activeCustomers + ", newRetainedCustomers: " + targets.humble!.newRetainedCustomers + " },");
lines.push("  starter: { activityPerWeek: " + targets.starter!.activityPerWeek + ", revenuePerWeek: " + targets.starter!.revenuePerWeek + ", activeCustomers: " + targets.starter!.activeCustomers + ", newRetainedCustomers: " + targets.starter!.newRetainedCustomers + " },");
lines.push("  growing: { activityPerWeek: " + targets.growing!.activityPerWeek + ", revenuePerWeek: " + targets.growing!.revenuePerWeek + ", activeCustomers: " + targets.growing!.activeCustomers + ", newRetainedCustomers: " + targets.growing!.newRetainedCustomers + " },");
lines.push("  established: { activityPerWeek: " + targets.established!.activityPerWeek + ", revenuePerWeek: " + targets.established!.revenuePerWeek + ", activeCustomers: " + targets.established!.activeCustomers + ", newRetainedCustomers: " + targets.established!.newRetainedCustomers + " },");
lines.push("  elite: { activityPerWeek: " + targets.elite!.activityPerWeek + ", revenuePerWeek: " + targets.elite!.revenuePerWeek + ", activeCustomers: " + targets.elite!.activeCustomers + ", newRetainedCustomers: " + targets.elite!.newRetainedCustomers + " },");
lines.push("  tycoon: { activityPerWeek: " + targets.tycoon!.activityPerWeek + ", revenuePerWeek: " + targets.tycoon!.revenuePerWeek + ", activeCustomers: " + targets.tycoon!.activeCustomers + ", newRetainedCustomers: " + targets.tycoon!.newRetainedCustomers + " },");
const targetBlock = "export const PERFORMANCE_RUNTIME_TARGETS: Record<MarketStage, {\n  activityPerWeek: number;\n  revenuePerWeek: number;\n  activeCustomers: number;\n  newRetainedCustomers: number;\n}> = {\n" + lines.join("\n") + "\n};";

const withoutRegen = source.replace(/\n\/\/ REGEN \(Phase 4\):[\s\S]*?const V02_TARGET_SCALE = [^\n]+;\n/, "\n");
const docComment = "/**\n * Runtime targets generated by scripts/simulate_performance.ts from a\n * deterministic seven-day settle on legal v0.2 boards (mid-band level of each\n * rank, maxHexesForLevel hexes, highest-net buildings unlocked at or below the\n * level, stage mix toward the workbook expectedAvgStage). Targets are in Cash\n * units (calculatePerformanceScore divides minor-unit metrics by CASH_SCALE\n * before comparing).\n */";
const docPattern = /\/\*\*\n \* Runtime targets generated[\s\S]*?\*\/\n(?=export const PERFORMANCE_RUNTIME_TARGETS)/;
if (!docPattern.test(withoutRegen)) throw new Error("performance.ts: could not locate the runtime-targets doc comment");
const withoutDoc = withoutRegen.replace(docPattern, docComment + "\n");
const targetPattern = /export const PERFORMANCE_RUNTIME_TARGETS[\s\S]*?\n\};/;
if (!targetPattern.test(withoutDoc)) throw new Error("performance.ts: could not locate PERFORMANCE_RUNTIME_TARGETS");
const replaced = withoutDoc.replace(targetPattern, targetBlock);
if (replaced.includes("REGEN")) throw new Error("performance.ts: REGEN scaling leftovers must be removed");
fs.writeFileSync(performanceTsPath, replaced);
console.log(`\nwrote PERFORMANCE_RUNTIME_TARGETS -> ${path.relative(repoRootOf(scriptDir), performanceTsPath).replace(/\\/g, "/")}`);
function repoRootOf(dir: string): string { return path.resolve(dir, ".."); }

console.log(JSON.stringify({ kind: "v02-runtime-targets", profiles }, null, 2));

// Payout cohort sanity on the fresh targets (unchanged allocator rules).
const entries = profiles.flatMap((profile) => {
  const count = profile.stage === "humble" ? 600 : profile.stage === "starter" ? 400 : profile.stage === "growing" ? 250 : profile.stage === "established" ? 150 : profile.stage === "elite" ? 80 : 40;
  return Array.from({ length: count }, (_, index) => ({
    id: `${profile.stage}-${index}`,
    stage: profile.stage,
    score: profile.score * (0.82 + (index % 37) / 100),
  }));
});
const payouts = allocateWeeklyPayouts(entries);
const payoutSummary = stages.map((stage) => {
  const values = entries.filter((entry) => entry.stage === stage).map((entry) => payouts.get(entry.id) ?? 0);
  return values.length ? {
    stage,
    players: values.length,
    pool: values.reduce((sum, value) => sum + value, 0),
    average: round(values.reduce((sum, value) => sum + value, 0) / values.length),
    min: Math.min(...values),
    max: Math.max(...values),
  } : { stage, players: 0, pool: 0, average: 0, min: 0, max: 0 };
});
console.log(JSON.stringify({ kind: "payout-cohort", eligible: entries.length, totalPayout: [...payouts.values()].reduce((sum, value) => sum + value, 0), payoutSummary }, null, 2));
