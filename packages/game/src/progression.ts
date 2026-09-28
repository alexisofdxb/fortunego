// ---------------------------------------------------------------------------
// Empire progression — Empire_Progression_System_v1.0 (canonical; replaces the
// v0.2 progression mechanics). Level geometry (maxHexes / cumulativeBuildings /
// unlock schedule) stays verbatim from v02/progression.json; the XP curve,
// promotion gates, XP sources and multipliers come from v02/progression_v10.json.
//
// Semantics (documented, pure, unit-testable):
//   candidateLevel = highest level L with cumulativeXp(L) ≤ xp. This is the
//     level the player has "earned" on XP alone — promotion gates do NOT cap it.
//   A promotion gate is "passed" when its rank is in completedPromotions OR its
//     requirements are currently met (a met gate is auto-promotable; the API
//     persists the promotion flag + 300 XP via refreshProgression).
//   displayedLevel = highest L ≤ candidateLevel such that every gate with
//     requiredLevel ≤ L is passed. An unpassed gate at requiredLevel R caps the
//     displayed level at R − 1. Reproduces the v1.0 workbook simulator example:
//     xp 8450, 16 hexes, 14 businesses, 5 stage2+, 6 stocks, no promotions →
//     candidate 9, displayed 8 (Growing gate at 9 unmet), Starter gate (at 5)
//     passes because its requirements are met.
//   activeGate = the first gate with requiredLevel ≤ candidateLevel that is not
//     passed (the gate currently holding the player back), else null.
//   justPromoted = ranks of met gates not yet in completedPromotions.
// ---------------------------------------------------------------------------

import progression from "./v02/progression.json";
import progressionV10 from "./v02/progression_v10.json";
import { BUILDING_LIST } from "./buildings.ts";

export type EmpireRank = "humble" | "starter" | "growing" | "established" | "elite" | "tycoon";

export const MAX_EMPIRE_LEVEL = 24;

export type ProgressionRow = {
  level: number;
  rank: string;
  maxHexes: number;
  newCapacity: number;
  unlocksThisLevel: number;
  cumulativeBuildings: number;
  expectedAvgStage: number;
};

const ROWS = progression as ProgressionRow[];

/** v1.0 level table row (v02/progression_v10.json). */
export type V10Level = {
  level: number;
  rank: string;
  cumulativeXp: number;
  xpFromPrior: number;
  maxHexes: number;
  cumulativeBuildings: number;
  promotionGate: boolean;
};

/** v1.0 promotion gate row (v02/progression_v10.json). */
export type V10Gate = {
  promotionTo: string;
  requiredLevel: number;
  xpThreshold: number;
  minOwnedHexes: number;
  minBuiltBusinesses: number;
  minStage2Plus: number;
  uniqueStocks: number;
  allRequired: boolean;
  rewardXp: number;
};

const V10_LEVELS = progressionV10.levels as V10Level[];
const V10_GATES = progressionV10.gates as V10Gate[];

/** v1.0 rank XP multipliers (building construction / upgrades). */
export const RANK_XP_MULTIPLIER: Readonly<Record<string, number>> = progressionV10.rankMultiplier;
/** v1.0 land-grade XP multipliers (land acquisition). */
export const LAND_GRADE_XP_MULTIPLIER: Readonly<Record<string, number>> = progressionV10.landGradeMultiplier;

/** v1.0 base XP amounts for the ten canonical sources. */
export const XP_SOURCE_BASE = {
  /** First-time building construction (× building-rank multiplier). */
  construction: 100,
  /** Stage-2 building upgrade (× building-rank multiplier). */
  stage2Upgrade: 50,
  /** Stage-3 building upgrade (× building-rank multiplier). */
  stage3Upgrade: 100,
  /** Hex / land acquisition (× land-grade multiplier). */
  land: 75,
  /** Unique stock discovered (once per ticker). */
  stockDiscovery: 40,
  /** Stock collection set completed (once per set). */
  stockSet: 250,
  /** Customer / revenue milestone (× milestone tier). */
  revenueMilestone: 100,
  /** Daily objective completion (25 each, hard-capped per day). */
  dailyObjective: 25,
  /** Market Hunt completion (20 each, hard-capped per day). */
  hunt: 20,
  /** Rank promotion milestone (once per promotion). */
  promotion: 300,
} as const;

