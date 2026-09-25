import {
  calculatePerformanceScore,
  allocateWeeklyPayouts,
  eventForDay,
  fits,
  settleDistrict,
  PERFORMANCE_STAGE_RULES,
  CASH_SCALE,
  type CustomerSegments,
  type MarketStage,
  type PerformanceMetrics,
  type PlacedCard,
} from "@plotgo/game";

const stages: MarketStage[] = ["humble", "starter", "growing", "established", "elite", "tycoon"];
const stageLevel: Record<MarketStage, number> = { humble: 5, starter: 15, growing: 25, established: 35, elite: 43, tycoon: 48 };

// Doc Stage Scenarios building lists (PLOT_Customer_Economic_Simulation_v0.1),
// upgraded so the empire level (Σ 1 + stage−1) lands in the stage band, and
// placed LEGALLY on the 12x12 board via fits() — the old version overlapped
// footprints and inflated targets past capacity.
const STAGE_BOARDS: Record<MarketStage, { type: string; stage: 1 | 2 | 3 }[]> = {
  humble: [
    { type: "cash_kiosk", stage: 1 }, { type: "trading_booth", stage: 1 },
    { type: "savings_stand", stage: 1 }, { type: "mini_brokerage", stage: 1 },
    { type: "market_info", stage: 1 },
  ],
  starter: [
    { type: "neighborhood_shop", stage: 2 }, { type: "small_brokerage", stage: 2 },
    { type: "local_savings", stage: 2 }, { type: "microfinance", stage: 2 },
    { type: "trading_room", stage: 2 }, { type: "small_research", stage: 2 },
    { type: "small_fund", stage: 2 }, { type: "services_hub", stage: 1 },
  ],
  growing: [
    { type: "community_bank", stage: 3 }, { type: "brokerage_house", stage: 3 },
    { type: "advisory_firm", stage: 3 }, { type: "asset_office", stage: 3 },
    { type: "research_center", stage: 3 }, { type: "lending_center", stage: 2 },
    { type: "wealth_office", stage: 2 }, { type: "digital_hub", stage: 2 },
    { type: "trading_house", stage: 2 }, { type: "private_vault", stage: 2 },
  ],
  established: [
    { type: "regional_bank", stage: 2 },
    { type: "stock_brokerage", stage: 3 }, { type: "fund_hq", stage: 3 },
    { type: "insurance_hq", stage: 3 }, { type: "data_center", stage: 3 },
    { type: "market_maker", stage: 3 }, { type: "private_bank", stage: 3 },
    { type: "corp_treasury", stage: 3 }, { type: "securities_exchange", stage: 3 },
    { type: "investment_bank", stage: 3 }, { type: "community_bank", stage: 3 },
  ],
  elite: [
    { type: "global_brokerage", stage: 3 }, { type: "major_am", stage: 3 },
    { type: "inst_trading", stage: 3 }, { type: "global_wealth", stage: 3 },
    { type: "exchange_tower", stage: 3 }, { type: "data_center", stage: 3 },
    { type: "market_maker", stage: 3 }, { type: "corp_treasury", stage: 3 },
    { type: "regional_bank", stage: 3 }, { type: "stock_brokerage", stage: 3 },
    { type: "fund_hq", stage: 3 }, { type: "insurance_hq", stage: 3 },
    { type: "private_bank", stage: 3 }, { type: "investment_bank", stage: 2 },
  ],
  tycoon: [
    { type: "intl_bank", stage: 3 }, { type: "sovereign_fund", stage: 3 },
    { type: "inst_trading", stage: 3 }, { type: "global_wealth", stage: 3 },
    { type: "data_center", stage: 3 }, { type: "data_center", stage: 3 },
    { type: "data_center", stage: 3 }, { type: "data_center", stage: 3 },
    { type: "data_center", stage: 3 }, { type: "data_center", stage: 3 },
    { type: "market_maker", stage: 3 }, { type: "market_maker", stage: 3 },
    { type: "market_maker", stage: 3 }, { type: "market_maker", stage: 3 },
    { type: "market_maker", stage: 3 }, { type: "market_maker", stage: 3 },
  ],
};

function boardFor(stage: MarketStage): PlacedCard[] {
  const cards: PlacedCard[] = [];
  for (const [index, entry] of STAGE_BOARDS[stage].entries()) {
    let placed = false;
    for (let y = 0; y < 12 && !placed; y++) {
      for (let x = 0; x < 12 && !placed; x++) {
        if (fits(cards, entry.type, x, y, undefined, 12, 0)) {
          cards.push({ id: `${stage}-${index}`, type: entry.type, x, y, stage: entry.stage });
          placed = true;
        }
      }
    }
    if (!placed) throw new Error(`simulation board for ${stage} cannot place ${entry.type}`);
  }
  return cards;
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
  let segments: CustomerSegments | undefined;

  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const day = new Date(start + dayIndex * 86_400_000).toISOString().slice(0, 10);
    const result = settleDistrict(board, eventForDay(day, playerId), "walk", state, dayIndex + 17, {}, {}, segments);
    segments = result.segments;
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
    // Score-consumable units: the performance score divides minor by CASH_SCALE.
    activityPoints: round(activityMinor / CASH_SCALE),
    revenue: round(revenueMinor),
    revenueCash: round(revenueMinor / CASH_SCALE),
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
