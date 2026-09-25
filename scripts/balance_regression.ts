import {
  BUILDING_LIST,
  CANONICAL_MODULE_CATALOG,
  CARDS,
  CUSTOMER_SEGMENTS,
  DISTRICT_EVENTS,
  ECONOMIC_EVENTS,
  EVENT_CATALOG,
  EVENT_DECISIONS,
  EVENT_MISSIONS,
  EVENT_MODULE_INTERACTIONS,
  INVEST_MAX_MINOR,
  INVEST_MIN_MINOR,
  INVEST_SHARE_BPS,
  INVEST_TERM_DAYS,
  MARKET_STAGES,
  MATURATION_FLOWS,
  NEW_PLAYER_ACQUISITION_BOOST,
  OBJECTIVE_LANES,
  OBJECTIVE_REWARD_CAP_BPS,
  OBJECTIVE_TEMPLATES,
  VISIT_ACTIONS,
  VISIT_NOTIONAL_MINOR,
  addressableDemand,
  advanceOperatingStreak,
  announcedWindowsForWeek,
  ANNOUNCED_WINDOWS_PER_WEEK,
  ANNOUNCED_WINDOW_MAX_DURATION_MS,
  ANNOUNCED_WINDOW_MIN_DURATION_MS,
  ANNOUNCED_WINDOW_MIN_GAP_MS,
  applyMaturation,
  buildingModuleProfile,
  buildingTargetCustomers,
  chooseDifficultyForAccount,
  competitionModifier,
  congestionBand,
  emptyCustomerState,
  eventForDay,
  investAmountOk,
  investMaturesDay,
  investYieldMinor,
  medianStageDailyEarnedMinor,
  moduleBuildingFamily,
  moduleRarityAllowed,
  moduleEquippable,
  moduleStageAllowed,
  newPlayerBoostMultiplier,
  objectiveRewardMinor,
  reputationModifier,
  resolveArchetype,
  resolveModuleEffects,
  serviceModifier,
  settleDistrict,
  stepCustomers,
  totalCustomers,
  utcDaysBetween,
  visitEligible,
  visitFeeMinor,
  PHASE4_INSTRUMENTS,
  applyPortfolioMarks,
  phase4Marks,
  type BuildingCategory,
  type PlacedCard,
} from "@plotgo/game";

const fail = (message: string): never => { throw new Error(`balance regression: ${message}`); };
const assert = (condition: unknown, message: string): asserts condition => { if (!condition) fail(message); };
const eras = ["humble", "starter", "growing", "established", "elite", "tycoon"] as const;
const event = eventForDay("2026-09-25", "balance-regression");
const marks = phase4Marks("2026-09-25", "balance-regression");
assert(JSON.stringify(marks) === JSON.stringify(phase4Marks("2026-09-25", "balance-regression")), "Phase 4 marks are not deterministic");
assert(marks.length === PHASE4_INSTRUMENTS.length && marks.find((mark) => mark.ticker === "CASH")?.returnBps === 0, "Phase 4 Cash mark is not zero");
assert(marks.every((mark) => mark.returnBps >= -500 && mark.returnBps <= 500), "Phase 4 mark exceeded the ±500 bps cap");
const forcedMarks = [
  { ticker: "NVDA" as const, returnBps: 500 },
  { ticker: "AAPL" as const, returnBps: -500 },
  { ticker: "TSLA" as const, returnBps: 0 },
  { ticker: "CASH" as const, returnBps: 0 },
];
const concentrated = applyPortfolioMarks([{ ticker: "NVDA", weightBps: 10_000, allocatedMinor: 10_000_000_000 }], forcedMarks);
const diversified = applyPortfolioMarks([{ ticker: "NVDA", weightBps: 5_000, allocatedMinor: 5_000_000_000 }, { ticker: "AAPL", weightBps: 5_000, allocatedMinor: 5_000_000_000 }], forcedMarks);
assert(concentrated.endAumMinor !== diversified.endAumMinor, "Different Phase 4 weights did not produce different AUM results");
assert(concentrated.feeMinor !== diversified.feeMinor, "Different Phase 4 weights did not produce different AUM fees");
assert(concentrated.endAumMinor === concentrated.preFeeAumMinor - concentrated.feeMinor, "Phase 4 fee did not reconcile book value");