/** v1.0 hard daily XP caps (UTC day). */
export const DAILY_XP_CAPS = {
  dailyObjectiveXp: progressionV10.dailyCaps.dailyObjectiveXp,
  dailyMarketHuntXp: progressionV10.dailyCaps.dailyMarketHuntXp,
} as const;

/**
 * Revenue milestone tiers (spec deviation, documented): the spec names the
 * cumulative earned_minor thresholds 1k / 10k / 100k / 1M / 10M minor for
 * tiers 1..5 without a canonical constant table in the JSON, so they are
 * declared here in minor units.
 */
export const REVENUE_MILESTONE_THRESHOLDS_MINOR: readonly number[] = Object.freeze([
  1_000,
  10_000,
  100_000,
  1_000_000,
  10_000_000,
]);

/** Case-insensitive rank multiplier lookup (unknown rank → 1, i.e. Humble). */
export function rankXpMultiplier(rank: string | undefined | null): number {
  if (!rank) return 1;
  return RANK_XP_MULTIPLIER[rank] ?? RANK_XP_MULTIPLIER[rank.charAt(0).toUpperCase() + rank.slice(1).toLowerCase()] ?? 1;
}

/** Case-insensitive land-grade multiplier lookup (unknown grade → 1, i.e. Entry). */
export function landGradeXpMultiplier(grade: string | undefined | null): number {
  if (!grade) return 1;
  return LAND_GRADE_XP_MULTIPLIER[grade] ?? LAND_GRADE_XP_MULTIPLIER[grade.charAt(0).toUpperCase() + grade.slice(1).toLowerCase()] ?? 1;
}

/** v1.0 promotion gates in ascending requiredLevel order. */
export const PROMOTION_GATES: readonly V10Gate[] = Object.freeze([...V10_GATES].sort((a, b) => a.requiredLevel - b.requiredLevel));

/** The promotion gate whose requiredLevel equals `level`, or null. */
export function promotionGateForLevel(level: number): V10Gate | null {
  return PROMOTION_GATES.find((gate) => gate.requiredLevel === level) ?? null;
}

// --- Level geometry (unchanged from v0.2, v02/progression.json) --------------

/** v0.2 rank bands (levels 1–4 / 5–8 / 9–12 / 13–16 / 17–20 / 21–24). */
export const RANK_LEVEL_BANDS: Record<EmpireRank, readonly [number, number]> = {
  humble: [1, 4],
  starter: [5, 8],
  growing: [9, 12],
  established: [13, 16],
  elite: [17, 20],
  tycoon: [21, 24],
};

const RANKS: readonly EmpireRank[] = ["humble", "starter", "growing", "established", "elite", "tycoon"];

export function clampLevel(level: number): number {
  return Math.max(1, Math.min(MAX_EMPIRE_LEVEL, Math.floor(Number(level) || 1)));
}

export function rankForLevel(level: number): EmpireRank {
  const safe = clampLevel(level);
  for (const rank of RANKS) {
    const [start, end] = RANK_LEVEL_BANDS[rank];
    if (safe >= start && safe <= end) return rank;
  }
  return "tycoon";
}

export function progressionRow(level: number): ProgressionRow {
  return ROWS[clampLevel(level) - 1]!;
}

/** Maximum owned hexes at an empire level (v02/progression.json maxHexes). */
export function maxHexesForLevel(level: number): number {
  return progressionRow(level).maxHexes;
}

/** Cumulative catalog buildings unlocked at or below an empire level. */
export function cumulativeBuildings(level: number): number {
  return progressionRow(level).cumulativeBuildings;
}

/** Building ids unlocked at or below an empire level (BUILDING_LIST / BLD order). */
export function buildingIdsForLevel(level: number): string[] {
  const count = cumulativeBuildings(level);
  return BUILDING_LIST.slice(0, count).map((spec) => spec.id);
}

/** Set of building ids unlocked at or below an empire level. */
export function buildingsUnlockedAtOrBelow(level: number): Set<string> {
  return new Set(buildingIdsForLevel(level));
}

// --- v1.0 XP curve (canonical cumulative table) --------------------------------

/**
 * XP_FOR_LEVEL[i] = cumulative XP required to REACH level i+1 (index 0 = level 1
 * = 0 XP). Canonical Empire_Progression_System_v1.0 table from
 * v02/progression_v10.json (max 173,000 for level 24).
 */
export const XP_FOR_LEVEL: readonly number[] = Object.freeze(V10_LEVELS.map((row) => row.cumulativeXp));

