import { advanceOperatingStreak, isoWeek, marketStageForEmpireLevel, utcDay } from "@plotgo/game";
import { prisma } from "../infrastructure/postgres/client";
import { parseNumberMap } from "./types";
import { expireStaleOffers, spawnDailyOffers } from "../domains/hunts/offers.service";
import { ensureDailyObjectives, expireObjectives } from "../domains/objectives/objectives.service";
import { ensurePendingWeeklySnapshot } from "../domains/settlement/settlement.service";
import { weekStartMs } from "../domains/performance/performance.service";
import { loadCards, operatingBoard } from "../domains/plot/board.service";
import { currentEmpireLevel } from "../domains/player/onboarding.service";

// ---------------------------------------------------------------------------
// Daily reset orchestrator (retention spec sheets 10/14).
// 00:00 UTC job (+ boot catch-up): for each player —
//   1. finalize the PREVIOUS UTC day's active-day eligibility
//      (>=10 engaged minutes AND >=1 meaningful state-changing action;
//      heartbeat/navigation never count — the presence ledger already
//      excludes them) into PlayerDailyState (authoritative);
//   2. update the cosmetic Operating Streak / Longest Streak (never
//      reward-bearing) and mirror eligible days into weekly_performance;
//   3. expire prior-day unstarted offers + incomplete objectives (no debt);
//   4. spawn the canonical 3 hunt offers + 3 business objectives for today;
// plus: prior week enters settlement "pending" at close (R8 — the new week is
// never blocked). Every step is idempotent; a throwing player never crashes
// the batch.
// ---------------------------------------------------------------------------

export const ACTIVE_DAY_MINUTES = 10;

export function previousUtcDay(day: string): string {
  return utcDay(Date.parse(`${day}T00:00:00Z`) - 86_400_000);
}

async function finalizePlayerDay(playerId: string, day: string, now: number): Promise<void> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { activeMinutesDailyJson: true, meaningfulActionsDailyJson: true, operatingStreak: true, longestStreak: true },
  });
  if (!player) return;
  const existing = await prisma.playerDailyState.findUnique({ where: { playerId_day: { playerId, day } } });
  if (existing?.finalizedAt != null) return;
  const engagedMinutes = parseNumberMap(player.activeMinutesDailyJson)[day] ?? 0;
  const meaningfulActions = parseNumberMap(player.meaningfulActionsDailyJson)[day] ?? 0;
  const eligible = engagedMinutes >= ACTIVE_DAY_MINUTES && meaningfulActions >= 1;
  const prior = await prisma.playerDailyState.findUnique({
    where: { playerId_day: { playerId, day: previousUtcDay(day) } },
    select: { eligible: true, finalizedAt: true },
  });
  // The players.operatingStreak column always reflects the streak as of the
  // most recently finalized day; it chains only when that day is the
  // consecutive prior UTC day. Cosmetic only, never reward-bearing.
  const base = prior?.finalizedAt != null && prior.eligible ? player.operatingStreak : 0;
  const { streak, longest } = advanceOperatingStreak(base, player.longestStreak, eligible);
  await prisma.playerDailyState.upsert({
    where: { playerId_day: { playerId, day } },
    create: { playerId, day, engagedMinutes, meaningfulActions, eligible, finalizedAt: now },
    update: { engagedMinutes, meaningfulActions, eligible, finalizedAt: now },
  });
  await prisma.player.update({
    where: { id: playerId },
    data: { operatingStreak: streak, longestStreak: longest },
  });
  if (!eligible) return;
  // Wire weekly performance active_days to the authoritative daily state
  // (additive: existing counters keep working, this only ever raises the value).
  const week = isoWeek(new Date(`${day}T00:00:00Z`));
  const weekStartDay = utcDay(weekStartMs(week));
  const eligibleDays = await prisma.playerDailyState.count({
    where: { playerId, eligible: true, day: { gte: weekStartDay, lte: day } },
  });
  const row = await prisma.weeklyPerformance.findUnique({ where: { playerId_week: { playerId, week } }, select: { stage: true } });
  const stage = row?.stage ?? "humble";
  await prisma.$executeRaw`
    INSERT INTO weekly_performance ("playerId", week, stage, "activeDays")
    VALUES (${playerId}, ${week}, ${stage}, ${eligibleDays})
    ON CONFLICT ("playerId", week) DO UPDATE SET
      "activeDays" = GREATEST(weekly_performance."activeDays", EXCLUDED."activeDays")
  `;
}

export async function runDailyReset(now = Date.now()): Promise<{ players: number; week: string }> {
  const today = utcDay(now);
  const yesterday = previousUtcDay(today);
  const players = await prisma.player.findMany({ select: { id: true } });
  for (const { id } of players) {
    try {
      await finalizePlayerDay(id, yesterday, now);
      await expireStaleOffers(id, today, now);
      await expireObjectives(id, today);
      await spawnDailyOffers(id, today, now);
      const player = await prisma.player.findUnique({ where: { id }, select: { population: true, capacity: true } });
      const activeBoard = operatingBoard(await loadCards(id));
      const stage = marketStageForEmpireLevel(await currentEmpireLevel(id, activeBoard));
      await ensureDailyObjectives(id, today, stage, {
        population: player?.population ?? 0,
        capacity: player?.capacity ?? 0,
        cardCount: activeBoard.length,
      }, now);
    } catch (error) {
      console.error(`[retention] daily reset failed for player ${id}`, error);
    }
  }
  // Weekly close: prior epoch enters settlement "pending" at Mon 00:00 UTC.
  // R8: the new week is already playable and never blocked by settlement.
  const week = isoWeek(new Date(now));
  const priorWeek = isoWeek(new Date(now - 7 * 86_400_000));
  await ensurePendingWeeklySnapshot(priorWeek);
  await prisma.plotgoJobCheckpoint.upsert({
    where: { jobId: "daily_reset" },
    create: { jobId: "daily_reset", day: today, updatedAt: now },
    update: { day: today, updatedAt: now },
  });
  return { players: players.length, week };
}