function card(type: string, stage: 1 | 2 | 3 = 1, x = 0, y = 0): PlacedCard {
  return { id: `${type}-${stage}-${x}-${y}`, type, stage, x, y, orientation: 0 };
}

for (const era of eras) {
  const spec = BUILDING_LIST.find((candidate) => candidate.era === era);
  assert(spec, `missing representative building for ${era}`);
  const results = ([1, 2, 3] as const).map((stage) => settleDistrict([card(spec.id, stage)], event, "walk", { cashMinor: 1_000_000, reputationBps: 5_000, conditionBps: 10_000 }, stage * 101));
  assert(results.every((result) => Number.isFinite(result.cashDeltaMinor)), `${era} cash delta is not finite`);
  assert(results.every((result) => result.capacity > 0 && result.riskBps >= 0 && result.riskBps <= 9_500), `${era} settlement left balance bounds`);
  assert(results[1]!.capacity >= results[0]!.capacity && results[2]!.capacity >= results[1]!.capacity, `${era} stage capacity regressed`);
}

const expectedSlots = { humble: [3], starter: [3, 6], growing: [3, 7], established: [3, 6, 9], elite: [3, 6, 9], tycoon: [3, 6, 9, 11] } as const;
for (const spec of BUILDING_LIST) {
  const profile = buildingModuleProfile(spec.id);
  assert(profile.maxModuleSlots === expectedSlots[spec.era].length, `${spec.id} slot count diverged from workbook`);
  assert(JSON.stringify(profile.slotUnlockLevels) === JSON.stringify(expectedSlots[spec.era]), `${spec.id} slot unlock levels diverged from workbook`);
  assert(profile.legendaryLimit === 1, `${spec.id} Legendary limit diverged from workbook`);
  assert(profile.allowedCategories.includes("Universal"), `${spec.id} lost Universal compatibility`);
}

const trading = resolveArchetype([card("trading_booth", 1, 0, 0), card("fx_stand", 1, 1, 0)], "trading");
assert(!trading.suppressed && trading.effects.activityBps === 1_000, "pure trading board did not receive its theme bonus");
const underThreshold = resolveArchetype([card("trading_booth", 1, 0, 0), card("cash_kiosk", 1, 1, 0), card("savings_stand", 1, 2, 0)], "trading");
assert(underThreshold.suppressed && underThreshold.dominantShare < 0.4, "40% trading threshold was not enforced");
const opposing = resolveArchetype([card("trading_booth", 1, 0, 0), card("cash_kiosk", 1, 1, 0)], "trading");
assert(opposing.suppressed && opposing.reason?.includes("Banking"), "opposing banking tags did not suppress trading");
const banking = resolveArchetype([card("cash_kiosk", 1, 0, 0), card("savings_stand", 1, 1, 0)], "banking");
assert(!banking.suppressed && banking.effects.riskReliefBps === 1_000, "pure banking board did not receive its risk relief");

const byRarity = (rarity: string) => CANONICAL_MODULE_CATALOG.find((entry) => entry.rarity.toLowerCase() === rarity)!;
assert(moduleStageAllowed("cash_kiosk", byRarity("common").id), "Common module rejected on Humble building");
assert(!moduleStageAllowed("cash_kiosk", byRarity("uncommon").id), "Uncommon module bypassed Humble stage gate");
assert(moduleStageAllowed("small_fund", byRarity("uncommon").id), "Uncommon module rejected on Starter building");
assert(moduleStageAllowed("asset_office", byRarity("rare").id), "Rare module rejected on Growing building");
assert(moduleStageAllowed("securities_exchange", byRarity("epic").id), "Epic module rejected on Established building");
assert(moduleStageAllowed("global_brokerage", byRarity("legendary").id), "Legendary module rejected on Elite building");
assert(!moduleRarityAllowed("cash_kiosk", "uncommon"), "Humble building accepted an Uncommon rarity limit");
assert(moduleRarityAllowed("small_fund", "uncommon"), "Starter building rejected its Uncommon rarity limit");
assert(moduleRarityAllowed("asset_office", "rare"), "Growing building rejected its Rare rarity limit");
assert(moduleRarityAllowed("securities_exchange", "epic"), "Established building rejected its Epic rarity limit");
assert(moduleRarityAllowed("global_brokerage", "legendary"), "Elite building rejected its Legendary rarity limit");
assert(moduleEquippable("cash_kiosk", byRarity("common").id, 1), "Common Module failed the complete equip matrix");
assert(!moduleEquippable("cash_kiosk", byRarity("uncommon").id, 1), "Uncommon Module bypassed the complete equip matrix");
const universalCommon = CANONICAL_MODULE_CATALOG.find((entry) => entry.rarity === "Common" && entry.families === "All")!;
assert(moduleEquippable("trading_booth", universalCommon.id, 1), "Universal Common Module failed the Trading family matrix");

