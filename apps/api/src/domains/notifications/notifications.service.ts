import {
  announcedWindowsForWeek,
  marketEventForDay,
  marketStageForEmpireLevel,
  settleDistrict,
  type PlacedCard,
} from "@plotgo/game";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/postgres/client";
import { newId, num } from "../../shared/types";
import {
  archetypeResolutionForPlayer,
  districtDay,
  effectiveDistrictEvent,
  loadCards,
  loadFrags,
  operatingBoard,
} from "../plot/board.service";
import { eventState } from "../events/events.service";
import { moduleEffectsForBoard } from "../modules/modules.service";
import { currentEmpireLevel } from "../player/onboarding.service";
import { huntProgress, marketHuntRow, templateForSlot } from "../hunts/hunts.service";
import { weekStartMs } from "../performance/performance.service";

// ---------------------------------------------------------------------------
// Notification outbox + producer (retention spec sheets 12/14).
// In-app transport only (push delivery is deferred infra). Frequency caps are
// enforced by the unique dedupeKey per notification semantic key; the producer
// never uses profit language, never pushes at midnight, never warns about
// streak loss. Quiet hours are a configurable constant, default off locally.
// ---------------------------------------------------------------------------

export const NOTIFICATION_QUIET_HOURS = { enabled: false, startHourUtc: 22, endHourUtc: 8 } as const;

export type NotificationType = "payout_ready" | "week_24h" | "week_6h" | "hunt_expiry" | "risk_alert" | "event_push";

/** Copy per spec sheet 12 "Never Say" column — no profit language, no pressure. */
const NOTIFICATION_COPY: Record<NotificationType, (payload: Record<string, unknown>) => { title: string; body: string }> = {
  payout_ready: (payload) => ({
    title: "Weekly payout ready",
    body: `Your finalized weekly PLOT share for ${String(payload.week ?? "last week")} is ready to claim.`,
  }),
  week_24h: () => ({ title: "Week closes in 24 hours", body: "The current performance week closes at 00:00 UTC tomorrow." }),
  week_6h: () => ({ title: "Week closes in 6 hours", body: "The performance week closes at 00:00 UTC." }),
  hunt_expiry: () => ({ title: "Hunt expiring soon", body: "A started Market Hunt has under 2 hours remaining." }),
  risk_alert: () => ({ title: "Critical risk level", body: "Risk entered a critical band in your district. Review exposure when you are back." }),
  event_push: (payload) => ({ title: "Major event started", body: `A scheduled global market event is now active: ${String(payload.title ?? "market event")}.` }),
};

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

/**
 * Idempotent enqueue: the unique dedupeKey makes concurrent/duplicate
 * produces a no-op (P2002 swallowed) — one notification per semantic key.
 */
export async function queueNotification(playerId: string, type: NotificationType, dedupeKey: string, payload: Record<string, unknown> = {}, eligibleAt = Date.now()): Promise<boolean> {
  try {
    await prisma.notificationOutbox.create({
      data: { id: newId(), playerId, type, dedupeKey, payloadJson: payload as unknown as Prisma.InputJsonValue, eligibleAt, state: "pending", createdAt: Date.now() },
    });
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}

/** Scheduler job: flip eligible pending notifications to sent (in-app inbox). */
export async function dispatchDueNotifications(now = Date.now()): Promise<number> {
  const updated = await prisma.notificationOutbox.updateMany({
    where: { state: "pending", eligibleAt: { lte: now } },
    data: { state: "sent" },
  });
  return updated.count;
}

export type NotificationView = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  dedupeKey: string;
  payload: Record<string, unknown>;
  state: string;
  eligibleAt: number;
  createdAt: number;
};

