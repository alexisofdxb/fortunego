import { Hono } from "hono";
import { z } from "zod";
import {
  EVENT_CATALOG,
  EVENT_DECISIONS,
  EVENT_MISSIONS,
  EVENT_REWARD_RULES,
  collectionBonuses,
  empireLevel,
  isoWeek,
  marketEventForDay,
  marketStageForEmpireLevel,
  moduleRewardLabel,
  rollEventModuleReward,
  settleDistrict,
  utcDay,
} from "@plotgo/game";
import type { AppEnv } from "../../shared/types";
import { requirePlayer } from "../../middleware/auth";
import { prisma } from "../../infrastructure/postgres/client";
import { addStockUnits, archetypeResolutionForPlayer, districtDay, effectiveDistrictEvent, loadFrags, operatingBoard } from "../plot/board.service";
import { eventMissionProgress, eventState, type EventMissionRow } from "./events.service";
import { ensureMarketCycle, stableEventSeed } from "./market-cycle.service";
import { grantPendingModuleReward, moduleEffectsForBoard } from "../modules/modules.service";
import { recordMeaningfulAction } from "../../shared/offline";
import { addEventPerformance, eventRewardBudgetUsed } from "../performance/performance.service";
import { recordLedger } from "../economy/ledger.service";
import { auditEvent } from "../plot/audit.service";
import { snapshot, settlePlayer } from "../../shared/snapshot";
import { num } from "../../shared/types";

export const eventRoutes = new Hono<AppEnv>();

const EventChoiceInput = z.object({ eventId: z.string(), decisionId: z.string() });

