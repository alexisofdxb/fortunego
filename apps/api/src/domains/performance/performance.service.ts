import {
  DEFAULT_PERFORMANCE_TARGET_MODE,
  calculatePerformanceScore,
  isoWeek,
  type MarketStage,
  type PerformanceMetrics,
} from "@plotgo/game";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/postgres/client";
import { num } from "../../shared/types";

type Db = Prisma.TransactionClient | typeof prisma;

export type WeeklyPerformanceRow = {
  playerId: string;
  week: string;
  stage: MarketStage;
  activeDays: number;
  activityMinor: number;
  revenueMinor: number;
  activeCustomersTotal: number;
  customerSamples: number;
  newRetainedCustomers: number;
  utilizationBpsTotal: number;
  reputationBpsTotal: number;
  riskBpsTotal: number;
  eventPoints: number;
  sessions: number;
  huntsCompleted: number;
  finalized: number;
  score: number;
  eligible: number;
  payoutPlot: number;
  claimedAt: number | null;
  finalizedAt: number | null;
};

export function mapWeeklyRow(row: {
  playerId: string; week: string; stage: string; activeDays: number; activityMinor: bigint; revenueMinor: bigint;
  activeCustomersTotal: number; customerSamples: number; newRetainedCustomers: number; utilizationBpsTotal: number;
  reputationBpsTotal: number; riskBpsTotal: number; eventPoints: number; sessions: number; huntsCompleted: number;
  finalized: boolean; score: number; eligible: boolean; payoutPlot: bigint; claimedAt: bigint | null; finalizedAt: bigint | null;
}): WeeklyPerformanceRow {
  return {
    playerId: row.playerId,
    week: row.week,
    stage: row.stage as MarketStage,
    activeDays: row.activeDays,
    activityMinor: num(row.activityMinor),
    revenueMinor: num(row.revenueMinor),
    activeCustomersTotal: row.activeCustomersTotal,
    customerSamples: row.customerSamples,
    newRetainedCustomers: row.newRetainedCustomers,
    utilizationBpsTotal: row.utilizationBpsTotal,
    reputationBpsTotal: row.reputationBpsTotal,
    riskBpsTotal: row.riskBpsTotal,
    eventPoints: row.eventPoints,
    sessions: row.sessions,
    huntsCompleted: row.huntsCompleted,
    finalized: row.finalized ? 1 : 0,
    score: row.score,
    eligible: row.eligible ? 1 : 0,
    payoutPlot: num(row.payoutPlot),
    claimedAt: row.claimedAt == null ? null : num(row.claimedAt),
    finalizedAt: row.finalizedAt == null ? null : num(row.finalizedAt),
  };
}

export async function weeklyPerformanceRow(playerId: string, week: string): Promise<WeeklyPerformanceRow | undefined> {
  const row = await prisma.weeklyPerformance.findUnique({ where: { playerId_week: { playerId, week } } });
  return row ? mapWeeklyRow(row) : undefined;
}

export function activeDaysInWeek(days: string[], week: string): number {
  return days.filter((day) => isoWeek(new Date(`${day}T00:00:00Z`)) === week).length;
}

export function performanceMetrics(
  player: { createdAt: number; activeDays: string[] },
  row: WeeklyPerformanceRow | undefined,
  week: string,
  stage: MarketStage,
  finalized: boolean,
): PerformanceMetrics {
  const samples = Number(row?.customerSamples ?? 0);
  return {
    stage,
    activityMinor: Number(row?.activityMinor ?? 0),
    revenueMinor: Number(row?.revenueMinor ?? 0),
    averageActiveCustomers: samples ? Number(row?.activeCustomersTotal ?? 0) / samples : 0,
    newRetainedCustomers: Number(row?.newRetainedCustomers ?? 0),
    averageUtilization: samples ? Number(row?.utilizationBpsTotal ?? 0) / samples / 10_000 : 0,
    reputation: samples ? Number(row?.reputationBpsTotal ?? 0) / samples / 100 : 0,
    riskIndex: samples ? Number(row?.riskBpsTotal ?? 0) / samples / 100 : 100,
    completedHunts: Number(row?.huntsCompleted ?? 0),
    eventMissionPoints: Math.min(5, Number(row?.eventPoints ?? 0)),
    activeDays: Number(row?.activeDays ?? activeDaysInWeek(player.activeDays, week)),
    plotAgeHours: (Date.now() - player.createdAt) / 3_600_000,
    finalized,
  };
}

export function performanceSnapshot(
  player: { createdAt: number; activeDays: string[] },
  row: WeeklyPerformanceRow | undefined,
  week: string,
  stage: MarketStage,
) {
  const finalized = row?.finalized === 1;
  const metrics = performanceMetrics(player, row, week, stage, finalized);
  const score = calculatePerformanceScore(metrics);
  return {
    week,
    stage,
    targetMode: DEFAULT_PERFORMANCE_TARGET_MODE,
    score: score.weightedScore,
    eligible: score.eligible,
    eligibilityReasons: score.eligibilityReasons,
    components: score.components,
    activeDays: metrics.activeDays,
    completedHunts: metrics.completedHunts,
    activityMinor: metrics.activityMinor,
    revenueMinor: metrics.revenueMinor,
    averageActiveCustomers: Number(metrics.averageActiveCustomers.toFixed(2)),
    averageUtilization: Number(metrics.averageUtilization.toFixed(4)),
    finalized,
    payoutPlot: Number(row?.payoutPlot ?? 0),
    eventMissionPoints: metrics.eventMissionPoints ?? 0,
    claimed: row?.claimedAt != null,
  };
}

