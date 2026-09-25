import { allocateWeeklyPayouts, calculatePerformanceScore, type MarketStage } from "@plotgo/game";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/postgres/client";
import { newId, num } from "../../shared/types";
import { MODULE_CONFIG_VERSION } from "../modules/modules.service";
import { mapWeeklyRow, performanceMetrics, weekStartMs, type WeeklyPerformanceRow } from "../performance/performance.service";
import { producePayoutNotifications } from "../notifications/notifications.service";

/**
 * FNV-1a 32-bit over a stable JSON serialization (sorted keys, fixed field order),
 * used for the weekly snapshot manifest checksums (spec sheet 10).
 */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Frozen (pre-finalization) weekly_performance fields the manifest checksum covers. */
const FROZEN_ROW_FIELDS = [
  "playerId", "week", "stage", "activeDays", "activityMinor", "revenueMinor",
  "activeCustomersTotal", "customerSamples", "newRetainedCustomers",
  "utilizationBpsTotal", "reputationBpsTotal", "riskBpsTotal",
  "eventPoints", "sessions", "huntsCompleted",
] as const;

function stableFrozenRowJson(row: WeeklyPerformanceRow): string {
  const ordered = FROZEN_ROW_FIELDS.map((field) => [field, row[field]] as const);
  return JSON.stringify(Object.fromEntries(ordered));
}

// --- Frozen manifest (spec sheets 10/13 + retention R8) --------------------
// At week close (Mon 00:00 UTC job) the prior week's manifest row is created
// in status "pending" — sources frozen at close, gameplay of the new week
// never blocked. The admin finalize moves pending -> finalized (idempotent,
// checksum-guarded).

type ManifestSources = { sourceCursors: object; checksums: object; moduleLineage: object };

async function computeManifestSources(tx: Prisma.TransactionClient, week: string, rows: WeeklyPerformanceRow[]): Promise<ManifestSources> {
  const start = weekStartMs(week);
  const end = start + 7 * 86_400_000;
  const window = { createdAt: { gte: BigInt(start), lt: BigInt(end) } };
  const [cashAgg, repAgg, huntAgg, eventAuditAgg] = await Promise.all([
    tx.plotgoLedger.aggregate({ where: window, _count: true, _max: { createdAt: true } }),
    // No dedicated reputation ledger table in this schema; the closest authorized
    // reputation-affecting stream is the event ledger reasons.
    tx.plotgoLedger.aggregate({ where: { ...window, reason: { in: ["event", "event_mission"] } }, _count: true }),
    tx.marketHuntSlot.aggregate({ where: { status: "claimed", claimedAt: { gte: BigInt(start), lt: BigInt(end) } }, _count: true }),
    tx.plotgoEventAudit.aggregate({ where: window, _count: true }),
  ]);
  const sourceCursors = {
    cashLedger: { count: cashAgg._count, highWaterMark: num(cashAgg._max.createdAt ?? 0n) },
    activityWeeklyRows: { count: rows.length },
    customerAggregates: {
      samples: rows.reduce((sum, row) => sum + row.customerSamples, 0),
      activeCustomersTotal: rows.reduce((sum, row) => sum + row.activeCustomersTotal, 0),
      newRetainedCustomers: rows.reduce((sum, row) => sum + row.newRetainedCustomers, 0),
    },
    riskSnapshots: {
      samples: rows.reduce((sum, row) => sum + row.customerSamples, 0),
      riskBpsTotal: rows.reduce((sum, row) => sum + row.riskBpsTotal, 0),
    },
    reputationEvents: { count: repAgg._count + eventAuditAgg._count },
    huntCompletions: {
      count: huntAgg._count,
      weeklyRowsHuntsCompleted: rows.reduce((sum, row) => sum + row.huntsCompleted, 0),
    },
    eligibilityRows: {
      total: rows.length,
      withSessions: rows.filter((row) => row.sessions > 0).length,
      withActiveDays: rows.filter((row) => row.activeDays > 0).length,
    },
  };
  const checksums = {
    weeklyPerformance: fnv1a(JSON.stringify([...rows].sort((a, b) => a.playerId.localeCompare(b.playerId)).map(stableFrozenRowJson))),
  };
  const playerIds = rows.map((row) => row.playerId);
  const [auditVersions, loadoutVersions] = await Promise.all([
    tx.moduleLoadoutAudit.findMany({ where: window, select: { loadoutVersion: true } }),
    playerIds.length ? tx.buildingModuleLoadout.findMany({ where: { playerId: { in: playerIds } }, select: { loadoutVersion: true } }) : Promise.resolve([] as { loadoutVersion: number }[]),
  ]);
  const moduleLineage = {
    moduleConfigVersion: MODULE_CONFIG_VERSION,
    loadoutVersions: [...new Set([...auditVersions, ...loadoutVersions].map((row) => row.loadoutVersion))].sort((a, b) => a - b),
  };
  return { sourceCursors, checksums, moduleLineage };
}