eventRoutes.post("/api/event/choose", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const p = await settlePlayer(id);
  if (!p) return c.json({ error: "no plot" }, 404);
  const body = EventChoiceInput.parse(await c.req.json());
  let row = await prisma.plotgoPlayerEvent.findFirst({ where: { playerId: id, id: body.eventId, status: "active" } });
  if (!row) {
    const global = EVENT_CATALOG.find((candidate) => candidate.id === body.eventId && candidate.scope === "Global");
    if (global && global.playerChoice) {
      const currentGlobal = (await eventState(id, operatingBoard(p.board), marketStageForEmpireLevel(empireLevel(operatingBoard(p.board))), p.createdAt)).global;
      if (currentGlobal.id !== global.id) return c.json({ error: "That global event is not active" }, 409);
      const cycle = await ensureMarketCycle();
      const now = Date.now();
      const existing = await prisma.plotgoPlayerEvent.findFirst({ where: { playerId: id, catalogId: global.id, scope: "Global", status: "active" } });
      if (existing) row = existing;
      else {
        const eventId = crypto.randomUUID();
        const endsAt = Math.min(cycle.endsAt, now + global.durationHours * 3_600_000);
        row = await prisma.plotgoPlayerEvent.create({
          data: { id: eventId, playerId: id, catalogId: global.id, scope: "Global", status: "active", issuedAt: now, startsAt: now, endsAt },
        });
        await auditEvent(prisma, id, eventId, "global_choice_open", { catalogId: global.id, endsAt });
      }
    }
  }
  if (!row) return c.json({ error: "Active event not found" }, 404);
  if (row.choiceId) return c.json({ error: "Event choice already resolved" }, 409);
  const event = EVENT_CATALOG.find((candidate) => candidate.id === row!.catalogId);
  const decision = EVENT_DECISIONS.find((candidate) => candidate.id === body.decisionId && candidate.eventId === event?.id);
  if (!event || !decision) return c.json({ error: "Invalid event decision" }, 400);
  if (p.cashMinor < decision.immediateCostMinor) return c.json({ error: "Not enough Cash for this decision" }, 400);
  const week = isoWeek();
  const remainingBudget = Math.max(0, EVENT_REWARD_RULES.weeklyCashCapMinor - await eventRewardBudgetUsed(id, week));
  const cashReward = Math.min(decision.cashRewardMinor, remainingBudget);
  const nextCash = p.cashMinor - decision.immediateCostMinor + cashReward;
  const nextReputation = Math.max(0, Math.min(10_000, p.reputationBps + decision.modifier.reputationDelta * 100));
  const moduleReward = rollEventModuleReward(event.id, stableEventSeed(`${id}:${row.id}:${decision.id}`), "decision");
  // Reward grant is idempotent (unique source key) and happens before the claim,
  // mirroring the old ordering.
  const moduleRewardId = await grantPendingModuleReward(prisma, id, "event_decision", row.id, moduleReward, { eventId: event.id, decisionId: decision.id });
  const resolution = { eventId: event.id, decisionId: decision.id, costMinor: decision.immediateCostMinor, cashRewardMinor: cashReward, eventPoints: decision.eventPoints, moduleRewardId, resolvedAt: Date.now() };
  // Hardened: conditional event-row claim (choiceId IS NULL guard) + conditional
  // cash debit inside one transaction; a lost cash race rolls the claim back.
  class InsufficientCashError extends Error {}
  let chosen: { ok: true } | { conflict: true } | { insufficient: true };
  try {
    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.plotgoPlayerEvent.updateMany({
        where: { id: row!.id, playerId: id, choiceId: null },
        data: { choiceId: decision.id, resolutionJson: resolution as unknown as object, resolvedAt: Date.now() },
      });
      if (claimed.count !== 1) return { conflict: true } as const;
      const paid = await tx.player.updateMany({
        where: { id, cashMinor: { gte: decision.immediateCostMinor } },
        data: { cashMinor: nextCash, earnedMinor: p.earnedMinor + cashReward, reputationBps: nextReputation },
      });
      if (paid.count !== 1) throw new InsufficientCashError();
      return { ok: true } as const;
    });
    chosen = result;
  } catch (error) {
    if (error instanceof InsufficientCashError) chosen = { insufficient: true };
    else throw error;
  }
  if ("conflict" in chosen) return c.json({ error: "Event choice already resolved" }, 409);
  if ("insufficient" in chosen) return c.json({ error: "Not enough Cash for this decision" }, 409);
  if (cashReward > 0 || moduleRewardId) await auditEvent(prisma, id, row.id, "reward", { amountMinor: cashReward, moduleRewardId, reason: "event_decision", decisionId: decision.id });
  await addEventPerformance(prisma, id, week, marketStageForEmpireLevel(empireLevel(p.board)), decision.eventPoints);
  await auditEvent(prisma, id, row.id, "decision", resolution);
  await recordLedger(prisma, id, utcDay(), "event", cashReward - decision.immediateCostMinor, nextCash, resolution);
  await recordMeaningfulAction(id, `event:${event.id}`);
  const snap = await snapshot(id);
  return c.json({ ...snap, moduleReward: moduleReward ? { ...moduleReward, label: moduleRewardLabel(moduleReward), rewardId: moduleRewardId } : null });
});