const capped = resolveModuleEffects("intl_bank", CANONICAL_MODULE_CATALOG.map((entry) => entry.id), { risk: {}, reputation: 80, serviceQuality: 80, empireStage: "tycoon" });
assert(capped.customerAcquisitionBps <= 25_000, "customer acquisition cap exceeded");
assert(capped.retentionBps <= 15_000, "retention cap exceeded");
assert(capped.capacityBps <= 20_000, "capacity cap exceeded");
assert(capped.activityEfficiencyBps <= 15_000, "activity cap exceeded");
assert(capped.operatingCostReductionBps <= 12_000, "operating cost cap exceeded");
assert(capped.serviceQualityPoints <= 10, "service quality cap exceeded");
for (const value of Object.values(capped.riskDeltas)) assert(value >= -15 && value <= 15, "risk cap exceeded");

// Phase 5 — visit/invest pure helpers.
assert(VISIT_NOTIONAL_MINOR.trade === 20_000 && VISIT_NOTIONAL_MINOR.deposit === 50_000 && VISIT_NOTIONAL_MINOR.borrow === 30_000, "visit notionals diverged from the spec");
assert(INVEST_TERM_DAYS === 3 && INVEST_SHARE_BPS === 2_500 && INVEST_MIN_MINOR === 10_000 && INVEST_MAX_MINOR === 500_000, "invest constants diverged from the spec");
for (const lineage of ["exchange", "trade", "broker"] as const) assert(visitEligible(lineage, "trade"), `${lineage} must accept the trade action`);
for (const lineage of ["fund"] as const) assert(visitEligible(lineage, "deposit"), `${lineage} must accept the deposit action`);
for (const lineage of ["bank", "lend"] as const) assert(visitEligible(lineage, "borrow"), `${lineage} must accept the borrow action`);
assert(!visitEligible("fund", "trade") && !visitEligible("vault", "deposit") && !visitEligible("broker", "borrow") && !visitEligible("research", "trade"), "ineligible lineages accepted a visit action");
for (const spec of BUILDING_LIST) {
  const eligible = VISIT_ACTIONS.some((action) => visitEligible(spec.lineage, action));
  assert(!eligible || spec.rateBps > 0, `${spec.id} is visit-eligible but has no catalog rate`);
  assert(spec.rateBps >= 0 && spec.rateBps <= 500, `${spec.id} visit rate left the 0–500 bps band`);
}
assert(visitFeeMinor("trade", CARDS.trading_booth.rateBps, 1_000_000) === Math.round(20_000 * CARDS.trading_booth.rateBps / 10_000), "trade fee did not equal notional × rate");
assert(visitFeeMinor("deposit", CARDS.small_fund.rateBps, 1_000_000) === Math.round(50_000 * CARDS.small_fund.rateBps / 10_000), "deposit fee did not equal notional × rate");
assert(visitFeeMinor("borrow", 40, 50) === 50, "visit fee was not capped at the visitor balance");
assert(visitFeeMinor("trade", 25, 0) === 0, "visit fee for a 0-balance visitor was not zero");
assert(investYieldMinor(10_000, INVEST_SHARE_BPS) === 2_500, "yield was not 25% of gross building revenue");
assert(investYieldMinor(0, INVEST_SHARE_BPS) === 0, "yield was not zero for a zero-gross building");
assert(investYieldMinor(1_000, 20_000) === 1_000, "yield share was not clamped to 100%");
assert(investMaturesDay("2026-01-30") === "2026-02-02", "maturity day was not startedDay + 3 UTC days");
assert(utcDaysBetween("2026-01-30", "2026-02-02") === INVEST_TERM_DAYS, "UTC day diff diverged from the term");
assert(investAmountOk(INVEST_MIN_MINOR) && investAmountOk(INVEST_MAX_MINOR), "invest bounds rejected the boundary amounts");
assert(!investAmountOk(INVEST_MIN_MINOR - 1) && !investAmountOk(INVEST_MAX_MINOR + 1) && !investAmountOk(10_000.5), "invest bounds accepted an out-of-range amount");

