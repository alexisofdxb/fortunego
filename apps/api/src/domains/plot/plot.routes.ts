import { Hono } from "hono";
import { z } from "zod";
import {
  CARDS,
  fits,
  isUnlocked,
  buildingUnlockLevel,
  resolveType,
  upgradeCostMinor,
  utcDay,
  type Orientation,
} from "@plotgo/game";
import type { AppEnv } from "../../shared/types";
import { requirePlayer } from "../../middleware/auth";
import { prisma } from "../../infrastructure/postgres/client";
import { buildValueMinor, districtDay, isTrade, loadCards } from "../plot/board.service";
import { claimTutorialRecovery, recordLedger } from "../economy/ledger.service";
import { currentEmpireLevel, hasTutorialCashAccessSynergy, recordOnboardingMilestone, tutorialRelocationAvailable } from "../player/onboarding.service";
import { recordMeaningfulAction } from "../../shared/offline";
import { eventMoveLock, settlePlayer, snapshot } from "../../shared/snapshot";
import { newId } from "../../shared/types";

export const plotRoutes = new Hono<AppEnv>();

plotRoutes.get("/api/plot", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const snap = await snapshot(id);
  if (!snap) return c.json({ error: "no plot" }, 404);
  return c.json(snap);
});

const Place = z.object({
  type: z.string(),
  x: z.number().int().min(0).max(11),
  y: z.number().int().min(0).max(11),
  orientation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0),
});

plotRoutes.post("/api/plot/place", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const p = await settlePlayer(id);
  if (!p) return c.json({ error: "no plot" }, 404);
  const body = Place.parse(await c.req.json());
  const spec = CARDS[resolveType(body.type)];
  if (!spec) return c.json({ error: "Unknown building" }, 400);
  const level = await currentEmpireLevel(id, p.board);
  if (!isUnlocked(spec.id, p.board, level)) {
    const unlockLevel = buildingUnlockLevel(spec.id);
    return c.json({ error: `Building Card unlocks at Empire Level ${unlockLevel ?? "?"}.` }, 400);
  }
  if (p.cashMinor < spec.placeCostMinor) {
    return c.json({ error: "Not enough Cash" }, 400);
  }
  if (!fits(p.board, spec.id, body.x, body.y, undefined, 12, body.orientation)) {
    return c.json({ error: "Does not fit" }, 400);
  }
  const cardId = newId();
  await prisma.card.create({
    data: {
      id: cardId,
      playerId: id,
      type: spec.id,
      x: body.x,
      y: body.y,
      stage: 1,
      orientation: body.orientation,
      placedAt: Date.now(),
      operationalUntil: 0,
    },
  });
  let exchange = p.exchangeActionsToday;
  if (isTrade(spec.id)) exchange += 1;
  // Hardened cash debit: conditional update fails atomically if the balance dropped below the cost.
  const paid = await prisma.player.updateMany({
    where: { id, cashMinor: { gte: spec.placeCostMinor } },
    data: { cashMinor: { decrement: spec.placeCostMinor }, exchangeActionsToday: exchange },
  });
  if (paid.count !== 1) return c.json({ error: "Not enough Cash" }, 409);
  await recordLedger(prisma, id, utcDay(), "build", -spec.placeCostMinor, p.cashMinor - spec.placeCostMinor, { type: spec.id });
  if (spec.id === "cash_kiosk") await recordOnboardingMilestone(id, "onboarding_first_build", "plot.place");
  if (spec.id === "trading_booth") await recordOnboardingMilestone(id, "onboarding_second_business", "plot.place");
  if (spec.id === "savings_stand") await recordOnboardingMilestone(id, "onboarding_third_business", "plot.place");
  const placedBoard = await loadCards(id);
  if (hasTutorialCashAccessSynergy(placedBoard)) await recordOnboardingMilestone(id, "onboarding_first_synergy", "placement.resolve");
  await recordMeaningfulAction(id, `place:${spec.id}`);
  return c.json(await snapshot(id, newId()));
});