/** Faithful port of the accumulator upsert (ON CONFLICT excluded.* additions). */
export async function upsertWeeklySessionPerformance(
  db: Db,
  playerId: string,
  week: string,
  stage: MarketStage,
  activeDays: number,
  previousPopulation: number,
  result: { volumeMinor: number; earnedDeltaMinor: number; population: number; capacity: number; reputationBps: number; riskBps: number; revenue: { amountMinor: number }[] },
) {
  const utilizationBps = result.capacity > 0 ? result.population / result.capacity * 10_000 : 0;
  // Doc Performance Handoff anti-dominance rule: no single building may contribute
  // more than 60% of a day's revenue to the SCORE. The excess is excluded from
  // the weekly revenue component only — Cash and ledgers are never touched.
  const revenueLines = result.revenue.map((line) => Math.max(0, line.amountMinor));
  const grossRevenue = revenueLines.reduce((sum, line) => sum + line, 0);
  const dominanceCap = grossRevenue * 0.6;
  const revenueMinor = grossRevenue <= 0 ? 0 : revenueLines.reduce((sum, line) => sum + Math.min(line, dominanceCap), 0);
  await db.$executeRaw`
    INSERT INTO weekly_performance
      ("playerId", week, stage, "activeDays", "activityMinor", "revenueMinor", "activeCustomersTotal", "customerSamples", "newRetainedCustomers", "utilizationBpsTotal", "reputationBpsTotal", "riskBpsTotal", "eventPoints", sessions)
    VALUES (${playerId}, ${week}, ${stage}, ${activeDays}, ${Math.max(0, result.volumeMinor)}, ${revenueMinor}, ${Math.max(0, result.population)}, 1, ${Math.max(0, result.population - previousPopulation)}, ${utilizationBps}, ${result.reputationBps}, ${result.riskBps}, 0, 1)
    ON CONFLICT ("playerId", week) DO UPDATE SET
      stage = EXCLUDED.stage,
      "activeDays" = EXCLUDED."activeDays",
      "activityMinor" = weekly_performance."activityMinor" + EXCLUDED."activityMinor",
      "revenueMinor" = weekly_performance."revenueMinor" + EXCLUDED."revenueMinor",
      "activeCustomersTotal" = weekly_performance."activeCustomersTotal" + EXCLUDED."activeCustomersTotal",
      "customerSamples" = weekly_performance."customerSamples" + 1,
      "newRetainedCustomers" = weekly_performance."newRetainedCustomers" + EXCLUDED."newRetainedCustomers",
      "utilizationBpsTotal" = weekly_performance."utilizationBpsTotal" + EXCLUDED."utilizationBpsTotal",
      "reputationBpsTotal" = weekly_performance."reputationBpsTotal" + EXCLUDED."reputationBpsTotal",
      "riskBpsTotal" = weekly_performance."riskBpsTotal" + EXCLUDED."riskBpsTotal",
      sessions = weekly_performance.sessions + 1
  `;
}

export async function addWeeklyHuntPerformance(db: Db, playerId: string, week: string, stage: MarketStage, activeDays: number) {
  await db.$executeRaw`
    INSERT INTO weekly_performance ("playerId", week, stage, "activeDays", "huntsCompleted")
    VALUES (${playerId}, ${week}, ${stage}, ${activeDays}, 1)
    ON CONFLICT ("playerId", week) DO UPDATE SET
      stage = EXCLUDED.stage,
      "activeDays" = EXCLUDED."activeDays",
      "huntsCompleted" = weekly_performance."huntsCompleted" + 1
  `;
}

export function weekStartMs(week: string): number {
  const [yearText, weekText] = week.split("-W");
  const year = Number(yearText);
  const weekNumber = Number(weekText);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * 86_400_000);
  return monday.getTime() + (weekNumber - 1) * 7 * 86_400_000;
}

export async function eventRewardBudgetUsed(playerId: string, week: string): Promise<number> {
  const rows = await prisma.plotgoEventAudit.findMany({
    where: { playerId, auditType: "reward", createdAt: { gte: weekStartMs(week) } },
    select: { payloadJson: true },
  });
  return rows.reduce((sum, row) => {
    const amount = (row.payloadJson as { amountMinor?: unknown } | null)?.amountMinor;
    return sum + (Number(amount) || 0);
  }, 0);
}

export async function addEventPerformance(db: Db, playerId: string, week: string, stage: MarketStage, points: number) {
  const capped = Math.min(5, Math.max(0, points));
  await db.$executeRaw`
    INSERT INTO weekly_performance ("playerId", week, stage, "activeDays", "eventPoints")
    VALUES (${playerId}, ${week}, ${stage}, 0, ${capped})
    ON CONFLICT ("playerId", week) DO UPDATE SET
      stage = EXCLUDED.stage,
      "eventPoints" = LEAST(5, weekly_performance."eventPoints" + EXCLUDED."eventPoints")
  `;
}
