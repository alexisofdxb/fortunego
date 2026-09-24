export { BOARD, CASH_SCALE, STARTER_CASH_MINOR, SETTLE_MS } from "./constants.ts";
export { ONBOARDING_MILESTONES, ONBOARDING_XP_THRESHOLDS, onboardingLevel, onboardingMilestone, onboardingStep, type OnboardingMilestone, type OnboardingStatus } from "./onboarding.ts";
export {
  DISTRICT_EVENTS,
  SESSION_VERBS,
  eventForDay,
  seedForDay,
  type DistrictEvent,
  type DistrictEventId,
  type SessionVerb,
} from "./events.ts";
export {
  settleDistrict,
  type CustomerSegments,
  type DistrictState,
  type LedgerLine,
  type RevenueBreakdown,
  type RevenueModel,
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
  PLACEMENT_SPECIAL_TILE_COUNTS,
  PLACEMENT_SYNERGY_RULE_COUNT,
  buildingFamily,
  directAdjacent,
  edgeDistance,
  fitsPlacement,
  orientedFootprint,
  resolvePlacement,
  specialTileAt,
  type DistrictBonus,
  type Orientation,
  type PlacementCard,
  type PlacementEffect,
  type PlacementLink,
  type PlacementPenalty,
  type PlacementResolution,
  type PlacementFamily,
  type SpecialTileType,
} from "./placement.ts";
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
export { OFFLINE_CONFIG, offlineBandAtElapsedHours, offlineStateForAwayMinutes, splitOfflineWindow, type OfflineBand, type OfflineSlice } from "./offline_economy.ts";
export { EMPIRE_ARCHETYPES, resolveArchetype, type ArchetypeEffects, type ArchetypeResolution, type EmpireArchetype } from "./archetypes.ts";

import { BOARD, CASH_SCALE, SETTLE_MS } from "./constants.ts";
import { CARDS, resolveType } from "./buildings.ts";
import { MARKET_HUNTS, type MarketHuntTemplate } from "./market_phase3.ts";
import { fitsPlacement, orientedFootprint } from "./placement.ts";
import type { Orientation } from "./placement.ts";

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
  x: number;
  y: number;
  stage: 1 | 2 | 3;
  orientation?: Orientation;
  placedAt?: number;
  operationalUntil?: number;
};

function specOf(type: string) {
  const s = CARDS[resolveType(type)];
  if (!s) throw new Error(`Unknown building ${type}`);
  return s;
}

export function stageMul(stage: 1 | 2 | 3): number {
  return stage === 1 ? 1 : stage === 2 ? 1.35 : 1.8;
}

export function upgradeCostMinor(type: string, from: 1 | 2): number {
  const base = specOf(type).placeCostMinor;
  if (resolveType(type) === "cash_kiosk" && from === 1) return 465 * CASH_SCALE;
  return from === 1 ? Math.round(base * 1.2) : Math.round(base * 1.8);
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

export function boardSize(rank: number): number {
  return 12 + Math.min(4, Math.max(0, rank)) * 4;
}

export function fits(
  cards: PlacedCard[],
  type: string,
  x: number,
  y: number,
  ignoreId?: string,
  n = BOARD,
  orientation: Orientation = 0,
): boolean {
  return fitsPlacement(cards, type, x, y, orientation, ignoreId, n);
}

export function occupancy(cards: PlacedCard[], n = BOARD): boolean[][] {
  const g = Array.from({ length: n }, () => Array(n).fill(false));
  for (const c of cards) {
    const [w, h] = orientedFootprint(c.type, c.orientation ?? 0);
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) g[c.y + dy][c.x + dx] = true;
    }
  }
  return g;
}

export function vaultBoost(cards: PlacedCard[]): number {
  return 1 + cards.filter((c) => specOf(c.type).lineage === "vault").length * 0.08;
}

export function cardTickMinor(card: PlacedCard, all: PlacedCard[]): number {
  const spec = specOf(card.type);
  let add = spec.baseMinorPerTick * stageMul(card.stage);
  if (spec.lineage === "trade" || spec.lineage === "exchange") {
    add += all.length * 4 * CASH_SCALE * stageMul(card.stage);
  }
  return Math.round(add * vaultBoost(all));
}

/** Cash earned for one 10s tick. */
export function tickMinor(cards: PlacedCard[]): number {
  return cards.reduce((s, c) => s + cardTickMinor(c, cards), 0);
}

export function cardHourMinor(card: PlacedCard, all: PlacedCard[]): number {
  return cardTickMinor(card, all) * Math.round(3_600_000 / SETTLE_MS);
}

export function cardCustomers(card: PlacedCard): number {
  return Math.round(specOf(card.type).customersBase * stageMul(card.stage));
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

export function empireLevel(cards: { stage?: number }[]): number {
  const raw = cards.reduce((sum, card) => sum + 1 + Math.max(0, (card.stage ?? 1) - 1), 0);
  return Math.max(1, Math.min(50, raw));
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