/**
 * Upsert the frozen manifest for a week idempotently on week. A re-run whose
 * checksum differs from the stored one is logged with [integrity] and the
 * original manifest is kept (finalized results are never silently overwritten).
 * New manifests are created in status "pending" (week close); finalize moves
 * them to "finalized". Returns the manifest id.
 */
async function upsertWeeklySnapshotManifest(tx: Prisma.TransactionClient, week: string, rows: WeeklyPerformanceRow[]): Promise<string> {
  const existing = await tx.weeklySnapshot.findUnique({ where: { week } });
  if (existing) {
    const prior = (existing.checksums as { weeklyPerformance?: unknown } | null)?.weeklyPerformance;
    const recomputed = fnv1a(JSON.stringify([...rows].sort((a, b) => a.playerId.localeCompare(b.playerId)).map(stableFrozenRowJson)));
    if (prior !== recomputed) {
      console.error(`[integrity] weekly snapshot checksum mismatch for week ${week}: stored=${String(prior)} recomputed=${recomputed}; keeping original manifest, not overwriting finalized results`);
    }
    return existing.id;
  }
  const sources = await computeManifestSources(tx, week, rows);
  const id = newId();
  await tx.weeklySnapshot.create({
    data: { id, week, status: "pending", sourceCursors: sources.sourceCursors as unknown as Prisma.InputJsonValue, checksums: sources.checksums as unknown as Prisma.InputJsonValue, moduleLineage: sources.moduleLineage as unknown as Prisma.InputJsonValue, createdAt: Date.now() },
  });
  return id;
}

/**
 * Week close (retention R8): create the prior week's manifest row in status
 * "pending" with sources frozen at close. Idempotent; safe to call from the
 * daily reset job and from admin catch-up.
 */
export async function ensurePendingWeeklySnapshot(week: string) {
  return prisma.$transaction(async (tx) => {
    const rows = (await tx.weeklyPerformance.findMany({ where: { week } })).map(mapWeeklyRow);
    const id = await upsertWeeklySnapshotManifest(tx, week, rows);
    const row = await tx.weeklySnapshot.findUnique({ where: { week }, select: { status: true } });
    return { week, snapshotId: id, status: row?.status ?? "pending" };
  });
}

/**
 * Finalize a performance week. Each row update is conditional on finalized = false,
 * so re-running finalize is a no-op for already-finalized rows (idempotent).
 * The frozen snapshot manifest is built FIRST from the frozen source rows.
 */
export async function finalizePerformanceWeek(week: string) {
  const result = await prisma.$transaction(async (tx) => {
    const performanceRows = await tx.weeklyPerformance.findMany({ where: { week } });
    const players = await tx.player.findMany({
      where: { id: { in: performanceRows.map((row) => row.playerId) } },
      select: { id: true, createdAt: true, activeDays: true },
    });
    const playerById = new Map(players.map((player) => [player.id, player]));
    const rows = performanceRows.map(mapWeeklyRow);
    // Manifest BEFORE finalization, from the frozen source rows (spec sheet 10);
    // created as "pending" at close, moved to "finalized" below.
    const snapshotId = await upsertWeeklySnapshotManifest(tx, week, rows);
    const entries: { id: string; stage: MarketStage; score: number }[] = [];
    for (const row of rows) {
      const playerRow = playerById.get(row.playerId);
      const player = { createdAt: num(playerRow?.createdAt ?? 0), activeDays: parseDaysLoose(playerRow?.activeDays) };
      const score = calculatePerformanceScore(performanceMetrics(player, row, week, row.stage as MarketStage, true));
      await tx.$executeRaw`
        UPDATE weekly_performance
        SET finalized = true, score = ${score.weightedScore}, eligible = ${score.eligible}, "finalizedAt" = COALESCE("finalizedAt", ${Date.now()})
        WHERE "playerId" = ${row.playerId} AND week = ${week} AND finalized = false
      `;
      if (score.eligible) entries.push({ id: row.playerId, stage: row.stage as MarketStage, score: score.weightedScore });
    }
    const payouts = allocateWeeklyPayouts(entries);
    for (const row of rows) {
      await tx.$executeRaw`
        UPDATE weekly_performance SET "payoutPlot" = ${payouts.get(row.playerId) ?? 0}
        WHERE "playerId" = ${row.playerId} AND week = ${week}
      `;
    }
    await tx.$executeRaw`
      UPDATE weekly_performance SET "snapshotId" = ${snapshotId}
      WHERE week = ${week} AND "snapshotId" IS NULL
    `;
    // Settlement pending -> finalized (conditional: re-finalize is a no-op).
    await tx.$executeRaw`
      UPDATE weekly_snapshots SET status = 'finalized'
      WHERE week = ${week} AND status = 'pending'
    `;
    return { week, players: rows.length, eligible: entries.length, totalPayout: [...payouts.values()].reduce((sum, value) => sum + value, 0), snapshotId };
  });
  // Claimable notification, exactly once per epoch (dedupeKey payout_ready:{week}).
  await producePayoutNotifications(week);
  return result;
}

function parseDaysLoose(value: unknown): string[] {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value ?? "[]") : value ?? [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
