export { CASH_SCALE, STARTER_CASH_MINOR, SETTLE_MS } from "./constants.ts";
export {
  WORLD_CELLS,
  WORLD_HEX_SIZE,
  WORLD_MAX_RING,
  WORLD_VIEW,
  worldCell,
  worldHexCorners,
  worldHexPixel,
  type WorldCell,
} from "./world.ts";
export { ONBOARDING_GUIDE, ONBOARDING_MILESTONES, ONBOARDING_XP_THRESHOLDS, onboardingGuideFor, onboardingLevel, onboardingMilestone, onboardingStep, type OnboardingGuide, type OnboardingMilestone, type OnboardingStatus } from "./onboarding.ts";
export {
  DISTRICT_EVENTS,
  ECONOMIC_EVENTS,
  SESSION_VERBS,
  economicEvent,
  eventForDay,
  seedForDay,
  toDistrictEvent,
  averageSegmentDemand,
  type DistrictEvent,
  type DistrictEventId,
  type EconomicEvent,
  type EconomicEventFamily,
  type SegmentDemandKey,
  type SegmentDemandMultipliers,
  type SessionVerb,
} from "./economic_events.ts";
export {
  MAX_EMPIRE_LEVEL,
  RANK_LEVEL_BANDS,
  XP_FOR_LEVEL,
  RANK_XP_MULTIPLIER,
  LAND_GRADE_XP_MULTIPLIER,
  XP_SOURCE_BASE,
  DAILY_XP_CAPS,
  REVENUE_MILESTONE_THRESHOLDS_MINOR,
  PROMOTION_GATES,
  rankXpMultiplier,
  landGradeXpMultiplier,
  promotionGateForLevel,
  evaluateProgression,
  rankForLevel,
  maxHexesForLevel,
  buildingIdsForLevel,
  buildingsUnlockedAtOrBelow,
  cumulativeBuildings,
  levelForXp,
  clampLevel,
  progressionRow,
  type EmpireRank,
  type ProgressionRow,
  type V10Level,
  type V10Gate,
  type ProgressionCounters,
  type ProgressionState,
  type PromotionGateView,
  type ProgressionEvaluation,
} from "./progression.ts";
export {
  PLACEMENT_FIT_MIN,
  PLACEMENT_FIT_MAX,
  LAND_ACQUISITION_ORDER,
  STARTER_HEX_ID,
  canAcquire,
  frontierHexIds,
  gradeFor,
  hexAttribute,
  hexForParcel,
  landPrice,
  parcelForHex,
  placementFitMultiplier,
  type AcquireCheck,
  type HexAttribute,
  type HexGrade,
  type LandPrice,
} from "./land.ts";
export {
  BASE_OCCUPANCY,
  CUSTOMER_SEGMENT_KEYS,
  POPULATION_PER_CASH_DAY,
  TRANSACTIONS_PER_CASH_DAY,
  VOLUME_PER_CASH_DAY,
  normalizeCustomerSegments,
  offlineCatchUpMinor,
  offlineNetPerHour,
  roundCustomerSegments,
  segmentMixForHex,
  segmentValueMultiplier,
  settleDistrict,
  type CustomerSegments,
  type DistrictState,
  type LedgerLine,
  type RevenueBreakdown,
  type RevenueModel,
  type SegmentMix,
  type SettlementResult,
} from "./settle_phase2.ts";
export {
  COLLECTIONS,
  DIFFICULTY_RULES,
  MARKET_COLLECTIONS,
  MARKET_EVENT_RULES,
  MARKET_HUNTS,
  MARKET_STAGE_LABEL,
  MARKET_STAGES,
  MARKET_STOCKS,
  REWARD_VALUES_MINOR,
  STAGE_RULES,
  STOCKS,
  chooseRarity,
  collectionProgress,
  fragmentUnitsBps,
  isoWeek,
  marketStageForRank,
  marketStageForEmpireLevel,
  marketStageIndex,
  marketEventForDay,
  rewardUnitsMicros,
  rewardUnitsMicrosAtPrice,
  collectionBonuses,
  stockOf,
  weightedChoice,
  chooseDifficulty,
  chooseDifficultyForAccount,
  type CollectionDef,
  type DifficultyRule,
  type HuntDifficulty,
  type MarketCollection,
  type MarketHuntTemplate,
  type MarketEventRule,
  type MarketStage,
  type MarketStock,
  type RewardRarity,
  type StockDef,
  type StockRarity,
} from "./stocks.ts";
export {
  PHASE4_ANNUAL_AUM_FEE_BPS,
  PHASE4_DAILY_MARK_CAP_BPS,
  PHASE4_INSTRUMENTS,
  applyPortfolioMarks,
  phase4Marks,
  type Phase4DayMark,
  type Phase4Instrument,
  type Phase4Sector,
  type PortfolioMarkResult,
  type PortfolioPositionValue,
} from "./portfolio.ts";
export {
  PERFORMANCE_RULES,
  PERFORMANCE_RUNTIME_TARGETS,
  PERFORMANCE_STAGE_RULES,
  PERFORMANCE_WEIGHTS,
  DEFAULT_PERFORMANCE_TARGET_MODE,
  allocateWeeklyPayouts,
  calculatePerformanceScore,
  payoutWeight,
  utilizationIndex,
  type PerformanceMetrics,
  type PerformanceScore,
  type PerformanceTargetMode,
} from "./performance.ts";
export {
  PLACEMENT_BUILDING_COUNT,
  PLACEMENT_SYNERGIES,
  PLACEMENT_SYNERGY_RULE_COUNT,
  buildingFamily,
  resolvePlacement,
  type DistrictBonus,
  type PlacementEffect,
  type PlacementLink,
  type PlacementPenalty,
  type PlacementResolution,
  type PlacementFamily,
  type SpecialTileType,
} from "./placement_hex.ts";
export {
  HEX_COUNT,
  HEX_RING,
  HEX_STAGES,
  HEX_UNLOCK_BY_STAGE,
  HEXES,
  RING_ORDER,
  hexById,
  hexDistance,
  hexNeighbors,
  isHexId,
  stageUnlockingHex,
  unlockedHexIds,
  type HexDef,
  type HexStage,
} from "./hex.ts";
export {
  BUILDING_EVENT_SENSITIVITY,
  EVENT_CATALOG,
  EVENT_CATALOG_COUNT,
  EVENT_DECISIONS,
  EVENT_MISSIONS,
  EVENT_REWARD_RULES,
  MARKET_CYCLE_RULES,
  MARKET_CYCLE_TRANSITIONS,
  catalogModifier,
  cycleModifier,
  cycleRule,
  eventEligible,
  stackModifiers,
  stageIndex,
  type CatalogEvent,
  type EventCategory,
  type EventDecision,
  type EventMission,
  type EventModifier,
  type EventScope,
  type EventTone,
  type MarketCycleRule,
  type MarketCycleState,
} from "./event_cycle.ts";
export {
  BUILDING_LIST,
  CARDS,
  CARD_ORDER,
  CARD_UNLOCK_LEVEL,
  ERA_LABEL,
  ERA_ORDER,
  LEGACY_TYPE,
  buildingUnlockLevel,
  isUnlocked,
  lineageColor,
  resolveType,
  type CardId,
  type CardSpec,
  type Era,
  type Lineage,
} from "./buildings.ts";
export {
  BUILDING_MODULE_PROFILE_COUNT,
  EVENT_MODULE_INTERACTIONS,
  HUNT_MODULE_REWARD_RULES,
  MODULE_PART_VALUES,
  MODULE_STAGE_RULES,
  buildingModuleProfile,
  canonicalModuleCatalog,
  eventModuleInteraction,
  moduleCategoryAllowed,
  moduleEquippable,
  moduleBuildingFamily,
  moduleCompatible,
  moduleDefinition,
  moduleLockForEvent,
  moduleRarityAllowed,
  moduleRewardLabel,
  moduleRarityRank,
  moduleStageAllowed,
  moduleStageAllowedAtEmpireLevel,
  moduleSlotsForBuilding,
  moduleSlotsForRuntimeStage,
  rollEventModuleReward,
  rollHuntModuleReward,
  resolveModuleEffects,
  runtimeUpgradeLevel,
  type BuildingModuleProfile,
  type EventModuleInteraction,
  type ModuleCategory,
  type ModuleRarity,
  type ModuleReward,
  type ModuleRewardKind,
  type ModuleEffect,
  type ModuleEffectType,
  type ModuleEffectVector,
  type ModuleRuntimeContext,
  type ModuleRiskCategory,
} from "./modules.ts";
export { CANONICAL_MODULE_CATALOG, type CanonicalModuleCatalogEntry } from "./module_catalog.ts";
export {
  OBJECTIVE_LANES,
  OBJECTIVE_REWARD_CAP_BPS,
  OBJECTIVE_TEMPLATES,
  advanceOperatingStreak,
  medianStageDailyEarnedMinor,
  objectiveRewardMinor,
  objectiveTemplatesForLane,
  type ObjectiveEvidence,
  type ObjectiveLane,
  type ObjectiveTemplate,
} from "./objectives.ts";
export {
  ANNOUNCED_EVENT_POOL,
  ANNOUNCED_WINDOWS_PER_WEEK,
  ANNOUNCED_WINDOW_MAX_DURATION_MS,
  ANNOUNCED_WINDOW_MIN_DURATION_MS,
  ANNOUNCED_WINDOW_MIN_GAP_MS,
  announcedWindowsForWeek,
  currentAnnouncedWindow,
  weekMondayUtcMs,
  type AnnouncedEventWindow,
} from "./event_calendar.ts";
export { OFFLINE_CONFIG, offlineBandAtElapsedHours, offlineStateForAwayMinutes, splitOfflineWindow, type OfflineBand, type OfflineSlice } from "./offline_economy.ts";
export { EMPIRE_ARCHETYPES, resolveArchetype, type ArchetypeEffects, type ArchetypeResolution, type EmpireArchetype } from "./archetypes.ts";
export {
  DUPLICATE_SHARD_YIELD,
  LIVEOPS_ITEMS,
  liveopsItem,
  requireLiveopsItem,
  type LiveopsItem,
  type LiveopsItemCategory,
  type LiveopsItemRarity,
} from "./liveops/items.ts";
export {
  LIVEOPS_WEEKLY_EVENTS,
  type LiveopsWeekEvent,
  type LiveopsWeekTone,
} from "./liveops/calendar.ts";
export {
  LIVEOPS_CAMPAIGNS,
  liveopsCampaign,
  liveopsMilestoneLabel,
  liveopsPointsForRepeat,
  liveopsWindowsAt,
  type LiveopsCampaign,
  type LiveopsMilestone,
  type LiveopsVerb,
  type LiveopsWindow,
} from "./liveops/campaigns.ts";
export {
  LIVEOPS_BOOST_POOL,
  LIVEOPS_CASES,
  LIVEOPS_LOOT_TABLE_VERSION,
  liveopsCase,
  liveopsLootTotal,
  liveopsPityForceEntry,
  pickLiveopsLoot,
  type LiveopsCaseDef,
  type LiveopsCaseId,
  type LiveopsLootEntry,
} from "./liveops/cases.ts";
export {
  LIVEOPS_PASS_DAYS,
  LIVEOPS_PASS_LEVELS,
  LIVEOPS_PASS_TRACK,
  liveopsBracket,
  liveopsPassLevelForXp,
  liveopsSeasonAt,
  type LiveopsPassLevel,
  type LiveopsPassReward,
  type LiveopsSeason,
} from "./liveops/pass.ts";
export {
  LIVEOPS_FAUCET_PLOT,
  LIVEOPS_PACKS,
  LIVEOPS_PASS_PLOT,
  LIVEOPS_PASS_USD,
  LIVEOPS_PLOT_REF_USD,
  LIVEOPS_QUOTE_TTL_MS,
  LIVEOPS_REPRICE_THRESHOLD,
  liveopsPack,
  liveopsPlotPriceFromUsd,
  liveopsPurchasePeriod,
  liveopsQuoteWindow,
  liveopsShopSlots,
  liveopsShouldReprice,
  type LiveopsPack,
  type LiveopsPackContent,
  type LiveopsShopSlot,
} from "./liveops/shop.ts";
export {
  INVEST_MAX_MINOR,
  INVEST_MIN_MINOR,
  INVEST_SHARE_BPS,
  INVEST_TERM_DAYS,
  VISIT_ACTIONS,
  VISIT_ACTION_LINEAGES,
  VISIT_NOTIONAL_MINOR,
  investAmountOk,
  investMaturesDay,
  investYieldMinor,
  utcDaysBetween,
  visitEligible,
  visitFeeMinor,
  visitSpec,
  type VisitAction,
} from "./visits.ts";