eventRoutes.post("/api/event/mission/claim", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const p = await settlePlayer(id);
  if (!p) return c.json({ error: "no plot" }, 404);
  const body = z.object({ missionId: z.string().optional() }).parse(await c.req.json().catch(() => ({})));
  const row = body.missionId
    ? await prisma.plotgoEventMission.findFirst({ where: { playerId: id, id: body.missionId, status: "active" } })
    : await prisma.plotgoEventMission.findFirst({ where: { playerId: id, status: "active" }, orderBy: { issuedAt: "desc" } });
  if (!row) return c.json({ error: "No active event mission" }, 404);
  const missionRow: EventMissionRow = { id: row.id, playerId: row.playerId, eventId: row.eventId, templateId: row.templateId, target: row.target, issuedAt: num(row.issuedAt), expiresAt: num(row.expiresAt), status: row.status, claimedAt: row.claimedAt == null ? null : num(row.claimedAt), rewardClaimed: row.rewardClaimed ? 1 : 0 };
  const template = EVENT_MISSIONS.find((candidate) => candidate.id === missionRow.templateId);
  if (!template) return c.json({ error: "Mission template missing" }, 500);
  const day = utcDay();
  const dayData = await districtDay(id, day);
  const marketEvent = marketEventForDay(day, id);
  const { map } = await loadFrags(id);
  const activeBoard = operatingBoard(p.board);
  const stage = marketStageForEmpireLevel(empireLevel(activeBoard));
  const eventLayer = await eventState(id, activeBoard, stage, p.createdAt);
  const activeEvent = effectiveDistrictEvent(dayData.event, marketEvent, collectionBonuses(map).customerDemandBps, eventLayer.modifiers);
  const moduleEffects = await moduleEffectsForBoard(id, activeBoard, [eventLayer.global.id, ...eventLayer.personalEvents.map((event) => event.id)], eventLayer.cycle.state);
  const archetype = await archetypeResolutionForPlayer(id, activeBoard);
  const metrics = settleDistrict(activeBoard, activeEvent, "walk", { cashMinor: p.cashMinor, reputationBps: p.reputationBps, conditionBps: p.conditionBps }, dayData.seed, moduleEffects, archetype.effects);
  const progress = eventMissionProgress({ ...template, baseTarget: missionRow.target }, metrics, p);
  if (!progress.done) return c.json({ error: "Event mission not complete", progress }, 400);
  const week = isoWeek();
  const remainingBudget = Math.max(0, EVENT_REWARD_RULES.weeklyCashCapMinor - await eventRewardBudgetUsed(id, week));
  const cashReward = Math.min(template.cashRewardMinor, remainingBudget);
  const nextCash = p.cashMinor + cashReward;
  const nextReputation = Math.max(0, Math.min(10_000, p.reputationBps + template.repReward * 100));
  const moduleReward = rollEventModuleReward(missionRow.eventId, stableEventSeed(`${id}:${missionRow.id}:${template.id}`), "mission");
  // Atomic mission claim: conditional status flip; rewards applied only when the claim wins.
  const claimed = await prisma.$transaction(async (tx) => {
    const updated = await tx.plotgoEventMission.updateMany({
      where: { id: missionRow.id, playerId: id, status: "active" },
      data: { status: "claimed", claimedAt: Date.now(), rewardClaimed: true },
    });
    if (updated.count !== 1) return null;
    await tx.player.update({ where: { id }, data: { cashMinor: nextCash, earnedMinor: p.earnedMinor + cashReward, reputationBps: nextReputation } });
    const moduleRewardId = await grantPendingModuleReward(tx, id, "event_mission", missionRow.id, moduleReward, { eventId: missionRow.eventId, templateId: template.id });
    return { moduleRewardId };
  });
  if (!claimed) return c.json({ error: "Event mission already claimed" }, 409);
  const moduleRewardId = claimed.moduleRewardId;
  if (cashReward > 0 || moduleRewardId) await auditEvent(prisma, id, missionRow.id, "reward", { amountMinor: cashReward, moduleRewardId, reason: "event_mission", templateId: template.id });
  await addEventPerformance(prisma, id, week, stage, template.eventPoints);
  const reward = { missionId: missionRow.id, templateId: template.id, cashRewardMinor: cashReward, repReward: template.repReward, eventPoints: template.eventPoints, moduleRewardId };
  await auditEvent(prisma, id, missionRow.id, "mission_claim", reward);
  await recordLedger(prisma, id, day, "event_mission", cashReward, nextCash, reward);
  await recordMeaningfulAction(id, `event_mission:${missionRow.id}`);
  const snap = await snapshot(id);
  return c.json({ ...snap, moduleReward: moduleReward ? { ...moduleReward, label: moduleRewardLabel(moduleReward), rewardId: moduleRewardId } : null });
});

eventRoutes.get("/api/events", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const snap = await snapshot(id);
  if (!snap) return c.json({ error: "no plot" }, 404);
  return c.json(snap.eventState);
});
