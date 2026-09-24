import {
  BUILDING_LIST,
  CANONICAL_MODULE_CATALOG,
  buildingModuleProfile,
  eventForDay,
  moduleRarityAllowed,
  moduleEquippable,
  moduleStageAllowed,
  resolveArchetype,
  resolveModuleEffects,
  settleDistrict,
  PHASE4_INSTRUMENTS,
  applyPortfolioMarks,
  phase4Marks,
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

console.log(`balance regression passed: ${eras.length} eras × 3 stages, archetype thresholds, rarity/stage matrix, and module caps`);
