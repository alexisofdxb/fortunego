import {
  BUILDING_LIST,
  calculatePerformanceScore,
  allocateWeeklyPayouts,
  eventForDay,
  PERFORMANCE_STAGE_RULES,
  settleDistrict,
  type MarketStage,
  type PerformanceMetrics,
  type PlacedCard,
} from "@plotgo/game";

const stages: MarketStage[] = ["humble", "starter", "growing", "established", "elite", "tycoon"];
const stageLevel: Record<MarketStage, number> = { humble: 5, starter: 15, growing: 25, established: 35, elite: 43, tycoon: 48 };
function boardFor(stage: MarketStage): PlacedCard[] {
  const stageIndex = stages.indexOf(stage);
  const candidates = BUILDING_LIST.filter((spec) => stages.indexOf(spec.era) <= stageIndex);
  return Array.from({ length: stageLevel[stage] }, (_, index) => ({
    id: `${stage}-${index}`,
    type: candidates[index % candidates.length]!.id,
    x: index % 10,
    y: Math.floor(index / 10),
    stage: 1 as const,
  }));
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function simulateWeek(stage: MarketStage, huntRate = 1, mature = false) {
  const board = boardFor(stage);
  const playerId = `simulation-${stage}`;
  let state = { cashMinor: 1_000_000_000, reputationBps: 5_000, conditionBps: 10_000 };
  let previousPopulation = 0;
  let activityMinor = 0;
  let revenueMinor = 0;
  let activeCustomersTotal = 0;
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
    activeCustomersTotal += result.population;
    const comparisonPopulation = mature && dayIndex === 0 ? result.population : previousPopulation;
    newRetainedCustomers += Math.max(0, result.population - comparisonPopulation);
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
    averageActiveCustomers: activeCustomersTotal / 7,
    newRetainedCustomers,
    averageUtilization: utilizationTotal / 7,
    reputation: reputationTotal / 7 / 100,
    riskIndex: riskTotal / 7 / 100,
    completedHunts: Math.round(PERFORMANCE_STAGE_RULES[stage].huntTarget * huntRate),
    activeDays: 7,
    plotAgeHours: 168,
    finalized: true,
  };
  const score = calculatePerformanceScore(metrics);
  const workbookScore = calculatePerformanceScore(metrics, "workbook");
  return {
    stage,
    level: stageLevel[stage],
    building: `${board.length} building mix`,
    activity: round(activityMinor),
    revenue: round(revenueMinor),
    customers: round(metrics.averageActiveCustomers),
    newRetained: round(metrics.newRetainedCustomers),
    utilization: round(metrics.averageUtilization * 100, 1),
    reputation: round(metrics.reputation),
    riskIndex: round(metrics.riskIndex),
    hunts: metrics.completedHunts,
    score: score.weightedScore,
    eligible: score.eligible,
    workbookScore: workbookScore.weightedScore,
    workbookEligible: workbookScore.eligible,
    reasons: score.eligibilityReasons,
    components: Object.fromEntries(Object.entries(score.components).map(([key, value]) => [key, round(value)])),
  };
}

const profiles = stages.map((stage) => simulateWeek(stage));
console.log(JSON.stringify({ kind: "representative", profiles }, null, 2));
const matureProfiles = stages.map((stage) => simulateWeek(stage, 1, true));
console.log(JSON.stringify({ kind: "mature-steady-state", profiles: matureProfiles }, null, 2));
const noHuntProfiles = stages.map((stage) => simulateWeek(stage, 0, true));
console.log(JSON.stringify({ kind: "mature-no-hunts", profiles: noHuntProfiles }, null, 2));

const entries = matureProfiles.flatMap((profile) => {
  if (!profile.eligible) return [];
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