// Phase 6 — retention loop pure invariants (spec sheets 05/07/08/10/13/19).
assert(OBJECTIVE_TEMPLATES.length === 6, "objective catalog must hold exactly 6 templates");
for (const lane of OBJECTIVE_LANES) {
  const laneTemplates = OBJECTIVE_TEMPLATES.filter((template) => template.lane === lane);
  assert(laneTemplates.length >= 2 && laneTemplates.length <= 3, `objective lane ${lane} must have 2-3 templates, got ${laneTemplates.length}`);
  assert(new Set(laneTemplates.map((template) => template.id)).size === laneTemplates.length, `objective lane ${lane} has duplicate template ids`);
  assert(laneTemplates.every((template) => template.evidence.kind !== undefined), `objective lane ${lane} has a template without server evidence`);
}
for (const stage of MARKET_STAGES) {
  const median = medianStageDailyEarnedMinor(stage);
  const reward = objectiveRewardMinor(stage);
  assert(reward > 0, `objective reward for ${stage} must be positive`);
  assert(3 * reward <= Math.floor(median * (OBJECTIVE_REWARD_CAP_BPS / 10_000)), `objective reward cap exceeded for ${stage}: 3x${reward} > 5% of ${median}`);
  assert(medianStageDailyEarnedMinor(stage) === median, `median stage daily earned not stable for ${stage}`);
}
// No-direct-score / no-direct-PLOT invariant: objective rewards are Cash only.
assert(OBJECTIVE_TEMPLATES.every((template) => !/plot|score|point/i.test(template.title)), "objective template titles must not promise score or PLOT");

// Announced event calendar: deterministic, <=2/week, >=18h spacing, 8-36h duration.
const sampleWeeks = ["2026-W01", "2026-W07", "2026-W19", "2026-W33", "2026-W52", "2027-W02", "2027-W21", "2028-W40"];
for (const week of sampleWeeks) {
  const windows = announcedWindowsForWeek(week);
  assert(JSON.stringify(windows) === JSON.stringify(announcedWindowsForWeek(week)), `announced windows for ${week} are not deterministic`);
  assert(windows.length <= ANNOUNCED_WINDOWS_PER_WEEK, `announced windows for ${week} exceed 2/week`);
  for (let i = 0; i < windows.length; i++) {
    const window = windows[i]!;
    const durationMs = window.endsAt - window.startsAt;
    assert(durationMs >= ANNOUNCED_WINDOW_MIN_DURATION_MS && durationMs <= ANNOUNCED_WINDOW_MAX_DURATION_MS, `announced window duration out of the 8-36h band for ${week}`);
    if (i > 0) assert(window.startsAt - windows[i - 1]!.endsAt >= ANNOUNCED_WINDOW_MIN_GAP_MS, `announced windows for ${week} spaced <18h apart`);
  }
}

// Operating streak is cosmetic-only math: increments on consecutive eligible
// days, resets on a missed day, longest never decreases.
assert(JSON.stringify(advanceOperatingStreak(2, 4, true)) === JSON.stringify({ streak: 3, longest: 4 }), "streak did not increment on an eligible day");
assert(JSON.stringify(advanceOperatingStreak(2, 4, false)) === JSON.stringify({ streak: 0, longest: 4 }), "streak did not reset on a missed day");
assert(advanceOperatingStreak(4, 2, true).longest === 5, "longest streak did not update from a new max");
assert(advanceOperatingStreak(0, 0, true).streak === 1, "first eligible day did not start the streak at 1");

