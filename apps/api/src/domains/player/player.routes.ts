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
import { currentEmpireLevel, onboardingMilestoneRows, onboardingRow, recordOnboardingMilestone, ensureOnboardingStarted, createPlayer } from "../player/onboarding.service";
import { recordMeaningfulAction } from "../../shared/offline";
import { upsertWeeklySessionPerformance } from "../performance/performance.service";
import { snapshot, settlePlayer } from "../../shared/snapshot";
import { eventState } from "../events/events.service";
import { settleVisitEconomy } from "../economy/visits.service";
import { produceRiskAlert } from "../notifications/notifications.service";
import { awardRevenueMilestone } from "../player/empire.service";
import { newId } from "../../shared/types";

export const identityRoutes = new Hono<AppEnv>();

identityRoutes.get("/health", (c) => c.json({ ok: true }));

identityRoutes.post("/api/session", async (c) => {
  // privy mode: identity comes from the verified bearer token (requirePlayer is
  // applied in app.ts to /api/session as well), so the account already exists.
  const authed = c.get("player");
  if (authed) {
    await ensureOnboardingStarted(authed.id);
    const snap = await snapshot(authed.id);
    return c.json({ playerId: authed.id, plot: snap });
  }
  // dev mode: create-or-load by the self-declared id (prototype identity).
  const body = await c.req.json().catch(() => ({}));
  const id =
    (typeof body.playerId === "string" && body.playerId) ||
    c.req.header("x-player-id") ||
    newId();
  const existing = await prisma.player.findUnique({ where: { id } });
  if (!existing) await createPlayer({ id });
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
  // v0.2: settleDistrict derives the customer segments from the board hexes
  // (segmentMixForHex, default base mix on an empty board); the legacy
  // persisted segments and the new-player acquisition boost are no longer
  // consulted.
  let result = settleDistrict(
    activeBoard,
    activeEvent,
    body.verb,
    { cashMinor: p.cashMinor, reputationBps: p.reputationBps, conditionBps: p.conditionBps },
    dayData.seed,
    moduleEffects,
    archetype.effects,
  );
  // First customers are guaranteed structurally by the canonical customer model
  // (doc Model Assumptions): the 24h new-player acquisition boost (3x) plus the
  // affinity-seeded starting population make a zero-customer first settle
  // impossible on any non-empty board — the old demand-assist SLA path was
  // removed as superseded. The onboarding_first_customer milestone is still
  // recorded below whenever the first settle serves customers.
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
    onboardingRecovery: [],
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
        customerSegments: result.segments as object,
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
  // v1.0: session settle awards no flat XP; earned_minor may cross a revenue
  // milestone tier (100 × tier, once per tier).
  await awardRevenueMilestone(id);
  await recordMeaningfulAction(id, `session:${body.verb}`);
  // Critical risk transition alert (spec sheet 12): risk enters the critical
  // band (>=9000 bps) from below — one notification per player per day max.
  if (result.riskBps >= 9_000 && p.riskBps < 9_000) await produceRiskAlert(id, result.riskBps);
  return c.json({ ...(await snapshot(id)), receipt: outcome.receipt });
});