const Move = z.object({
  cardId: z.string(),
  x: z.number().int().min(0).max(11),
  y: z.number().int().min(0).max(11),
  orientation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
});

plotRoutes.post("/api/plot/move", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const p = await settlePlayer(id);
  if (!p) return c.json({ error: "no plot" }, 404);
  const body = Move.parse(await c.req.json());
  const card = p.board.find((x) => x.id === body.cardId);
  if (!card) return c.json({ error: "missing card" }, 404);
  const now = Date.now();
  const tutorialCorrection = (await tutorialRelocationAvailable(id, p.board, now)) &&
    (card.type === "cash_kiosk" || card.type === "savings_stand");
  const day = utcDay();
  const dayData = await districtDay(id, day);
  const eventLock = eventMoveLock(card, dayData.event.id);
  if (eventLock && !tutorialCorrection) return c.json({ error: eventLock }, 409);
  if (card.operationalUntil && card.operationalUntil > Date.now()) return c.json({ error: "Building is still in relocation downtime" }, 409);
  const orientation = (body.orientation ?? card.orientation ?? 0) as Orientation;
  if (!fits(p.board, card.type, body.x, body.y, card.id, 12, orientation)) {
    return c.json({ error: "Does not fit" }, 400);
  }
  const freeWindow = !card.placedAt || now - card.placedAt < 24 * 3_600_000;
  const normalFee = freeWindow ? 0 : Math.round(buildValueMinor(card) * 0.05);
  const fee = tutorialCorrection ? 0 : normalFee;
  if (p.cashMinor < fee) return c.json({ error: "Not enough Cash for relocation fee" }, 400);
  const downtimeUntil = tutorialCorrection || freeWindow ? 0 : now + 15 * 60_000;
  await prisma.card.update({ where: { id: body.cardId }, data: { x: body.x, y: body.y, orientation, operationalUntil: downtimeUntil } });
  if (tutorialCorrection) {
    await claimTutorialRecovery(id, "free_tutorial_relocation", normalFee, {
      cardId: body.cardId,
      type: card.type,
      reason: "cash_access_synergy_recovery",
    });
  }
  if (fee > 0) {
    const paid = await prisma.player.updateMany({ where: { id, cashMinor: { gte: fee } }, data: { cashMinor: { decrement: fee } } });
    if (paid.count !== 1) return c.json({ error: "Not enough Cash for relocation fee" }, 409);
    await recordLedger(prisma, id, day, "relocation", -fee, p.cashMinor - fee, { cardId: body.cardId, feeMinor: fee, downtimeUntil });
  }
  await recordMeaningfulAction(id, `move:${body.cardId}`);
  return c.json(await snapshot(id, newId()));
});

