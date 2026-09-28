import {
  EVENT_CATALOG,
  EVENT_DECISIONS,
  EVENT_MISSIONS,
  EVENT_REWARD_RULES,
  catalogModifier,
  cycleModifier,
  eventEligible,
  eventModuleInteraction,
  isoWeek,
  marketStageForEmpireLevel,
  moduleLockForEvent,
  stackModifiers,
  utcDay,
  CARDS,
  resolveType,
  stageMul,
  type CatalogEvent,
  type EventMission,
  type EventModifier,
  type EventScope,
  type MarketStage,
  type PlacedCard,
  buildingFamily,
} from "@plotgo/game";
import { prisma } from "../../infrastructure/postgres/client";
import { newId, num } from "../../shared/types";
import { auditEvent } from "../plot/audit.service";
import { cycleGlobalEvent, ensureMarketCycle, stableEventSeed } from "./market-cycle.service";
import { addEventPerformance } from "../performance/performance.service";

/**
 * v0.2 board customer estimate (retires v0.1 cardCustomers with the customer
 * simulation): customers ≈ baseNetPerDay × 2 × stage multiplier.
 */
function cardCustomers(card: PlacedCard): number {
  const spec = CARDS[resolveType(card.type)];
  if (!spec) return 0;
  return Math.round(spec.baseNetPerDay * 2 * stageMul(card.stage));
}

export type PlayerEventRow = {
  id: string;
  playerId: string;
  catalogId: string;
  scope: EventScope;
  status: string;
  issuedAt: number;
  startsAt: number;
  endsAt: number;
  choiceId: string | null;
  resolutionJson: string | null;
  resolvedAt: number | null;
  rewardClaimed: number;
};

export type EventMissionRow = { id: string; playerId: string; eventId: string; templateId: string; target: number; issuedAt: number; expiresAt: number; status: string; claimedAt: number | null; rewardClaimed: number };

function eventRow(row: {
  id: string; playerId: string; catalogId: string; scope: string; status: string; issuedAt: bigint; startsAt: bigint; endsAt: bigint;
  choiceId: string | null; resolutionJson: unknown; resolvedAt: bigint | null; rewardClaimed: boolean;
}): PlayerEventRow {
  return {
    id: row.id,
    playerId: row.playerId,
    catalogId: row.catalogId,
    scope: row.scope as EventScope,
    status: row.status,
    issuedAt: num(row.issuedAt),
    startsAt: num(row.startsAt),
    endsAt: num(row.endsAt),
    choiceId: row.choiceId,
    resolutionJson: row.resolutionJson == null ? null : JSON.stringify(row.resolutionJson),
    resolvedAt: row.resolvedAt == null ? null : num(row.resolvedAt),
    rewardClaimed: row.rewardClaimed ? 1 : 0,
  };
}

