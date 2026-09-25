import { MARKET_STAGES, type MarketStage } from "./market_phase3.ts";

// ---------------------------------------------------------------------------
// Daily Business Objectives (retention spec sheet 07)
// Three lanes — Operations / Growth / Market — Cash-only reward, capped at
// <=5% of the median stage daily earned Cash across all three objectives.
// Completion is evaluated server-side from authoritative evidence only.
// ---------------------------------------------------------------------------

export const OBJECTIVE_LANES = ["operations", "growth", "market"] as const;
export type ObjectiveLane = (typeof OBJECTIVE_LANES)[number];

export type ObjectiveEvidence =
  | { kind: "ledger_reason"; reason: string }          // plotgo_ledger rows today (validated actions)
  | { kind: "population_gain" }                        // net customer delta vs assignment baseline
  | { kind: "utilization_below"; maxBps: number };     // snapshot utilization + >=1 validated action

export type ObjectiveTemplate = {
  id: string;
  lane: ObjectiveLane;
  title: string;
  description: string;
  difficulty: "Easy" | "Standard";
  evidence: ObjectiveEvidence;
  /** Stage-scaled target; unit depends on evidence kind (count or bps). */
  targetForStage: (stage: MarketStage, context: { capacity: number }) => number;
};

const netCustomerTarget = (stage: MarketStage, context: { capacity: number }): number => {
  const stageIndex = Math.max(0, MARKET_STAGES.indexOf(stage));
  const stageFloor = 3 + stageIndex * 4;
  const capacityScaled = context.capacity > 0 ? Math.max(1, Math.round(context.capacity * 0.15)) : stageFloor;
  return Math.max(stageFloor, capacityScaled);
};

export const OBJECTIVE_TEMPLATES: readonly ObjectiveTemplate[] = [
  {
    id: "ops_upgrade_building",
    lane: "operations",
    title: "Upgrade a building",
    description: "Upgrade any building today.",
    difficulty: "Easy",
    evidence: { kind: "ledger_reason", reason: "upgrade" },
    targetForStage: () => 1,
  },
  {
    id: "ops_utilization_headroom",
    lane: "operations",
    title: "Create utilization headroom",
    description: "Bring district utilization below 85% and take a validated action today.",
    difficulty: "Standard",
    evidence: { kind: "utilization_below", maxBps: 8_500 },
    targetForStage: () => 8_500,
  },
  {
    id: "growth_net_customers",
    lane: "growth",
    title: "Grow the customer base",
    description: "Gain net customers today versus the start of the objective.",
    difficulty: "Standard",
    evidence: { kind: "population_gain" },
    targetForStage: netCustomerTarget,
  },
  {
    id: "growth_place_building",
    lane: "growth",
    title: "Expand the district",
    description: "Place a new building today.",
    difficulty: "Easy",
    evidence: { kind: "ledger_reason", reason: "build" },
    targetForStage: () => 1,
  },
  {
    id: "market_complete_hunt",
    lane: "market",
    title: "Complete a Market Hunt",
    description: "Complete any Market Hunt today.",
    difficulty: "Easy",
    evidence: { kind: "ledger_reason", reason: "hunt" },
    targetForStage: () => 1,
  },
  {
    id: "market_event_session",
    lane: "market",
    title: "Operate during a market event",
    description: "Settle a session on a day with an active market event.",
    difficulty: "Standard",
    evidence: { kind: "ledger_reason", reason: "session" },
    targetForStage: () => 1,
  },
];

export function objectiveTemplatesForLane(lane: ObjectiveLane): ObjectiveTemplate[] {
  return OBJECTIVE_TEMPLATES.filter((template) => template.lane === lane);
}

// ---------------------------------------------------------------------------
// Reward budget (spec sheet 13): across all 3 objectives <= 5% of the median
// stage daily earned Cash. Objective rewards are Cash only — no score/PLOT.
// ---------------------------------------------------------------------------

export const OBJECTIVE_REWARD_CAP_BPS = 500;

export function medianStageDailyEarnedMinor(stage: MarketStage): number {
  const median: Record<MarketStage, number> = {
    humble: 80_000,
    starter: 250_000,
    growing: 700_000,
    established: 1_800_000,
    elite: 4_000_000,
    tycoon: 8_000_000,
  };
  return median[stage];
}

/** Per-objective Cash reward; 3x this is guaranteed <= 5% of the stage median. */
export function objectiveRewardMinor(stage: MarketStage): number {
  return Math.floor(medianStageDailyEarnedMinor(stage) * (OBJECTIVE_REWARD_CAP_BPS / 10_000) / OBJECTIVE_LANES.length);
}

// ---------------------------------------------------------------------------
// Operating Streak (spec sheet 10): cosmetic/status only, never reward-bearing.
// ---------------------------------------------------------------------------

/** Advance the operating streak after the daily finalize of `eligibleYesterday`. */
export function advanceOperatingStreak(
  streak: number,
  longest: number,
  eligibleYesterday: boolean,
): { streak: number; longest: number } {
  const next = eligibleYesterday ? streak + 1 : 0;
  return { streak: next, longest: Math.max(longest, next) };
}