export async function inboxFor(playerId: string): Promise<NotificationView[]> {
  const rows = await prisma.notificationOutbox.findMany({
    where: { playerId, state: { in: ["pending", "sent"] } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map((row) => {
    const payload = (row.payloadJson ?? {}) as Record<string, unknown>;
    const copy = NOTIFICATION_COPY[row.type as NotificationType]?.(payload) ?? { title: row.type, body: "" };
    return {
      id: row.id,
      type: row.type as NotificationType,
      title: copy.title,
      body: copy.body,
      dedupeKey: row.dedupeKey,
      payload,
      state: row.state,
      eligibleAt: num(row.eligibleAt),
      createdAt: num(row.createdAt),
    };
  });
}

export async function unreadNotificationCount(playerId: string): Promise<number> {
  return prisma.notificationOutbox.count({ where: { playerId, state: { in: ["pending", "sent"] } } });
}

export async function markRead(playerId: string, id: string): Promise<boolean> {
  const updated = await prisma.notificationOutbox.updateMany({
    where: { id, playerId, state: { in: ["pending", "sent"] } },
    data: { state: "read" },
  });
  return updated.count === 1;
}

export async function markAllRead(playerId: string): Promise<number> {
  const updated = await prisma.notificationOutbox.updateMany({
    where: { playerId, state: { in: ["pending", "sent"] } },
    data: { state: "read" },
  });
  return updated.count;
}

// ---------------------------------------------------------------------------
// Canonical producers (spec sheet 12 triggers)
// ---------------------------------------------------------------------------

/** payout_ready:{epoch} — after weekly finalize, for eligible payout rows. 1/epoch. */
export async function producePayoutNotifications(week: string): Promise<number> {
  const rows = await prisma.weeklyPerformance.findMany({
    where: { week, finalized: true, payoutPlot: { gt: 0 } },
    select: { playerId: true, payoutPlot: true },
  });
  let queued = 0;
  for (const row of rows) {
    if (await queueNotification(row.playerId, "payout_ready", `payout_ready:${week}`, { week, payoutPlot: num(row.payoutPlot) })) queued++;
  }
  return queued;
}

/** week_24h:{epoch} / week_6h:{epoch} — hourly during the final 24h. 1/week each. */
export async function produceWeeklyCountdownAlerts(week: string, now = Date.now()): Promise<void> {
  const closesAt = weekStartMs(week) + 7 * 86_400_000;
  const remaining = closesAt - now;
  if (remaining <= 0 || remaining > 24 * 3_600_000) return;
  const players = await prisma.weeklyPerformance.findMany({ where: { week }, select: { playerId: true }, distinct: ["playerId"] });
  for (const row of players) {
    await queueNotification(row.playerId, "week_24h", `week_24h:${week}`, { week, closesAt });
    if (remaining <= 6 * 3_600_000) {
      await queueNotification(row.playerId, "week_6h", `week_6h:${week}`, { week, closesAt });
    }
  }
}

/** event_push:{event}:{week} — announced major window start. 1/event. */
export async function produceEventStartAlerts(week: string, now = Date.now()): Promise<void> {
  for (const window of announcedWindowsForWeek(week)) {
    if (now < window.startsAt || now >= window.startsAt + 60 * 60_000) continue;
    const players = await prisma.weeklyPerformance.findMany({ where: { week }, select: { playerId: true }, distinct: ["playerId"] });
    for (const row of players) {
      await queueNotification(row.playerId, "event_push", `event_push:${window.eventId}:${week}`, { eventId: window.eventId, title: window.title, week });
    }
  }
}

/**
 * hunt_expiry:{huntId} — started Hunt with <=2h remaining AND real progress.
 * Dedupe is per hunt, so the progress computation runs at most once per hunt.
 */
export async function produceHuntExpiryAlerts(now = Date.now()): Promise<void> {
  const due = await prisma.marketHuntSlot.findMany({
    where: { started: true, status: { in: ["active", "cash_fallback"] }, expiresAt: { gt: now, lte: now + 2 * 3_600_000 } },
    select: { id: true, playerId: true },
  });
  for (const hunt of due) {
    const playerId = hunt.playerId;
    const p = await prisma.player.findUnique({ where: { id: playerId } });
    const slotRow = await prisma.marketHuntSlot.findUnique({ where: { id: hunt.id } });
    if (!p || !slotRow) continue;
    const board = operatingBoard(await loadCards(playerId));
    if (!board.length) continue;
    const { map } = await loadFrags(playerId);
    const day = utcDayOf(now);
    const dayData = await districtDay(playerId, day);
    const marketEvent = marketEventForDay(day, playerId);
    const stage = marketStageForEmpireLevel(await currentEmpireLevel(playerId, board));
    const events = await eventState(playerId, board, stage, num(p.createdAt));
    const activeEvent = effectiveDistrictEvent(dayData.event, marketEvent, 0, events.modifiers);
    const moduleEffects = await moduleEffectsForBoard(playerId, board, [events.global.id, ...events.personalEvents.map((event) => event.id)], events.cycle.state);
    const archetype = await archetypeResolutionForPlayer(playerId, board);
    const metrics = settleDistrict(
      board,
      activeEvent,
      "walk",
      { cashMinor: num(p.cashMinor), reputationBps: p.reputationBps, conditionBps: p.conditionBps },
      dayData.seed,
      moduleEffects,
      archetype.effects,
    );
    const slot = marketHuntRow(slotRow);
    const template = templateForSlot(slot);
    const progress = huntProgress(
      { earnedMinor: num(p.earnedMinor), board: board as PlacedCard[], reputationBps: p.reputationBps, transactions: p.transactions, volumeMinor: num(p.volumeMinor) },
      slot,
      template,
      metrics,
      map,
    );
    if (progress.current > 0) {
      await queueNotification(playerId, "hunt_expiry", `hunt_expiry:${slot.id}`, { huntId: slot.id, templateId: template.id, expiresAt: slot.expiresAt });
    }
  }
}

/** risk_alert:{playerId}:{day} — risk entered the critical band (>=9000 bps). */
export async function produceRiskAlert(playerId: string, riskBps: number, now = Date.now()): Promise<void> {
  if (riskBps < 9_000) return;
  await queueNotification(playerId, "risk_alert", `risk_alert:${playerId}:${utcDayOf(now)}`, { riskBps });
}

function utcDayOf(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}
