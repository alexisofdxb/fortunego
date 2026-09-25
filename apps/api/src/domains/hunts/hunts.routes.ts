import { Hono } from "hono";
import { z } from "zod";
import {
  collectionBonuses,
  isoWeek,
  marketEventForDay,
  marketStageForEmpireLevel,
  moduleRewardLabel,
  rewardUnitsMicrosAtPrice,
  settleDistrict,
  utcDay,
} from "@plotgo/game";
import type { AppEnv } from "../../shared/types";
import { requirePlayer } from "../../middleware/auth";
import { prisma } from "../../infrastructure/postgres/client";
import { addStockUnits, archetypeResolutionForPlayer, districtDay, effectiveDistrictEvent, loadFrags, operatingBoard, stockClaimGate } from "../plot/board.service";
import { eventState } from "../events/events.service";
import { claimMarketReservation, huntProgress, oraclePriceMinor, templateForSlot } from "./hunts.service";
import { rerollDailyOffer, startHuntOffer } from "./offers.service";
import { grantPendingModuleReward, moduleEffectsForBoard } from "../modules/modules.service";
import { currentEmpireLevel, recordOnboardingMilestone } from "../player/onboarding.service";
import { recordMeaningfulAction } from "../../shared/offline";
import { addWeeklyHuntPerformance } from "../performance/performance.service";
import { recordLedger } from "../economy/ledger.service";
import { snapshot, settlePlayer } from "../../shared/snapshot";
import { num } from "../../shared/types";

export const huntRoutes = new Hono<AppEnv>();

const HuntClaim = z.object({ huntId: z.string().optional() });
const HuntStart = z.object({ huntId: z.string() });
const HuntReroll = z.object({ huntId: z.string().optional() });

/** Start an unstarted offer: freezes the reward and starts the real-time timer. */
huntRoutes.post("/api/hunts/start", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const body = HuntStart.parse(await c.req.json().catch(() => ({})));
  const result = await startHuntOffer(id, body.huntId);
  if ("error" in result) return c.json({ error: result.error }, result.status);
  await recordMeaningfulAction(id, `hunt_start:${body.huntId}`);
  return c.json({ ...(await snapshot(id)), started: body.huntId });
});

/** Free daily reroll: replaces one unstarted offer (1/day, spec sheet 05). */
huntRoutes.post("/api/hunts/reroll", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const body = HuntReroll.parse(await c.req.json().catch(() => ({})));
  const result = await rerollDailyOffer(id, utcDay(), body.huntId);
  if ("error" in result) return c.json({ error: result.error }, result.status);
  await recordMeaningfulAction(id, "hunt:reroll");
  return c.json(await snapshot(id));
});