export async function activePlayerEvents(playerId: string, now = Date.now()): Promise<PlayerEventRow[]> {
  const presence = await prisma.player.findUnique({
    where: { id: playerId },
    select: { presenceState: true, personalEventProtectionUntil: true },
  });
  const expired = await prisma.plotgoPlayerEvent.findMany({
    where: { playerId, status: "active", endsAt: { lte: now }, choiceId: null },
  });
  for (const expiredRow of expired) {
    if (expiredRow.scope === "Personal" && (presence?.presenceState !== "engaged" || num(presence.personalEventProtectionUntil) > now)) {
      await prisma.plotgoPlayerEvent.updateMany({ where: { id: expiredRow.id, choiceId: null }, data: { endsAt: now + 60 * 60_000 } });
      continue;
    }
    const event = EVENT_CATALOG.find((candidate) => candidate.id === expiredRow.catalogId);
    const fallback = event ? EVENT_DECISIONS.filter((decision) => decision.eventId === event.id).sort((a, b) => Math.abs(a.modifier.riskBps) - Math.abs(b.modifier.riskBps) || a.immediateCostMinor - b.immediateCostMinor)[0] : undefined;
    if (!fallback) continue;
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { cashMinor: true, reputationBps: true, activeDays: true },
    });
    if (!player) continue;
    const cashMinor = num(player.cashMinor);
    const cost = Math.min(cashMinor, fallback.immediateCostMinor);
    const nextCash = cashMinor - cost + Math.min(fallback.cashRewardMinor, EVENT_REWARD_RULES.weeklyCashCapMinor);
    const nextRep = Math.max(0, Math.min(10_000, player.reputationBps + fallback.modifier.reputationDelta * 100));
    await prisma.player.update({
      where: { id: playerId },
      data: {
        cashMinor: nextCash,
        earnedMinor: { increment: Math.min(fallback.cashRewardMinor, EVENT_REWARD_RULES.weeklyCashCapMinor) },
        reputationBps: nextRep,
      },
    });
    const resolution = { eventId: event?.id, decisionId: fallback.id, timeout: true, costMinor: cost, resolvedAt: now };
    await prisma.plotgoPlayerEvent.updateMany({
      where: { id: expiredRow.id, choiceId: null },
      data: { status: "expired", choiceId: fallback.id, resolutionJson: resolution, resolvedAt: now },
    });
    await auditEvent(prisma, playerId, expiredRow.id, "timeout", resolution);
    await addEventPerformance(prisma, playerId, isoWeek(), marketStageForEmpireLevel(1), fallback.eventPoints);
  }
  await prisma.plotgoPlayerEvent.updateMany({
    where: { playerId, status: "active", endsAt: { lte: now } },
    data: { status: "expired" },
  });
  const rows = await prisma.plotgoPlayerEvent.findMany({
    where: { playerId, status: "active", startsAt: { lte: now }, endsAt: { gt: now } },
    orderBy: { issuedAt: "asc" },
  });
  return rows.map(eventRow);
}

export function eventFamilyModifier(event: CatalogEvent, board: PlacedCard[]): EventModifier {
  if (!board.length) return catalogModifier(event);
  const modifiers = board.map((card) => catalogModifier(event, buildingFamily(card.type)));
  const keys = ["demandBps", "activityBps", "revenueBps", "riskBps", "huntSpawnBps", "reputationDelta"] as const;
  return Object.fromEntries(keys.map((key) => [key, Math.round(modifiers.reduce((sum, modifier) => sum + modifier[key], 0) / modifiers.length)])) as EventModifier;
}

async function eventCooldownBlocked(playerId: string, event: CatalogEvent, stage: MarketStage, now: number): Promise<boolean> {
  const cooldown = EVENT_REWARD_RULES.sameEventCooldownHours[stage] * 3_600_000;
  const recent = await prisma.plotgoPlayerEvent.findFirst({
    where: { playerId, catalogId: event.id, issuedAt: { gt: now - cooldown } },
    orderBy: { issuedAt: "desc" },
  });
  return Boolean(recent);
}

export async function issuePersonalEvent(playerId: string, board: PlacedCard[], stage: MarketStage, createdAt: number, now: number): Promise<PlayerEventRow | null> {
  const active = (await activePlayerEvents(playerId, now)).filter((event) => event.scope === "Personal");
  const presence = await prisma.player.findUnique({
    where: { id: playerId },
    select: { presenceState: true, personalEventProtectionUntil: true },
  });
  if (num(presence?.personalEventProtectionUntil) > now) return active[0] ?? null;
  if (presence?.presenceState && presence.presenceState !== "engaged") return active[0] ?? null;
  if (active.length >= 2 || now - createdAt < 1) return active[0] ?? null;
  const last = await prisma.plotgoPlayerEvent.findFirst({ where: { playerId }, orderBy: { issuedAt: "desc" } });
  if (last && now - num(last.issuedAt) < 8 * 3_600_000) return active[0] ?? null;
  const ageHours = (now - createdAt) / 3_600_000;
  const recentNegative = (await prisma.plotgoPlayerEvent.findMany({ where: { playerId, issuedAt: { gt: now - EVENT_REWARD_RULES.negativePityWindowHours * 3_600_000 } } }))
    .map((row) => EVENT_CATALOG.find((event) => event.id === row.catalogId))
    .filter((event) => event?.tone === "Negative").length;
  const blockedCatalogIds = new Set<string>();
  for (const candidate of EVENT_CATALOG) {
    if (await eventCooldownBlocked(playerId, candidate, stage, now)) blockedCatalogIds.add(candidate.id);
  }
  const candidates = EVENT_CATALOG.filter((event) => event.scope === "Personal" && eventEligible(event, stage) && !blockedCatalogIds.has(event.id) && !(ageHours < 72 && event.tone === "Negative") && !(recentNegative >= 2 && event.tone === "Negative"));
  if (!candidates.length) return active[0] ?? null;
  const seed = stableEventSeed(`${playerId}:${utcDay()}:${active.length}`);
  const event = candidates[seed % candidates.length]!;
  const id = newId();
  const startsAt = now;
  const endsAt = now + event.durationHours * 3_600_000;
  await prisma.plotgoPlayerEvent.create({
    data: { id, playerId, catalogId: event.id, scope: "Personal", status: "active", issuedAt: now, startsAt, endsAt },
  });
  await auditEvent(prisma, playerId, id, "spawn", { catalogId: event.id, endsAt });
  return { id, playerId, catalogId: event.id, scope: "Personal", status: "active", issuedAt: now, startsAt, endsAt, choiceId: null, resolutionJson: null, resolvedAt: null, rewardClaimed: 0 };
}

