import {
  OBJECTIVE_LANES,
  OBJECTIVE_TEMPLATES,
  eventForDay,
  objectiveRewardMinor,
  objectiveTemplatesForLane,
  seedForDay,
  utcDay,
  type MarketStage,
  type ObjectiveLane,
  type ObjectiveTemplate,
} from "@plotgo/game";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/postgres/client";
import { newId, num } from "../../shared/types";
import { claimDailyFlag } from "../../shared/daily-state";
import { seedMix } from "../hunts/hunts.service";
import { recordLedger } from "../economy/ledger.service";
import { awardDailyObjective } from "../player/empire.service";

// ---------------------------------------------------------------------------
// Daily Business Objectives (retention spec sheets 07/13/14).
// Three lanes (Operations / Growth / Market), one template per lane per day,
// Cash-only reward capped at <=5% of the median stage daily earned Cash.
// Completion consumes authoritative server evidence only (cash ledger rows
// created after assignment, snapshot state, presence audit) — never a client
// flag, and offline state alone cannot complete an objective.
// ---------------------------------------------------------------------------

export type ObjectiveEvidenceCursor = {
  populationBaseline: number;
  cardCountBaseline: number;
  stage: MarketStage;
  assignedAt: number;
};

export type ObjectiveView = {
  lane: ObjectiveLane;
  templateId: string;
  title: string;
  description: string;
  difficulty: string;
  target: number;
  progress: { current: number; target: number; done: boolean };
  status: string;
  rewardMinor: number;
  rerolled: boolean;
};

export function previousUtcDay(day: string): string {
  return utcDay(Date.parse(`${day}T00:00:00Z`) - 86_400_000);
}

/** Deterministic per (player, day, lane) template choice; avoids repeating the
 * same template more than 2 consecutive days by rotating when yesterday's lane
 * template matches the draw. */
export function pickTemplateForLane(playerId: string, day: string, lane: ObjectiveLane, previousTemplateId?: string): ObjectiveTemplate {
  const templates = objectiveTemplatesForLane(lane);
  const seed = seedMix(seedForDay(day, playerId), OBJECTIVE_LANES.indexOf(lane));
  let choice = templates[seed % templates.length]!;
  if (templates.length > 1 && choice.id === previousTemplateId) {
    choice = templates[(seed + 1) % templates.length]!;
  }
  return choice;
}

export type ObjectiveContext = { population: number; capacity: number; cardCount: number };

/**
 * Generate the canonical 3 objectives for (player, day). Idempotent via the
 * (player, day) objectiveSet flag — reset job and lazy snapshot path converge.
 */
export async function ensureDailyObjectives(playerId: string, day: string, stage: MarketStage, ctx: ObjectiveContext, now = Date.now()): Promise<void> {
  if (!(await claimDailyFlag(playerId, day, "objectiveSet"))) return;
  const previous = await prisma.plotgoObjectiveState.findMany({
    where: { playerId, day: previousUtcDay(day) },
    select: { lane: true, templateId: true },
  });
  const previousByLane = new Map(previous.map((row) => [row.lane, row.templateId]));
  const reward = objectiveRewardMinor(stage);
  for (const lane of OBJECTIVE_LANES) {
    const template = pickTemplateForLane(playerId, day, lane, previousByLane.get(lane));
    const target = template.targetForStage(stage, { capacity: ctx.capacity });
    await prisma.plotgoObjectiveState.create({
      data: {
        playerId,
        day,
        lane,
        templateId: template.id,
        targetJson: { target },
        progressJson: {},
        evidenceCursor: {
          populationBaseline: ctx.population,
          cardCountBaseline: ctx.cardCount,
          stage,
          assignedAt: now,
        } satisfies ObjectiveEvidenceCursor as unknown as Prisma.InputJsonValue,
        status: "active",
        rewardMinor: reward,
        rerolled: false,
        createdAt: now,
      },
    });
  }
}

/** Expire incomplete objectives at the daily reset — no debt, no catch-up. */
export async function expireObjectives(playerId: string, beforeDay: string): Promise<void> {
  await prisma.plotgoObjectiveState.updateMany({
    where: { playerId, status: "active", day: { lt: beforeDay } },
    data: { status: "expired" },
  });
}

type LedgerEvidence = { reason: string; createdAt: bigint };

function templateFor(row: { templateId: string }): ObjectiveTemplate {
  return OBJECTIVE_TEMPLATES.find((template) => template.id === row.templateId) ?? OBJECTIVE_TEMPLATES[0]!;
}

/**
 * Lazily evaluate today's objectives from authoritative evidence and pay
 * completion rewards (Cash only, ledger-tagged source "objective"). Returns
 * the view model for all of today's objective rows.
 */
