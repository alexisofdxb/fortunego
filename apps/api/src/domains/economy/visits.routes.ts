import { Hono } from "hono";
import { z } from "zod";
import {
  INVEST_MAX_MINOR,
  INVEST_MIN_MINOR,
  INVEST_SHARE_BPS,
  VISIT_ACTIONS,
  VISIT_NOTIONAL_MINOR,
  investAmountOk,
  investMaturesDay,
  isoWeek,
  utcDay,
  utcDaysBetween,
  visitEligible,
  visitFeeMinor,
  visitSpec,
  type VisitAction,
} from "@plotgo/game";
import type { AppEnv } from "../../shared/types";
import { requirePlayer } from "../../middleware/auth";
import { prisma } from "../../infrastructure/postgres/client";
import { loadCards, operatingBoard } from "../plot/board.service";
import { recordLedger } from "../economy/ledger.service";
import { recordMeaningfulAction } from "../../shared/offline";
import { snapshot, settlePlayer } from "../../shared/snapshot";
import {
  addPlayerRevenue,
  founderName,
  hostStageLabel,
  investReceiptFromRow,
  playerBoardView,
  visitReceiptFromRow,
  type InvestReceipt,
  type VisitReceipt,
} from "../economy/visits.service";
import { newId, num } from "../../shared/types";

export const visitRoutes = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Public board read model (privacy-filtered: no cash, no ledger, no fragments)
// ---------------------------------------------------------------------------

visitRoutes.get("/api/players/:playerId/board", async (c) => {
  const board = await playerBoardView(c.req.param("playerId"));
  if (!board) return c.json({ error: "no plot" }, 404);
  return c.json(board);
});

// ---------------------------------------------------------------------------
// Visits
// ---------------------------------------------------------------------------

const VisitInput = z.object({
  hostId: z.string().min(1),
  action: z.enum(VISIT_ACTIONS),
  buildingId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

visitRoutes.post("/api/visits", requirePlayer, async (c) => {
  const visitorId = c.get("player").id;
  const body = VisitInput.parse(await c.req.json());
  const action = body.action as VisitAction;

  const replay = await prisma.plotgoVisit.findUnique({ where: { idempotencyKey: body.idempotencyKey } });
  if (replay) return c.json(visitReceiptFromRow(replay));

  const p = await settlePlayer(visitorId);
  if (!p) return c.json({ error: "no plot" }, 404);
  const host = await prisma.player.findUnique({ where: { id: body.hostId } });
  if (!host) return c.json({ error: "Host not found" }, 404);
  if (host.id === visitorId) return c.json({ error: "You cannot visit your own plot" }, 400);
  const hostCards = await loadCards(host.id);
  const card = operatingBoard(hostCards).find((candidate) => candidate.id === body.buildingId);
  if (!card) return c.json({ error: "Building not found on the host's board" }, 404);
  const spec = visitSpec(card.type);
  if (!spec) return c.json({ error: "Unknown building" }, 400);
  if (!visitEligible(spec.lineage, action)) {
    return c.json({ error: `${spec.name} does not support the ${action} action` }, 400);
  }
  const day = utcDay();
  // Spec exit: a visitor with 0 Cash is rejected.
  if (p.cashMinor <= 0) return c.json({ error: "Visiting requires Cash" }, 400);

  const fee = visitFeeMinor(action, spec.rateBps, p.cashMinor);
  const notionalMinor = action === "trade" ? 0 : VISIT_NOTIONAL_MINOR[action];
  const charge = fee + notionalMinor;
  if (p.cashMinor < charge) return c.json({ error: "Not enough Cash for this visit" }, 409);

  const week = isoWeek(new Date(`${day}T00:00:00Z`));
  const stage = await hostStageLabel(host.id);
  let receipt: VisitReceipt | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      // One visit per (visitor, host, UTC day); the unique index closes the race.
      const today = await tx.plotgoVisit.findUnique({
        where: { visitorId_hostId_day: { visitorId, hostId: host.id, day } },
      });
      if (today) throw new VisitConflictError();
      const debited = await tx.player.updateMany({ where: { id: visitorId, cashMinor: { gte: charge } }, data: { cashMinor: { decrement: charge } } });
      if (debited.count !== 1) throw new InsufficientCashError();
      await tx.player.update({ where: { id: host.id }, data: { cashMinor: { increment: charge } } });
      const visitId = newId();
      await tx.plotgoVisit.create({
        data: {
          id: visitId,
          visitorId,
          hostId: host.id,
          day,
          action,
          buildingId: card.id,
          feeMinor: fee,
          notionalMinor,
          idempotencyKey: body.idempotencyKey,
          createdAt: Date.now(),
        },
      });
      const visitorBalance = await tx.player.findUnique({ where: { id: visitorId }, select: { cashMinor: true } });
      await recordLedger(tx, visitorId, day, "visit_out", -fee, num(visitorBalance?.cashMinor) + (charge - fee), { visitId, hostId: host.id, action, buildingId: card.id, feeMinor: fee });
      if (notionalMinor > 0) {
        await recordLedger(tx, visitorId, day, "deposit_out", -notionalMinor, num(visitorBalance?.cashMinor), { visitId, hostId: host.id, action, buildingId: card.id, notionalMinor });
      }
      const hostBalance = await tx.player.findUnique({ where: { id: host.id }, select: { cashMinor: true } });
      await recordLedger(tx, host.id, day, "visit_in", fee, num(hostBalance?.cashMinor) - (charge - fee), { visitId, visitorId, action, buildingId: card.id, feeMinor: fee, playerRevenue: true });
      if (notionalMinor > 0) {
        await recordLedger(tx, host.id, day, "visit_in", notionalMinor, num(hostBalance?.cashMinor), { visitId, visitorId, action, buildingId: card.id, kind: "notional" });
      }
      await addPlayerRevenue(tx, host.id, week, stage, fee);
      receipt = { visitId, day, action, hostId: host.id, buildingId: card.id, feeMinor: fee, notionalMinor, replayed: false };
    });
  } catch (error) {
    if (error instanceof VisitConflictError) return c.json({ error: "You already visited this plot today" }, 409);
    if (error instanceof InsufficientCashError) return c.json({ error: "Not enough Cash for this visit" }, 409);
    throw error;
  }
  await recordMeaningfulAction(visitorId, `visit:${action}`);
  return c.json(receipt);
});