import { CASH_SCALE } from "./constants.ts";
import { CARDS, resolveType } from "./buildings.ts";
import { MARKET_HUNTS, type MarketHuntTemplate } from "./market_phase3.ts";

export type HuntId = (typeof MARKET_HUNTS)[number]["id"];

export const FRAGMENTS = [
  "AAPL",
  "NVDA",
  "TSLA",
  "MSFT",
  "AMZN",
  "GOOGL",
  "META",
  "COIN",
  "NFLX",
  "SPY",
] as const;
export type FragmentTicker = (typeof FRAGMENTS)[number];

export const STAGE_LABEL: Record<1 | 2 | 3, string> = {
  1: "Branch",
  2: "Regional",
  3: "Tower",
};

export type PlacedCard = {
  id: string;
  type: string;
  hexId: string;
  stage: 1 | 2 | 3;
  placedAt?: number;
  operationalUntil?: number;
};

/** Back-compat alias for the square-era name (now hex-based). */
export type PlacementCard = PlacedCard;

function specOf(type: string) {
  const s = CARDS[resolveType(type)];
  if (!s) throw new Error(`Unknown building ${type}`);
  return s;
}

export function stageMul(stage: 1 | 2 | 3): number {
  return stage === 1 ? 1 : stage === 2 ? 1.35 : 1.8;
}