function eventMissionRow(row: {
  id: string; playerId: string; eventId: string; templateId: string; target: number; issuedAt: bigint; expiresAt: bigint;
  status: string; claimedAt: bigint | null; rewardClaimed: boolean;
}): EventMissionRow {
  return { id: row.id, playerId: row.playerId, eventId: row.eventId, templateId: row.templateId, target: row.target, issuedAt: num(row.issuedAt), expiresAt: num(row.expiresAt), status: row.status, claimedAt: row.claimedAt == null ? null : num(row.claimedAt), rewardClaimed: row.rewardClaimed ? 1 : 0 };
}

export async function ensureEventMission(playerId: string, eventId: string, stage: MarketStage, board: PlacedCard[], now: number): Promise<EventMissionRow | null> {
  await prisma.plotgoEventMission.updateMany({
    where: { playerId, status: "active", expiresAt: { lte: now } },
    data: { status: "expired" },
  });
  const existing = await prisma.plotgoEventMission.findFirst({
    where: { playerId, status: "active" },
    orderBy: { issuedAt: "desc" },
  });
  if (existing) return eventMissionRow(existing);
  const event = EVENT_CATALOG.find((candidate) => candidate.id === eventId) ?? EVENT_CATALOG[0]!;
  const family = event.category === "Market" ? "Market" : event.category === "Risk/Crisis" ? "Risk/Crisis" : event.category;
  const candidates = EVENT_MISSIONS.filter((mission) => eventEligible({ minStage: mission.minStage } as CatalogEvent, stage) && (mission.eventFamily === family || mission.eventFamily === "Prestige" || (family === "Customer" && mission.eventFamily === "Positive Market")));
  const template = candidates[stableEventSeed(`${playerId}:${eventId}:${now}`) % Math.max(1, candidates.length)] ?? EVENT_MISSIONS.find((mission) => eventEligible({ minStage: mission.minStage } as CatalogEvent, stage)) ?? EVENT_MISSIONS[0]!;
  const boardCapacity = board.reduce((sum, card) => sum + cardCustomers(card), 0);
  const target = /customer|client|investor/i.test(template.metric) && boardCapacity > 0
    ? Math.min(template.baseTarget, Math.max(1, Math.floor(boardCapacity * 2.5)))
    : template.baseTarget;
  const id = newId();
  await prisma.plotgoEventMission.create({
    data: { id, playerId, eventId, templateId: template.id, target, issuedAt: now, expiresAt: now + template.timeLimitHours * 3_600_000 },
  });
  await auditEvent(prisma, playerId, id, "mission_spawn", { eventId, templateId: template.id, target });
  return { id, playerId, eventId, templateId: template.id, target, issuedAt: now, expiresAt: now + template.timeLimitHours * 3_600_000, status: "active", claimedAt: null, rewardClaimed: 0 };
}

