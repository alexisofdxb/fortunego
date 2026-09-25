import { utcDay } from "@plotgo/game";
import { prisma } from "../postgres/client";
import { loadCards, loadFrags } from "../../domains/plot/board.service";
import { activePlayerEvents } from "../../domains/events/events.service";
import { ensureMarketCycle } from "../../domains/events/market-cycle.service";
import { resolveCraftJobs } from "../../domains/modules/modules.service";
import { ensureMarketHunts } from "../../shared/snapshot";

/**
 * In-process scheduler — local stand-in for the deferred Redis/BullMQ workers
 * (spec sheet 16). Every tick is idempotent (safe to re-run) and failure-isolated:
 * a throwing job is logged and never crashes the process. Intervals carry ±20%
 * jitter to avoid a thundering herd (spec sheet 28).
 */

const JITTER_RATIO = 0.2;

function jitter(baseMs: number): number {
  return Math.max(1_000, Math.round(baseMs * (1 + (Math.random() * 2 - 1) * JITTER_RATIO)));
}

function msUntilNextUtcMidnight(now = Date.now()): number {
  const next = new Date(now + 86_400_000);
  const end = Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), next.getUTCDate());
  return Math.max(1_000, end - now);
}

// --- Job bodies (each must be idempotent) ---------------------------------

/** Every 1 min: complete due craft jobs (spec: Module Craft Completion, exactly-once grant). */
async function craftCompletionSweep() {
  const now = Date.now();
  const due = await prisma.moduleCraftJob.findMany({
    where: { status: "pending", completesAt: { lte: now } },
    select: { playerId: true },
    distinct: ["playerId"],
  });
  for (const row of due) await resolveCraftJobs(row.playerId);
}

/**
 * Every 5 min: hunt expiry plus personal/global event expiry & timeout fallback.
 * Reuses the same lazy ensure* functions the snapshot path uses, so behavior
 * matches snapshot-time processing (spec sheet 16).
 */
async function expirySweep() {
  const now = Date.now();
  const day = utcDay();
  const huntPlayers = await prisma.marketHuntSlot.findMany({
    where: { status: { in: ["active", "cash_fallback"] }, expiresAt: { lte: now } },
    select: { playerId: true },
    distinct: ["playerId"],
  });
  for (const row of huntPlayers) {
    const board = await loadCards(row.playerId);
    const { map } = await loadFrags(row.playerId);
    await ensureMarketHunts(row.playerId, board, map, day);
  }
  const eventPlayers = await prisma.plotgoPlayerEvent.findMany({
    where: { status: "active", endsAt: { lte: now } },
    select: { playerId: true },
    distinct: ["playerId"],
  });
  for (const row of eventPlayers) await activePlayerEvents(row.playerId);
}

/** Every 60 min: market cycle transition check (lazy ensure flips due cycles). */
async function marketCycleCheck() {
  await ensureMarketCycle();
}

/**
 * Daily (UTC midnight): module inventory reconcile. Verifies the invariant
 * quantityOwned >= quantityEquipped >= 0 and that loadout rows reference owned
 * modules. Violations are logged with the [integrity] tag only — no auto-repair
 * (spec sheet 16 "Module Inventory Reconcile" / sheet 31 core invariants).
 */
async function inventoryReconcile() {
  const inventoryRows = await prisma.playerModuleInventory.findMany({
    select: { playerId: true, moduleId: true, quantityOwned: true, quantityEquipped: true },
  });
  const loadoutRows = await prisma.buildingModuleLoadout.findMany({
    select: { playerId: true, buildingId: true, slotIndex: true, moduleId: true },
  });
  const inventoryByPlayerModule = new Map(inventoryRows.map((row) => [`${row.playerId}:${row.moduleId}`, row]));
  const equippedByPlayerModule = new Map<string, number>();
  for (const row of loadoutRows) {
    const key = `${row.playerId}:${row.moduleId}`;
    equippedByPlayerModule.set(key, (equippedByPlayerModule.get(key) ?? 0) + 1);
  }
  const violations: string[] = [];
  for (const row of inventoryRows) {
    if (row.quantityOwned < row.quantityEquipped || row.quantityEquipped < 0 || row.quantityOwned < 0) {
      violations.push(`inventory invariant broken for player=${row.playerId} module=${row.moduleId}: owned=${row.quantityOwned} equipped=${row.quantityEquipped}`);
    }
  }
  for (const row of loadoutRows) {
    const inventory = inventoryByPlayerModule.get(`${row.playerId}:${row.moduleId}`);
    if (!inventory || inventory.quantityOwned < 1) {
      violations.push(`loadout references un-owned module: player=${row.playerId} building=${row.buildingId} slot=${row.slotIndex} module=${row.moduleId}`);
    }
  }
  for (const [key, equipped] of equippedByPlayerModule) {
    const inventory = inventoryByPlayerModule.get(key);
    if (inventory && inventory.quantityEquipped !== equipped) {
      violations.push(`equipped count mismatch for ${key}: inventory.quantityEquipped=${inventory.quantityEquipped} loadoutRows=${equipped}`);
    }
  }
  for (const violation of violations) console.error(`[integrity] ${violation}`);
  if (violations.length) console.error(`[integrity] inventory reconcile found ${violations.length} violation(s); not auto-repairing`);
}

// --- Scheduler core --------------------------------------------------------

type Job = { name: string; nextDelayMs: (now: number) => number; run: () => Promise<void> };

const jobs: Job[] = [
  { name: "craft_sweep", nextDelayMs: () => jitter(60_000), run: craftCompletionSweep },
  { name: "expiry_sweep", nextDelayMs: () => jitter(5 * 60_000), run: expirySweep },
  { name: "market_cycle", nextDelayMs: () => jitter(60 * 60_000), run: marketCycleCheck },
  { name: "inventory_reconcile", nextDelayMs: (now) => msUntilNextUtcMidnight(now), run: inventoryReconcile },
];

const timers = new Map<string, ReturnType<typeof setTimeout>>();
let started = false;
const lastRunDay = new Map<string, string>();

async function tick(job: Job): Promise<void> {
  if (!started) return;
  // Schedule the next tick first so a slow/failing run does not stall the cadence.
  timers.set(job.name, setTimeout(() => void tick(job), job.nextDelayMs(Date.now())));
  const day = utcDay();
  // Daily jobs are guarded on the UTC day so a jittered re-fire stays idempotent.
  if (job.name === "inventory_reconcile" && lastRunDay.get(job.name) === day) return;
  console.debug(`[scheduler] ${job.name} start`);
  try {
    await job.run();
    lastRunDay.set(job.name, day);
  } catch (error) {
    console.error(`[scheduler] ${job.name} failed`, error);
  }
  console.debug(`[scheduler] ${job.name} end`);
}

export function startScheduler(): void {
  if (started) return;
  started = true;
  for (const job of jobs) {
    timers.set(job.name, setTimeout(() => void tick(job), job.nextDelayMs(Date.now())));
  }
  console.debug("[scheduler] started");
}

export function stopScheduler(): void {
  started = false;
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  console.debug("[scheduler] stopped");
}