/** Canonical v0.2 upgrade cost (minor units): stage 2 = 0.35×base×5, stage 3 = 0.45×base×8. */
export function upgradeCostMinor(type: string, from: 1 | 2): number {
  return specOf(type).upgradeCostMinor(from === 1 ? 2 : 3);
}

export function plotRank(cards: { type: string }[]): number {
  const er: Record<string, number> = {
    humble: 0,
    starter: 0,
    growing: 1,
    established: 2,
    elite: 3,
    tycoon: 4,
  };
  let r = 0;
  for (const c of cards) {
    const s = CARDS[resolveType(c.type)];
    if (s) r = Math.max(r, er[s.era] ?? 0);
  }
  return r;
}

export function fragmentDropBps(cards: PlacedCard[]): number {
  const brokerage = cards.filter((c) => specOf(c.type).lineage === "broker");
  return 800 + brokerage.reduce((s, c) => s + 400 * c.stage, 0);
}

export function huntRewardMul(cards: PlacedCard[]): number {
  const research = cards.filter((c) => specOf(c.type).lineage === "research");
  return 1 + research.reduce((s, c) => s + 0.12 * c.stage, 0);
}

export function hasFund(cards: PlacedCard[]): boolean {
  return cards.some((c) => specOf(c.type).lineage === "fund");
}