export async function evaluateObjectives(playerId: string, day: string, now = Date.now()): Promise<ObjectiveView[]> {
  const rows = await prisma.plotgoObjectiveState.findMany({
    where: { playerId, day },
    orderBy: { lane: "asc" },
  });
  if (!rows.length) return [];
  const activeRows = rows.filter((row) => row.status === "active");
  let ledger: LedgerEvidence[] = [];
  let validatedActions = 0;
  let population = 0;
  let capacity = 0;
  if (activeRows.length) {
    const assignedFrom = Math.min(...activeRows.map((row) => num(row.createdAt)));
    const [ledgerRows, actionCount, playerRow] = await Promise.all([
      prisma.plotgoLedger.findMany({
        where: { playerId, day, createdAt: { gte: assignedFrom } },
        select: { reason: true, createdAt: true },
      }),
      prisma.plotgoEventAudit.count({
        where: { playerId, auditType: "meaningful_action", createdAt: { gte: assignedFrom } },
      }),
      prisma.player.findUnique({ where: { id: playerId }, select: { population: true, capacity: true } }),
    ]);
    ledger = ledgerRows;
    validatedActions = actionCount;
    population = playerRow?.population ?? 0;
    capacity = playerRow?.capacity ?? 0;
  }
  const views: ObjectiveView[] = [];
  for (const row of rows) {
    const template = templateFor(row);
    const target = (row.targetJson as { target?: number } | null)?.target ?? 1;
    const cursor = (row.evidenceCursor ?? {}) as Partial<ObjectiveEvidenceCursor>;
    let current = 0;
    let status = row.status;
    let done = row.status === "complete";
    if (row.status === "active") {
      const evidence = template.evidence;
      let satisfied = false;
      if (evidence.kind === "ledger_reason") {
        current = ledger.filter((entry) => entry.reason === evidence.reason).length;
        // Market: settle a session on a day with an active market event
        // (the seeded district event is the deterministic server-side source).
        if (template.id === "market_event_session") {
          current = current > 0 && eventForDay(day, playerId).id !== "quiet_day" ? 1 : 0;
        }
        satisfied = current >= target;
      } else if (evidence.kind === "population_gain") {
        // Offline customer changes alone cannot complete: a validated
        // state-changing action after assignment is always required.
        current = Math.max(0, population - (cursor.populationBaseline ?? 0));
        satisfied = current >= target && validatedActions > 0;
      } else {
        const utilizationBps = capacity > 0 ? Math.round((population / capacity) * 10_000) : 0;
        current = utilizationBps;
        satisfied = utilizationBps <= evidence.maxBps && validatedActions > 0;
      }
      if (satisfied) {
        done = await completeObjective(playerId, day, row.lane, row.templateId, current, target, num(row.rewardMinor));
        if (done) status = "complete";
      }
    } else if (row.status === "complete") {
      const progress = (row.progressJson ?? {}) as { current?: number };
      current = progress.current ?? target;
    }
    views.push({
      lane: row.lane as ObjectiveLane,
      templateId: row.templateId,
      title: template.title,
      description: template.description,
      difficulty: template.difficulty,
      target,
      progress: { current, target, done },
      status,
      rewardMinor: num(row.rewardMinor),
      rerolled: row.rerolled,
    });
  }
  return views;
}

/** Conditional completion flip + Cash payout inside one transaction (replay:
 * a concurrent evaluator that lost the flip never pays twice). */
async function completeObjective(playerId: string, day: string, lane: string, templateId: string, current: number, target: number, rewardMinor: number): Promise<boolean> {
  let paid = false;
  await prisma.$transaction(async (tx) => {
    const flipped = await tx.plotgoObjectiveState.updateMany({
      where: { playerId, day, lane, status: "active" },
      data: { status: "complete", progressJson: { current, target } },
    });
    if (flipped.count !== 1) return;
    const balance = await tx.player.update({
      where: { id: playerId },
      data: { cashMinor: { increment: rewardMinor } },
      select: { cashMinor: true },
    });
    // Cash-ledger tagging (spec sheet 14 objective_reward_ledger): source
    // "objective" keeps retention rewards out of business revenue scoring.
    await recordLedger(tx, playerId, day, "objective", rewardMinor, num(balance.cashMinor), { source: "objective", lane, templateId });
    paid = true;
  });
  // v1.0: daily objective XP (25, hard-capped at 75/day).
  if (paid) await awardDailyObjective(playerId);
  return paid;
}

/**
 * The single daily lane reroll (spec sheet 07): replaces the lane's template,
 * resets progress and re-baselines the evidence cursor. 1/day total across
 * all lanes, enforced by the (player, day) objectiveRerolled flag.
 */
export async function rerollObjectiveLane(playerId: string, day: string, lane: ObjectiveLane, ctx: ObjectiveContext, now = Date.now()): Promise<{ error: string; status: 400 | 404 | 409 } | { view: ObjectiveView }> {
  const row = await prisma.plotgoObjectiveState.findUnique({ where: { playerId_day_lane: { playerId, day, lane } } });
  if (!row) return { error: "No objective for lane", status: 404 };
  if (row.status !== "active") return { error: "Objective already resolved", status: 400 };
  if (!(await claimDailyFlag(playerId, day, "objectiveRerolled"))) {
    return { error: "Daily objective reroll already used", status: 409 };
  }
  const cursor = (row.evidenceCursor ?? {}) as Partial<ObjectiveEvidenceCursor>;
  const stage = cursor.stage ?? "humble";
  const candidates = objectiveTemplatesForLane(lane).filter((template) => template.id !== row.templateId);
  if (!candidates.length) return { error: "No alternate template", status: 400 };
  const seed = seedMix(seedForDay(day, playerId), OBJECTIVE_LANES.indexOf(lane) + 7);
  const template = candidates[seed % candidates.length]!;
  const target = template.targetForStage(stage, { capacity: ctx.capacity });
  const updated = await prisma.plotgoObjectiveState.updateMany({
    where: { playerId, day, lane, status: "active" },
    data: {
      templateId: template.id,
      targetJson: { target },
      progressJson: {},
      evidenceCursor: {
        populationBaseline: ctx.population,
        cardCountBaseline: ctx.cardCount,
        stage,
        assignedAt: now,
      } satisfies ObjectiveEvidenceCursor as unknown as Prisma.InputJsonValue,
      rerolled: true,
      createdAt: now,
    },
  });
  if (updated.count !== 1) return { error: "Objective already resolved", status: 409 };
  return {
    view: {
      lane,
      templateId: template.id,
      title: template.title,
      description: template.description,
      difficulty: template.difficulty,
      target,
      progress: { current: 0, target, done: false },
      status: "active",
      rewardMinor: num(row.rewardMinor),
      rerolled: true,
    },
  };
}