huntRoutes.post("/api/hunt/claim", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const p = await settlePlayer(id);
  if (!p) return c.json({ error: "no plot" }, 404);
  const body = HuntClaim.parse(await c.req.json().catch(() => ({})));
  const slot = p.marketHunts.find((candidate) => candidate.id === body.huntId && candidate.started)
    ?? p.marketHunts.find((candidate) => candidate.started && (candidate.status === "active" || candidate.status === "cash_fallback"));
  if (!slot) return c.json({ error: "No active Market Hunt" }, 400);
  if (slot.status === "claimed") return c.json({ error: "Already claimed" }, 400);
  if (slot.status === "expired") return c.json({ error: "Hunt expired" }, 400);
  const hunt = templateForSlot(slot);
  const day = utcDay();
  const dayData = await districtDay(id, day);
  const marketEvent = marketEventForDay(day, id);
  const { map } = await loadFrags(id);
  const activeBoard = operatingBoard(p.board);
  const eventLayer = await eventState(id, activeBoard, marketStageForEmpireLevel(await currentEmpireLevel(id, activeBoard)), p.createdAt);
  const activeEvent = effectiveDistrictEvent(dayData.event, marketEvent, collectionBonuses(map).customerDemandBps, eventLayer.modifiers);
  const moduleEffects = await moduleEffectsForBoard(id, activeBoard, [eventLayer.global.id, ...eventLayer.personalEvents.map((event) => event.id)], eventLayer.cycle.state);
  const archetype = await archetypeResolutionForPlayer(id, activeBoard);
  const metrics = settleDistrict(
    activeBoard,
    activeEvent,
    "walk",
    { cashMinor: p.cashMinor, reputationBps: p.reputationBps, conditionBps: p.conditionBps },
    dayData.seed,
    moduleEffects,
    archetype.effects,
  );
  const prog = huntProgress(p, slot, hunt, metrics, map);
  if (!prog.done) return c.json({ error: "Hunt not complete" }, 400);
  const gate = stockClaimGate(p);
  if (slot.stockTicker && !gate.eligible) return c.json({ error: gate.reason }, 403);
  // Atomic claim: conditional status flip inside a transaction (only 'active'/'cash_fallback' can claim).
  const claimResult = await prisma.$transaction(async (tx) => {
    const claimed = await tx.marketHuntSlot.updateMany({
      where: { id: slot.id, status: { in: ["active", "cash_fallback"] } },
      data: { status: "claimed", claimedAt: Date.now(), reservedMinor: 0 },
    });
    if (claimed.count !== 1) return null;
    const claimPriceMinor = slot.stockTicker ? await oraclePriceMinor(slot.stockTicker) : 0;
    if (slot.stockTicker && slot.rewardValueMinor > 0) {
      await addStockUnits(id, slot.stockTicker, rewardUnitsMicrosAtPrice(slot.rewardValueMinor, claimPriceMinor));
      await claimMarketReservation(slot);
    }
    const fallbackCashMinor = slot.stockTicker ? 0 : slot.rewardValueMinor;
    const moduleRewardId = await grantPendingModuleReward(tx, id, "market_hunt", slot.id, slot.moduleReward, { huntId: hunt.id, difficulty: slot.difficulty, stockTicker: slot.stockTicker });
    await tx.player.update({ where: { id }, data: { cashMinor: { increment: fallbackCashMinor }, earnedMinor: { increment: fallbackCashMinor }, huntClaimed: false } });
    await addWeeklyHuntPerformance(tx, id, slot.week, marketStageForEmpireLevel(await currentEmpireLevel(id, p.board)), p.activeDays.filter((activeDay) => isoWeek(new Date(`${activeDay}T00:00:00Z`)) === slot.week).length);
    const balance = await tx.player.findUnique({ where: { id }, select: { cashMinor: true } });
    await recordLedger(tx, id, day, "hunt", fallbackCashMinor, num(balance?.cashMinor), { hunt: hunt.id, ticker: slot.stockTicker, oraclePriceMinor: claimPriceMinor, rewardRarity: slot.rewardRarity, rewardValueMinor: slot.rewardValueMinor, points: slot.points, moduleRewardId });
    return { claimPriceMinor, fallbackCashMinor, moduleRewardId };
  });
  if (!claimResult) return c.json({ error: "Hunt already claimed" }, 409);
  await recordOnboardingMilestone(id, "onboarding_first_hunt_complete", "hunt.claim");
  if (slot.stockTicker) await recordOnboardingMilestone(id, "onboarding_first_stock", "stock.reward");
  await recordMeaningfulAction(id, `hunt:${slot.id}`);
  const snap = await snapshot(id);
  return c.json({ ...snap, dropped: slot.stockTicker, fallbackCashMinor: claimResult.fallbackCashMinor, rewardRarity: slot.rewardRarity, rewardValueMinor: slot.rewardValueMinor, moduleReward: slot.moduleReward ? { ...slot.moduleReward, label: moduleRewardLabel(slot.moduleReward), rewardId: claimResult.moduleRewardId } : null, huntPoints: slot.points });
});