class VisitConflictError extends Error {}
class InsufficientCashError extends Error {}

// ---------------------------------------------------------------------------
// Visitor investment (revenue share, principal guaranteed, host keeps capital)
// ---------------------------------------------------------------------------

const InvestInput = z.object({
  hostId: z.string().min(1),
  buildingId: z.string().min(1),
  amountMinor: z.number().int(),
  idempotencyKey: z.string().min(1),
});

visitRoutes.post("/api/invest", requirePlayer, async (c) => {
  const visitorId = c.get("player").id;
  const body = InvestInput.parse(await c.req.json());

  const replay = await prisma.plotgoInvestment.findUnique({ where: { idempotencyKey: body.idempotencyKey } });
  if (replay) return c.json(investReceiptFromRow(replay));

  if (!investAmountOk(body.amountMinor)) {
    return c.json({ error: `Investment must be between ${INVEST_MIN_MINOR / 100} and ${INVEST_MAX_MINOR / 100} Cash` }, 400);
  }
  const p = await settlePlayer(visitorId);
  if (!p) return c.json({ error: "no plot" }, 404);
  const host = await prisma.player.findUnique({ where: { id: body.hostId } });
  if (!host) return c.json({ error: "Host not found" }, 404);
  if (host.id === visitorId) return c.json({ error: "You cannot invest in your own plot" }, 400);
  const hostCards = await loadCards(host.id);
  const card = operatingBoard(hostCards).find((candidate) => candidate.id === body.buildingId);
  if (!card) return c.json({ error: "Building not found on the host's board" }, 404);
  const existing = await prisma.plotgoInvestment.findFirst({ where: { visitorId, buildingId: card.id, status: "active" } });
  if (existing) return c.json({ error: "You already have an active investment in this building" }, 409);

  const day = utcDay();
  const maturesDay = investMaturesDay(day);
  let receipt: InvestReceipt | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      const debited = await tx.player.updateMany({ where: { id: visitorId, cashMinor: { gte: body.amountMinor } }, data: { cashMinor: { decrement: body.amountMinor } } });
      if (debited.count !== 1) throw new InsufficientCashError();
      await tx.player.update({ where: { id: host.id }, data: { cashMinor: { increment: body.amountMinor } } });
      const investmentId = newId();
      await tx.plotgoInvestment.create({
        data: {
          id: investmentId,
          visitorId,
          hostId: host.id,
          buildingId: card.id,
          amountMinor: body.amountMinor,
          shareBps: INVEST_SHARE_BPS,
          startedDay: day,
          maturesDay,
          owedMinor: body.amountMinor,
          idempotencyKey: body.idempotencyKey,
          createdAt: Date.now(),
        },
      });
      const visitorBalance = await tx.player.findUnique({ where: { id: visitorId }, select: { cashMinor: true } });
      await recordLedger(tx, visitorId, day, "invest_out", -body.amountMinor, num(visitorBalance?.cashMinor), { investmentId, hostId: host.id, buildingId: card.id });
      const hostBalance = await tx.player.findUnique({ where: { id: host.id }, select: { cashMinor: true } });
      await recordLedger(tx, host.id, day, "invest_in", body.amountMinor, num(hostBalance?.cashMinor), { investmentId, visitorId, buildingId: card.id });
      receipt = { investmentId, day, hostId: host.id, buildingId: card.id, amountMinor: body.amountMinor, shareBps: INVEST_SHARE_BPS, startedDay: day, maturesDay, replayed: false };
    });
  } catch (error) {
    if (error instanceof InsufficientCashError) return c.json({ error: "Not enough Cash for this investment" }, 409);
    throw error;
  }
  await recordMeaningfulAction(visitorId, `invest:${card.id}`);
  return c.json(receipt);
});

