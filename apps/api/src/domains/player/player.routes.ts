import { Hono } from "hono";
import { z } from "zod";
import {
  CARDS,
  SESSION_VERBS,
  STARTER_CASH_MINOR,
  collectionBonuses,
  marketEventForDay,
  marketStageForEmpireLevel,
  resolveType,
  settleDistrict,
  isoWeek,
  utcDay,
  type SessionVerb,
} from "@plotgo/game";
import type { AppEnv } from "../../shared/types";
import { requirePlayer } from "../../middleware/auth";
import { prisma } from "../../infrastructure/postgres/client";
import { archetypeResolutionForPlayer, districtDay, effectiveDistrictEvent, loadFrags, operatingBoard, sessionFor, settlePortfolio } from "../plot/board.service";
import { claimTutorialRecovery, ensureOpeningLedger, recordLedger } from "../economy/ledger.service";
import { moduleEffectsForBoard, moduleLineageRefs } from "../modules/modules.service";
import { currentEmpireLevel, onboardingMilestoneRows, onboardingRow, recordOnboardingMilestone, ensureOnboardingStarted } from "../player/onboarding.service";
import { recordMeaningfulAction } from "../../shared/offline";
import { upsertWeeklySessionPerformance } from "../performance/performance.service";
import { snapshot, settlePlayer } from "../../shared/snapshot";
import { eventState } from "../events/events.service";
import { settleVisitEconomy } from "../economy/visits.service";
import { newId } from "../../shared/types";

export const identityRoutes = new Hono<AppEnv>();

identityRoutes.get("/health", (c) => c.json({ ok: true }));

identityRoutes.post("/api/session", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const id =
    (typeof body.playerId === "string" && body.playerId) ||
    c.req.header("x-player-id") ||
    newId();
  const existing = await prisma.player.findUnique({ where: { id } });
  if (!existing) {
    const day = utcDay();
    await prisma.player.create({
      data: {
        id,
        createdAt: Date.now(),
        founder: true,
        cashMinor: STARTER_CASH_MINOR,
        earnedMinor: 0,
        lastSettleAt: Date.now(),
        exchangeActionsToday: 0,
        huntDay: day,
        huntId: "upgrade_any",
        huntClaimed: false,
        weeklyScore: 0,
        riskBps: 700,
        reputationBps: 5000,
        conditionBps: 10000,
        population: 0,
        capacity: 0,
        satisfactionBps: 5000,
        transactions: 0,
        volumeMinor: 0,
      },
    });
    await ensureOpeningLedger(prisma, id, STARTER_CASH_MINOR);
    await prisma.player.update({
      where: { id },
      data: { lastMeaningfulActionAt: Date.now(), offlineStartedAt: Date.now(), offlineProcessedUntil: Date.now(), presenceState: "engaged" },
    });
  }
  await ensureOnboardingStarted(id);
  const snap = await snapshot(id);
  return c.json({ playerId: id, plot: snap });
});

const SessionInput = z.object({
  verb: z.enum(SESSION_VERBS.map((verb) => verb.id) as [SessionVerb, ...SessionVerb[]]),
});