/** Highest empire level (1..24) reachable with `xp` cumulative XP (the CANDIDATE level). */
export function levelForXp(xp: number): number {
  const value = Math.max(0, Number(xp) || 0);
  let level = 1;
  for (let index = 1; index < MAX_EMPIRE_LEVEL; index++) {
    if (value >= XP_FOR_LEVEL[index]!) level = index + 1;
  }
  return level;
}

// --- v1.0 promotion gates -------------------------------------------------------

export type ProgressionCounters = {
  ownedHexes: number;
  builtBusinesses: number;
  stage2PlusBuildings: number;
  uniqueStocks: number;
};

export type ProgressionState = {
  xp: number;
  completedPromotions: string[];
} & ProgressionCounters;

export type GateProgressEntry = { current: number; required: number };

export type PromotionGateView = {
  promotionTo: string;
  requiredLevel: number;
  requirements: ProgressionCounters;
  progress: Record<keyof ProgressionCounters, GateProgressEntry>;
  met: boolean;
};

export type ProgressionEvaluation = {
  candidateLevel: number;
  displayedLevel: number;
  activeGate: PromotionGateView | null;
  justPromoted: string[];
};

function gateMet(gate: V10Gate, counters: ProgressionCounters): boolean {
  // All v1.0 gates are allRequired; every requirement must be satisfied.
  return counters.ownedHexes >= gate.minOwnedHexes
    && counters.builtBusinesses >= gate.minBuiltBusinesses
    && counters.stage2PlusBuildings >= gate.minStage2Plus
    && counters.uniqueStocks >= gate.uniqueStocks;
}

function gateView(gate: V10Gate, counters: ProgressionCounters): PromotionGateView {
  const requirements: ProgressionCounters = {
    ownedHexes: gate.minOwnedHexes,
    builtBusinesses: gate.minBuiltBusinesses,
    stage2PlusBuildings: gate.minStage2Plus,
    uniqueStocks: gate.uniqueStocks,
  };
  const progress = {
    ownedHexes: { current: counters.ownedHexes, required: gate.minOwnedHexes },
    builtBusinesses: { current: counters.builtBusinesses, required: gate.minBuiltBusinesses },
    stage2PlusBuildings: { current: counters.stage2PlusBuildings, required: gate.minStage2Plus },
    uniqueStocks: { current: counters.uniqueStocks, required: gate.uniqueStocks },
  };
  return { promotionTo: gate.promotionTo, requiredLevel: gate.requiredLevel, requirements, progress, met: gateMet(gate, counters) };
}

/**
 * Pure v1.0 progression evaluation (see the semantics block at the top of this
 * file). `completedPromotions` holds the persisted promotion rank names; a gate
 * whose requirements are met but whose rank is not persisted yet is returned in
 * `justPromoted` (the API persists the flag and awards 300 XP once).
 */
export function evaluateProgression(state: ProgressionState): ProgressionEvaluation {
  const xp = Math.max(0, Number(state.xp) || 0);
  const candidateLevel = levelForXp(xp);
  const counters: ProgressionCounters = {
    ownedHexes: Math.max(0, Math.floor(Number(state.ownedHexes) || 0)),
    builtBusinesses: Math.max(0, Math.floor(Number(state.builtBusinesses) || 0)),
    stage2PlusBuildings: Math.max(0, Math.floor(Number(state.stage2PlusBuildings) || 0)),
    uniqueStocks: Math.max(0, Math.floor(Number(state.uniqueStocks) || 0)),
  };
  const completed = new Set((state.completedPromotions ?? []).map((rank) => String(rank).toLowerCase()));
  const passed = (gate: V10Gate) => completed.has(gate.promotionTo.toLowerCase()) || gateMet(gate, counters);
  const justPromoted = PROMOTION_GATES
    .filter((gate) => !completed.has(gate.promotionTo.toLowerCase()) && gateMet(gate, counters))
    .map((gate) => gate.promotionTo);
  let displayedLevel = candidateLevel;
  for (const gate of PROMOTION_GATES) {
    if (gate.requiredLevel > candidateLevel) break;
    if (!passed(gate)) {
      displayedLevel = gate.requiredLevel - 1;
      break;
    }
  }
  const active = PROMOTION_GATES.find((gate) => gate.requiredLevel <= candidateLevel && !passed(gate)) ?? null;
  return {
    candidateLevel,
    displayedLevel,
    activeGate: active ? gateView(active, counters) : null,
    justPromoted,
  };
}