export type HuntDef = MarketHuntTemplate & { title: string; hint: string; cashRewardMinor: number };

export const HUNTS: HuntDef[] = MARKET_HUNTS.map((hunt) => ({
  ...hunt,
  title: hunt.name,
  hint: `${hunt.metric}: ${hunt.target.toLocaleString()} ${hunt.unit}.`,
  cashRewardMinor: 0,
}));

export function pickHunt(daySeed: number): HuntDef {
  return HUNTS[Math.abs(daySeed) % HUNTS.length]!;
}

/** Board-derived empire level (v0.2 cap 24); the authoritative level is XP-based (levelForXp). */
export function empireLevel(cards: { stage?: number }[]): number {
  const raw = cards.reduce((sum, card) => sum + 1 + Math.max(0, (card.stage ?? 1) - 1), 0);
  return Math.max(1, Math.min(24, raw));
}

export function fragmentForHunt(
  hunt: HuntId,
  cards: PlacedCard[],
  roll01: number,
): FragmentTicker | "MYSTERY" | null {
  const drop = roll01 < fragmentDropBps(cards) / 10_000;
  if (!drop && hunt !== "exchange_actions") return null;
  if (hunt === "exchange_actions") return "NVDA";
  if (hunt === "earnings_day") return "AAPL";
  if (hunt === "cash_target") return "AAPL";
  return "MYSTERY";
}

export function resolveMystery(roll: number): FragmentTicker {
  return FRAGMENTS[Math.abs(Math.floor(roll * FRAGMENTS.length)) % FRAGMENTS.length]!;
}

export const FRAGMENT_UNITS = 0.01;

export function empireValueMinor(
  cashMinor: number,
  cards: PlacedCard[],
  fragmentUnits: number,
): number {
  const buildings = cards.reduce((s, c) => s + 50 * CASH_SCALE * c.stage, 0);
  const frags = Math.round(fragmentUnits * 1_000 * CASH_SCALE);
  return cashMinor + buildings + frags;
}

export function utcDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function displayCash(minor: number): string {
  const n = minor / CASH_SCALE;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.floor(n).toLocaleString()}`;
}