identityRoutes.post("/api/session/settle", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const body = SessionInput.parse(await c.req.json());
  const day = utcDay();
  const settleStartedAt = Date.now();
  const existing = await sessionFor(id, day);
  if (existing) return c.json({ ...(await snapshot(id)), receipt: existing.receipt });
  const p = await settlePlayer(id);
  if (!p) return c.json({ error: "no plot" }, 404);
  const dayData = await districtDay(id, day);
  const marketEvent = marketEventForDay(day, id);
  const { map } = await loadFrags(id);
  const activeBoard = operatingBoard(p.board);
  const eventLayer = await eventState(id, activeBoard, marketStageForEmpireLevel(await currentEmpireLevel(id, activeBoard)), p.createdAt);
  const activeEvent = effectiveDistrictEvent(dayData.event, marketEvent, collectionBonuses(map).customerDemandBps, eventLayer.modifiers);
  const moduleEffects = await moduleEffectsForBoard(id, activeBoard, [eventLayer.global.id, ...eventLayer.personalEvents.map((event) => event.id)], eventLayer.cycle.state);
  // Replay lineage (spec sheets 10/13): only attached to the ledger when a module affected the settle.
  const moduleLineage = await moduleLineageRefs(id, activeBoard, moduleEffects);
  const archetype = await archetypeResolutionForPlayer(id, activeBoard);
  let result = settleDistrict(
    activeBoard,
    activeEvent,
    body.verb,
    { cashMinor: p.cashMinor, reputationBps: p.reputationBps, conditionBps: p.conditionBps },
    dayData.seed,
    moduleEffects,
    archetype.effects,
  );
  let firstCustomerAssistUsed = false;
  const onboarding = await onboardingRow(id);
  const onboardingElapsedMs = onboarding?.onboardingStartedAt == null ? 0 : Date.now() - onboarding.onboardingStartedAt;
  const firstCustomerMissing = !(await onboardingMilestoneRows(id)).some((milestone) => milestone.milestoneId === "onboarding_first_customer");
  if ((result.population <= 0 || result.transactions <= 0) && activeBoard.length > 0 && onboarding?.onboardingStatus === "active" && onboarding.firstCustomerAssistUsed === 0 && firstCustomerMissing && onboardingElapsedMs >= 2 * 60_000) {
    const capacityBeforeAssist = activeBoard.reduce((sum, card) => sum + Math.max(1, CARDS[resolveType(card.type)]?.customersBase ?? 1), 0);
    if (capacityBeforeAssist > 0 && await claimTutorialRecovery(id, "first_customer_assist", 0, { reason: "first_customer_demand_sla", elapsedMinutes: Number((onboardingElapsedMs / 60_000).toFixed(2)) })) {
      const assistedEvent = { ...activeEvent, populationBps: Math.max(activeEvent.populationBps, 10_000) };
      const assistedResult = settleDistrict(
        activeBoard,
        assistedEvent,
        body.verb,
        { cashMinor: p.cashMinor, reputationBps: p.reputationBps, conditionBps: p.conditionBps },
        dayData.seed,
        moduleEffects,
        archetype.effects,
      );
      if (assistedResult.population > 0) {
        result = assistedResult;
        firstCustomerAssistUsed = true;
      }
    }
  }
  const portfolio = await settlePortfolio(id, day, dayData.marks);
  const portfolioCashMinor = portfolio.applied ? portfolio.feeMinor : 0;
  const totalCashDeltaMinor = result.cashDeltaMinor + portfolioCashMinor;
  const nextCash = Math.max(0, p.cashMinor + totalCashDeltaMinor);
  const performanceStage = marketStageForEmpireLevel(await currentEmpireLevel(id, p.board));
  const receipt = {
    day,
    event: dayData.event,
    marketEvent,
    verb: body.verb,
    lines: portfolio.applied ? [...result.lines, { label: "Portfolio AUM fee", amountMinor: portfolioCashMinor }] : result.lines,
    cashDeltaMinor: totalCashDeltaMinor,
    cashAfterMinor: nextCash,
    riskBps: result.riskBps,
    reputationBps: result.reputationBps,
    transactions: result.transactions,
    volumeMinor: result.volumeMinor,
    synergyCount: result.synergyCount,
    revenue: result.revenue,
    portfolio: {
      applied: portfolio.applied,
      marks: portfolio.marks,
      grossMarkMinor: portfolio.grossMarkMinor,
      preFeeAumMinor: portfolio.preFeeAumMinor,
      feeMinor: portfolio.feeMinor,
      endAumMinor: portfolio.endAumMinor,
    },
    onboardingRecovery: firstCustomerAssistUsed ? ["first_customer_assist"] : [],
  };
  const week = isoWeek(new Date(`${day}T00:00:00Z`));
  const activeDaysThisWeek = p.activeDays.filter((activeDay) => isoWeek(new Date(`${activeDay}T00:00:00Z`)) === week).length;
  // Hardened: the whole settle is one transaction; the daily session row is guarded
  // by the (playerId, day) unique key — a concurrent settle returns the winner's receipt.
  // The visit-economy hook runs after the absolute cash write so its conditional
  // debits see the settled balance; its net delta folds into the session ledger row.
  const outcome = await prisma.$transaction(async (tx) => {
    const inserted = await tx.plotgoSession.createMany({
      data: [{ playerId: id, day, verb: body.verb, receiptJson: receipt as unknown as object, settledAt: Date.now() }],
      skipDuplicates: true,
    });
    if (inserted.count !== 1) {
      const winner = await tx.plotgoSession.findUnique({ where: { playerId_day: { playerId: id, day } } });
      return { applied: false as const, receipt: winner?.receiptJson ?? null };
    }
    await tx.player.update({
      where: { id },
      data: {
        cashMinor: nextCash,
        earnedMinor: p.earnedMinor + result.earnedDeltaMinor + portfolioCashMinor,
        riskBps: result.riskBps,
        reputationBps: result.reputationBps,
        conditionBps: result.conditionBps,
        population: result.population,
        capacity: result.capacity,
        satisfactionBps: result.satisfactionBps,
        transactions: result.transactions,
        volumeMinor: result.volumeMinor,
        weeklyScore: p.weeklyScore + result.earnedDeltaMinor + portfolioCashMinor,
      },
    });
    const visitEconomy = await settleVisitEconomy(
      tx,
      id,
      day,
      result.revenue,
      new Set(activeBoard.map((card) => card.id)),
      settleStartedAt,
    );
    const finalCash = Math.max(0, nextCash + visitEconomy.cashDeltaMinor);
    const finalReceipt = {
      ...receipt,
      cashAfterMinor: finalCash,
      visitEconomyMinor: visitEconomy.cashDeltaMinor,
      visitEconomy: {
        yieldsChargedMinor: visitEconomy.yieldsChargedMinor,
        repaidMinor: visitEconomy.repaidMinor,
        receivedMinor: visitEconomy.receivedMinor,
      },
    };
    await tx.plotgoSession.update({
      where: { playerId_day: { playerId: id, day } },
      data: { receiptJson: finalReceipt as unknown as object },
    });
    await upsertWeeklySessionPerformance(tx, id, week, performanceStage, activeDaysThisWeek, p.population, result);
    await recordLedger(tx, id, day, "session", totalCashDeltaMinor + visitEconomy.cashDeltaMinor, finalCash, moduleLineage ? { ...finalReceipt, ...moduleLineage } : finalReceipt);
    return { applied: true as const, receipt: finalReceipt as unknown };
  });
  if (!outcome.applied) {
    return c.json({ ...(await snapshot(id)), receipt: outcome.receipt });
  }
  if (result.population > 0) await recordOnboardingMilestone(id, "onboarding_first_customer", "session.settle");
  if (totalCashDeltaMinor > 0) await recordOnboardingMilestone(id, "onboarding_first_cash", "session.settle");
  await recordMeaningfulAction(id, `session:${body.verb}`);
  return c.json({ ...(await snapshot(id)), receipt: outcome.receipt });
});