// ---------------------------------------------------------------------------
// Investment portfolio views (as visitor and as host)
// ---------------------------------------------------------------------------

visitRoutes.get("/api/investments", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const day = utcDay();
  const [asVisitorRows, asHostRows] = await Promise.all([
    prisma.plotgoInvestment.findMany({ where: { visitorId: id }, orderBy: { createdAt: "desc" } }),
    prisma.plotgoInvestment.findMany({ where: { hostId: id }, orderBy: { createdAt: "desc" } }),
  ]);
  const asVisitor = [];
  for (const row of asVisitorRows) {
    const host = await prisma.player.findUnique({ where: { id: row.hostId }, select: { archetype: true } });
    const card = (await loadCards(row.hostId)).find((candidate) => candidate.id === row.buildingId);
    asVisitor.push({
      investmentId: row.id,
      hostId: row.hostId,
      hostName: founderName({ archetype: host?.archetype ?? null }),
      buildingId: row.buildingId,
      building: card ? { type: card.type, name: visitSpec(card.type)?.name ?? card.type } : null,
      amountMinor: num(row.amountMinor),
      shareBps: row.shareBps,
      startedDay: row.startedDay,
      maturesDay: row.maturesDay,
      daysRemaining: Math.max(0, utcDaysBetween(day, row.maturesDay)),
      yieldPaidMinor: num(row.yieldPaidMinor),
      owedMinor: num(row.owedMinor),
      status: row.status,
    });
  }
  const asHost = [];
  for (const row of asHostRows) {
    const visitor = await prisma.player.findUnique({ where: { id: row.visitorId }, select: { archetype: true } });
    const card = (await loadCards(id)).find((candidate) => candidate.id === row.buildingId);
    asHost.push({
      investmentId: row.id,
      visitorId: row.visitorId,
      visitorName: founderName({ archetype: visitor?.archetype ?? null }),
      buildingId: row.buildingId,
      building: card ? { type: card.type, name: visitSpec(card.type)?.name ?? card.type } : null,
      amountMinor: num(row.amountMinor),
      shareBps: row.shareBps,
      maturesDay: row.maturesDay,
      yieldPaidMinor: num(row.yieldPaidMinor),
      owedMinor: row.status === "active" ? num(row.owedMinor) : 0,
      status: row.status,
    });
  }
  return c.json({ asVisitor, asHost });
});