// Account-age rule (spec sheet 05): first 3 account days are Easy/Standard only.
for (const stage of MARKET_STAGES) {
  for (let seed = 0; seed < 250; seed += 17) {
    for (const age of [0, 1, 2]) {
      const difficulty = chooseDifficultyForAccount(stage, seed, age);
      assert(difficulty === "easy" || difficulty === "standard", `account-age rule violated for ${stage} seed=${seed} age=${age}: ${difficulty}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Phase 1 — canonical customer/economic model (PLOT_Customer_Economic_Simulation_v0.1).
// Reproduces the doc's published tables exactly.
// ---------------------------------------------------------------------------
const approx = (actual: number, expected: number, tolerance: number, message: string) => {
  if (!(Math.abs(actual - expected) <= tolerance)) fail(`${message}: expected ${expected}, got ${actual}`);
};

// Acquisition & Retention sheet: modifier examples.
approx(reputationModifier(55), 1.035, 1e-12, "reputation modifier at 55 diverged from the doc");
approx(reputationModifier(100), 1.35, 1e-12, "reputation modifier at 100 diverged from the doc");
approx(serviceModifier(58), 1.048, 1e-12, "service modifier at 58 diverged from the doc");
approx(serviceModifier(100), 1.3, 1e-12, "service modifier at 100 diverged from the doc");
approx(competitionModifier(1), 1, 1e-12, "competition modifier at 1 diverged from the doc");
approx(competitionModifier(2), 0.8696, 1e-4, "competition modifier at 2 diverged from the doc (0.87)");
approx(competitionModifier(4), 0.6897, 1e-4, "competition modifier at 4 diverged from the doc (0.69)");

// Capacity / congestion bands: exact doc multipliers and 80/95/100% boundaries.
const healthy = congestionBand(0.8);
assert(healthy.id === "healthy" && healthy.acquisitionMod === 1 && healthy.churnMod === 1 && healthy.satisfactionPenaltyBps === 0 && healthy.revenueEfficiency === 1, "healthy band (≤80%) diverged from the doc");
const busy = congestionBand(0.8 + 1e-9);
assert(busy.id === "busy" && congestionBand(0.95).id === "busy" && busy.acquisitionMod === 0.9 && busy.churnMod === 1.1 && busy.satisfactionPenaltyBps === -500 && busy.revenueEfficiency === 1, "busy band (80–95%) diverged from the doc");
const overloaded = congestionBand(0.95 + 1e-9);
assert(overloaded.id === "overloaded" && congestionBand(1).id === "overloaded" && overloaded.acquisitionMod === 0.7 && overloaded.churnMod === 1.35 && overloaded.satisfactionPenaltyBps === -1200 && overloaded.revenueEfficiency === 0.97, "overloaded band (95–100%) diverged from the doc");
const rejected = congestionBand(1 + 1e-9);
assert(rejected.id === "rejected" && rejected.acquisitionMod === 0.4 && rejected.churnMod === 1.75 && rejected.satisfactionPenaltyBps === -2000 && rejected.revenueEfficiency === 0.9, "rejected band (>100%) diverged from the doc");

// 30-day Cash Kiosk ramp (Acquisition & Retention sheet). The published table
// is a once-per-day recursion with no congestion multiplier (verified: day-2
// churn equals opening × 0.018 × 1.0), so the exact-number reproduction steps
// daily (subSteps: 1); stepCustomers' 96-step mode is intra-day smoothing and
// must converge to the same steady state.
{
  const kioskMod = reputationModifier(55) * serviceModifier(58);
  const targets = { ...emptyCustomerState(), generalConsumers: 52 };
  const acquisitionPerDay = { ...emptyCustomerState(), generalConsumers: 0.35 };
  const churnPerDay = { ...emptyCustomerState(), generalConsumers: 0.018 };
  const docTable: Record<number, number> = { 1: 52, 2: 51.064, 3: 50.500189168000006, 4: 50.160570947614815, 5: 49.95599783714715, 10: 49.670675931455385, 30: 49.64610119378994 };
  let state = emptyCustomerState();
  for (let day = 1; day <= 30; day++) {
    state = stepCustomers(state, {
      targets,
      acquisitionPerDay,
      churnPerDay,
      demandModifiers: { generalConsumers: kioskMod },
      boostMultiplier: day === 1 ? NEW_PLAYER_ACQUISITION_BOOST : 1,
      subSteps: 1,
    }).state;
    if (docTable[day] !== undefined) approx(state.generalConsumers, docTable[day]!, 1e-6, `kiosk ramp day ${day} diverged from the doc table`);
  }
  let smooth = emptyCustomerState();
  for (let day = 1; day <= 30; day++) {
    smooth = stepCustomers(smooth, {
      targets,
      acquisitionPerDay,
      churnPerDay,
      demandModifiers: { generalConsumers: kioskMod },
      boostMultiplier: day === 1 ? NEW_PLAYER_ACQUISITION_BOOST : 1,
      subSteps: 96,
    }).state;
  }
  approx(smooth.generalConsumers, docTable[30]!, 0.05, "15-min sub-stepped kiosk ramp did not converge to the doc steady state");
  approx(newPlayerBoostMultiplier(1000, 999), NEW_PLAYER_ACQUISITION_BOOST, 0, "new-player boost not active inside the 24h window");
  assert(newPlayerBoostMultiplier(1000, 1000) === 1 && newPlayerBoostMultiplier(1000, 2000) === 1, "new-player boost leaked outside the 24h window");
}

// Humble 5-building scenario (Stage Scenarios sheet): 240.40 total customers.
{
  const scenario: [string, number][] = [
    ["cash_kiosk", 48.32249400000001],
    ["trading_booth", 42.60189168000001],
    ["savings_stand", 62.750907360000014],
    ["mini_brokerage", 50.91921792000001],
    ["market_info", 35.80745616000001],
  ];
  let total = 0;
  for (const [buildingId, expected] of scenario) {
    const spec = CARDS[buildingId]!;
    const customers = buildingTargetCustomers({
      category: moduleBuildingFamily(buildingId) as BuildingCategory,
      stage: "humble",
      captureCoeff: 0.04,
      attractionMult: spec.attractionMult,
      reputation: 55,
      serviceQuality: 58,
    });
    approx(customers, expected, 1e-6, `${buildingId} expected customers diverged from the doc scenario`);
    approx(spec.lv1Capacity, { cash_kiosk: 60, trading_booth: 71, savings_stand: 85, mini_brokerage: 101, market_info: 120 }[buildingId]!, 0, `${buildingId} lv1Capacity diverged from the doc`);
    total += customers;
  }
  approx(total, 240.40196712000005, 1e-6, "Humble 5-building scenario diverged from the doc (240.40 customers)");
  approx(total / 437, 0.550118917894737, 1e-9, "Humble 5-building utilization diverged from the doc (0.5501)");
  // Weighted Stage Demand sanity: Cash Services pool on a Humble board.
  const demand = addressableDemand("Cash Services", "humble");
  approx(demand.generalConsumers + demand.retailInvestors + demand.activeTraders + demand.smallBusinesses + demand.corporateClients + demand.highNetWorth + demand.institutional, 1237.5, 1e-9, "Cash Services weighted demand diverged from the doc");
}

// Maturation flows (Customer Flow sheet): reclassify only, never create.
{
  const state = { generalConsumers: 1000, retailInvestors: 500, activeTraders: 0, smallBusinesses: 200, corporateClients: 0, highNetWorth: 100, institutional: 0 };
  const withBrokerage = applyMaturation(state, { hasBrokerageOrFund: true, satisfactionPositive: true });
  approx(withBrokerage.state.retailInvestors, 500 + 1000 * 0.004, 1e-9, "saver→investor flow diverged from the doc");
  assert(totalCustomers(withBrokerage.state) === totalCustomers(state), "maturation created or destroyed customers");
  const withoutBrokerage = applyMaturation(state, { hasBrokerageOrFund: false });
  assert(withoutBrokerage.state.retailInvestors === 500, "maturation ran without its required building");
  assert(MATURATION_FLOWS.length === 6, "doc defines exactly 6 maturation flows");
}

// Events sheet: 12 families, bounded doc modifiers, positive durations.
assert(ECONOMIC_EVENTS.length === 12 && EVENT_CATALOG.length === 12 && DISTRICT_EVENTS.length === 12, "event catalog must hold exactly the 12 economic families");
for (const event of ECONOMIC_EVENTS) {
  assert(event.durationHours > 0, `${event.id} has a non-positive duration`);
  for (const value of Object.values(event.segmentDemand)) assert(value >= 0.7 && value <= 1.5, `${event.id} segment demand multiplier ${value} left the doc's 0.7–1.5 band`);
  assert(event.revenueMod >= 0.85 && event.revenueMod <= 1.15, `${event.id} revenue modifier ${event.revenueMod} diverged from the doc band`);
  assert(event.activityMod >= 0.9 && event.activityMod <= 1.3, `${event.id} activity modifier ${event.activityMod} diverged from the doc band`);
  // Doc note: Bank Run riskMod is 1.60 — the doc is canonical, so the risk band is 0.95–1.60.
  assert(event.riskMod >= 0.95 && event.riskMod <= 1.6, `${event.id} risk modifier ${event.riskMod} diverged from the doc band`);
  const catalog = EVENT_CATALOG.find((candidate) => candidate.id === event.id);
  assert(catalog && catalog.durationHours === event.durationHours, `${event.id} catalog duration diverged from the Events sheet`);
  assert(EVENT_MODULE_INTERACTIONS[event.id] !== undefined, `${event.id} missing its module interaction mapping`);
  assert(EVENT_DECISIONS.some((decision) => decision.eventId === event.id), `${event.id} has no decision`);
  assert(catalog && EVENT_MISSIONS.some((mission) => mission.eventFamily === catalog.category), `${event.id} category ${catalog?.category} has no mission`);
}
{
  const families = new Set(ECONOMIC_EVENTS.map((event) => event.id));
  for (const decision of EVENT_DECISIONS) assert(families.has(decision.eventId as typeof ECONOMIC_EVENTS[number]["id"]), `decision ${decision.id} references a retired event`);
  const missionFamilies = new Set(EVENT_MISSIONS.map((mission) => mission.eventFamily));
  for (const category of ["Market", "Sector", "Macro", "Corporate", "Risk/Crisis"]) assert(missionFamilies.has(category), `no mission authored for the ${category} category`);
  assert(EVENT_DECISIONS.length === 18, "decision catalog should keep the 18-decision shape");
  assert(EVENT_MISSIONS.length >= 12, "each family needs at least one mission");
}

// Daily district event: deterministic, drawn from the 12 families.
assert(eventForDay("2026-09-25", "balance-regression").id === eventForDay("2026-09-25", "balance-regression").id, "eventForDay is not deterministic for a fixed (day, playerId)");
{
  const ids = new Set(DISTRICT_EVENTS.map((event) => event.id));
  for (const day of ["2026-01-01", "2026-02-14", "2026-06-30", "2026-09-25", "2026-12-31"]) {
    for (const player of ["a", "b", "balance-regression"]) assert(ids.has(eventForDay(day, player).id), "eventForDay returned an event outside the 12 families");
  }
}

// --- Doc Model Checks (Customer & Economic Simulation v0.1, Model Checks sheet) ---
// Every building baseline net-positive on a quiet day at its own stage, and
// base churn bounded under 5%/day.
{
  const quiet = { id: "quiet_day", title: "Quiet day", description: "", activityBps: 10_000, populationBps: 10_000, riskDeltaBps: 0 };
  let failures = 0;
  for (const spec of BUILDING_LIST) {
    // Operate the building at stage 3 on a board that reaches the Tycoon band
    // (empire level = Σ 1 + stage−1, clamped to 50): 46 stage-3 humble kiosks
    // lift the level; same-category competition only affects the kiosks, and
    // their upkeep is the humble-era teaching exemption.
    const board: PlacedCard[] = [{ id: "solo", type: spec.id, x: 0, y: 0, stage: 3 }];
    for (let i = 0; i < 46; i++) board.push({ id: `fill-${i}`, type: "cash_kiosk", x: 4 + (i % 8), y: Math.floor(i / 8), stage: 3 });
    let segments: import("@plotgo/game").CustomerSegments | undefined;
    let net = 0;
    for (let day = 0; day < 3; day++) {
      const settled = settleDistrict(board, quiet, "walk", { cashMinor: 1_000_000_000, reputationBps: 5_000, conditionBps: 10_000 }, day + 11, {}, {}, segments, false);
      segments = settled.segments;
      net += settled.cashDeltaMinor;
    }
    if (!(net > 0)) { failures += 1; console.error(`  net-nonpositive over 3 days: ${spec.id} -> ${net}`); }
    if (!(segments && totalCustomers(segments) > 0)) { failures += 1; console.error(`  no customers served: ${spec.id}`); }
  }
  assert(failures === 0, `${failures} buildings failed the doc net-positive check at the tycoon band`);
  const maxBaseChurn = Math.max(...CUSTOMER_SEGMENTS.map((segment) => segment.churnPerDay));
  assert(maxBaseChurn < 0.05, `max base churn ${maxBaseChurn} must stay under the doc 5% bound`);
}

console.log(`balance regression passed: ${eras.length} eras × 3 stages, archetype thresholds, rarity/stage matrix, module caps, Phase 5 visit/invest helpers, Phase 6 retention invariants (objective cap, calendar determinism, streak, account-age difficulty), Phase 1 doc-table reproductions (modifiers, congestion bands, 30-day kiosk ramp, Humble 5-building scenario, 12 economic event families), and doc Model Checks (all buildings net-positive, churn bound)`);