export async function eventState(playerId: string, board: PlacedCard[], stage: MarketStage, createdAt: number, now = Date.now()) {
  const cycle = await ensureMarketCycle(now);
  const day = utcDay();
  const global = cycleGlobalEvent(cycle, stage, day);
  const personal = await issuePersonalEvent(playerId, board, stage, createdAt, now);
  const allRows = await activePlayerEvents(playerId, now);
  const personalRows = allRows.filter((row) => row.scope === "Personal");
  const globalChoiceRow = allRows.find((row) => row.scope === "Global" && row.catalogId === global.id) ?? null;
  const personalEvents = personalRows.map((row) => EVENT_CATALOG.find((event) => event.id === row.catalogId)).filter((event): event is CatalogEvent => Boolean(event));
  const modifiers = [cycleModifier(cycle.state), eventFamilyModifier(global, board), ...personalEvents.map((event) => eventFamilyModifier(event, board)), ...allRows.flatMap((row) => { const choice = row.choiceId ? EVENT_DECISIONS.find((decision) => decision.id === row.choiceId) : undefined; return choice ? [choice.modifier] : []; })];
  const mission = await ensureEventMission(playerId, global.id, stage, board, now);
  const moduleLocks = [...new Set([
    global.id,
    ...personalEvents.map((event) => event.id),
  ].flatMap((eventId) => board.flatMap((card) => {
    const family = buildingFamily(card.type);
    const reason = moduleLockForEvent(eventId, family);
    return reason ? [{ eventId, buildingId: card.id, family, reason }] : [];
  })))];
  return {
    cycle,
    global,
    globalChoiceRow,
    personalRows,
    personalEvents,
    mission,
    globalDecisions: EVENT_DECISIONS.filter((decision) => decision.eventId === global.id),
    moduleInteractions: {
      global: eventModuleInteraction(global.id),
      personal: personalEvents.map((event) => ({ eventId: event.id, interaction: eventModuleInteraction(event.id) })),
    },
    moduleLocks,
    modifiers: stackModifiers(modifiers),
  };
}

export async function effectiveEventModifiersForPlayer(playerId: string, board: PlacedCard[], stage: MarketStage, createdAt: number): Promise<EventModifier> {
  return (await eventState(playerId, board, stage, createdAt)).modifiers;
}

export function eventMissionProgress(mission: EventMission, metrics: { population: number; capacity: number; transactions: number; volumeMinor: number; riskBps: number; satisfactionBps: number; segments: { institutional: number } }, player: { cashMinor: number }): { current: number; target: number; done: boolean } {
  const metric = mission.metric.toLowerCase();
  let current = 0;
  let done = false;
  if (metric.includes("retention")) { current = metrics.satisfactionBps / 10_000; done = current >= mission.baseTarget; }
  else if (metric.includes("risk below")) { current = metrics.riskBps / 10_000; done = current <= mission.baseTarget; }
  else if (metric.includes("reserve ratio")) { current = Math.min(1, player.cashMinor / Math.max(1, player.cashMinor + metrics.volumeMinor)); done = current >= mission.baseTarget; }
  else if (metric.includes("capacity")) { current = metrics.capacity ? metrics.population / metrics.capacity : 0; done = current >= mission.baseTarget; }
  else if (metric.includes("institutional")) { current = metrics.segments.institutional; done = current >= mission.baseTarget; }
  else if (metric.includes("transaction")) { current = metrics.transactions; done = current >= mission.baseTarget; }
  else if (metric.includes("volume") || metric.includes("aum") || metric.includes("activity") || metric.includes("customers") || metric.includes("clients")) { current = metric.includes("customer") || metric.includes("client") ? metrics.population : metrics.volumeMinor; done = current >= mission.baseTarget; }
  else if (metric.includes("health")) { current = Math.max(0, (metrics.satisfactionBps / 10_000) * (1 - metrics.riskBps / 10_000)); done = current >= mission.baseTarget; }
  else { current = metrics.population; done = current >= mission.baseTarget; }
  return { current, target: mission.baseTarget, done };
}

export async function missionView(playerId: string, missionRow: EventMissionRow | null, metrics: { population: number; capacity: number; transactions: number; volumeMinor: number; riskBps: number; satisfactionBps: number; segments: { institutional: number } }, player: { cashMinor: number }) {
  if (!missionRow) return null;
  const template = EVENT_MISSIONS.find((candidate) => candidate.id === missionRow.templateId) ?? EVENT_MISSIONS[0]!;
  const progress = eventMissionProgress({ ...template, baseTarget: missionRow.target }, metrics, player);
  return { ...missionRow, template, progress, ready: missionRow.status === "active" && progress.done };
}