plotRoutes.post("/api/plot/rotate", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const p = await settlePlayer(id);
  if (!p) return c.json({ error: "no plot" }, 404);
  const body = z.object({ cardId: z.string(), orientation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]) }).parse(await c.req.json());
  const card = p.board.find((x) => x.id === body.cardId);
  if (!card) return c.json({ error: "missing card" }, 404);
  if (card.orientation === body.orientation) return c.json(await snapshot(id));
  const now = Date.now();
  const tutorialCorrection = (await tutorialRelocationAvailable(id, p.board, now)) &&
    (card.type === "cash_kiosk" || card.type === "savings_stand");
  // Rotation follows the same authoritative relocation rules as a move.
  const dayData = await districtDay(id, utcDay());
  const eventLock = eventMoveLock(card, dayData.event.id);
  if (eventLock && !tutorialCorrection) return c.json({ error: eventLock }, 409);
  if (card.operationalUntil && card.operationalUntil > Date.now()) return c.json({ error: "Building is still in relocation downtime" }, 409);
  if (!fits(p.board, card.type, card.x, card.y, card.id, 12, body.orientation)) return c.json({ error: "Rotated footprint does not fit" }, 400);
  const freeWindow = !card.placedAt || now - card.placedAt < 24 * 3_600_000;
  const normalFee = freeWindow ? 0 : Math.round(buildValueMinor(card) * 0.05);
  const fee = tutorialCorrection ? 0 : normalFee;
  if (p.cashMinor < fee) return c.json({ error: "Not enough Cash for relocation fee" }, 400);
  const downtimeUntil = tutorialCorrection || freeWindow ? 0 : now + 15 * 60_000;
  await prisma.card.update({ where: { id: card.id }, data: { orientation: body.orientation, operationalUntil: downtimeUntil } });
  if (tutorialCorrection) {
    await claimTutorialRecovery(id, "free_tutorial_relocation", normalFee, {
      cardId: card.id,
      type: card.type,
      reason: "cash_access_synergy_recovery",
    });
  }
  if (fee > 0) {
    const paid = await prisma.player.updateMany({ where: { id, cashMinor: { gte: fee } }, data: { cashMinor: { decrement: fee } } });
    if (paid.count !== 1) return c.json({ error: "Not enough Cash for relocation fee" }, 409);
    await recordLedger(prisma, id, utcDay(), "rotation", -fee, p.cashMinor - fee, { cardId: card.id, feeMinor: fee, downtimeUntil });
  }
  await recordMeaningfulAction(id, `rotate:${card.id}`);
  return c.json(await snapshot(id, newId()));
});

const Upgrade = z.object({ cardId: z.string() });

plotRoutes.post("/api/plot/upgrade", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const p = await settlePlayer(id);
  if (!p) return c.json({ error: "no plot" }, 404);
  const { cardId } = Upgrade.parse(await c.req.json());
  const card = p.board.find((x) => x.id === cardId);
  if (!card) return c.json({ error: "missing card" }, 404);
  if (card.stage >= 3) return c.json({ error: "Max stage" }, 400);
  const cost = upgradeCostMinor(card.type, card.stage as 1 | 2);
  if (p.cashMinor < cost) return c.json({ error: "Not enough Cash" }, 400);
  await prisma.card.update({ where: { id: cardId }, data: { stage: card.stage + 1 } });
  let exchange = p.exchangeActionsToday;
  if (isTrade(card.type)) exchange += 1;
  const paid = await prisma.player.updateMany({
    where: { id, cashMinor: { gte: cost } },
    data: { cashMinor: { decrement: cost }, exchangeActionsToday: exchange },
  });
  if (paid.count !== 1) return c.json({ error: "Not enough Cash" }, 409);
  await recordLedger(prisma, id, utcDay(), "upgrade", -cost, p.cashMinor - cost, { cardId, type: card.type, toStage: card.stage + 1 });
  if (card.type === "cash_kiosk" && card.stage === 1) await recordOnboardingMilestone(id, "onboarding_first_upgrade", "plot.upgrade");
  await recordMeaningfulAction(id, `upgrade:${cardId}`);
  return c.json(await snapshot(id));
});

plotRoutes.post("/api/plot/repair", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const p = await settlePlayer(id);
  if (!p) return c.json({ error: "no plot" }, 404);
  if (p.conditionBps >= 10_000) return c.json({ error: "District is already in good condition" }, 400);
  const cost = Math.max(50 * 100, p.board.reduce((sum, card) => sum + Math.round(CARDS[card.type].placeCostMinor * card.stage / 50), 0));
  if (p.cashMinor < cost) return c.json({ error: "Not enough Cash" }, 400);
  const conditionBps = Math.min(10_000, p.conditionBps + 2_000);
  const paid = await prisma.player.updateMany({
    where: { id, cashMinor: { gte: cost } },
    data: { cashMinor: { decrement: cost }, conditionBps },
  });
  if (paid.count !== 1) return c.json({ error: "Not enough Cash" }, 409);
  await recordLedger(prisma, id, utcDay(), "repair", -cost, p.cashMinor - cost, { conditionBps });
  await recordMeaningfulAction(id, "repair");
  return c.json(await snapshot(id));
});
