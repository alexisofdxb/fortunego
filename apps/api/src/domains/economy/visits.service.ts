import {
  CARDS,
  empireLevel,
  investYieldMinor,
  isoWeek,
  lineageColor,
  marketStageForEmpireLevel,
  resolveType,
} from "@plotgo/game";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/postgres/client";
import { num } from "../../shared/types";
import { loadCards } from "../plot/board.service";
import { recordLedger } from "./ledger.service";

type Db = Prisma.TransactionClient | typeof prisma;

export type VisitReceipt = {
  visitId: string;
  day: string;
  action: string;
  hostId: string;
  buildingId: string;
  feeMinor: number;
  notionalMinor: number;
  replayed: boolean;
};

export type InvestReceipt = {
  investmentId: string;
  day: string;
  hostId: string;
  buildingId: string;
  amountMinor: number;
  shareBps: number;
  startedDay: string;
  maturesDay: string;
  replayed: boolean;
};

export type VisitEconomySummary = {
  /** Net cash moved onto/off the settling player by the visit economy. */
  cashDeltaMinor: number;
  /** Investment yields charged to this host this settle. */
  yieldsChargedMinor: number;
  /** Principal repaid/refunded to investors by this host this settle. */
  repaidMinor: number;
  /** Deposit/borrow notional received back by this player as a visitor. */
  receivedMinor: number;
};

export function founderName(player: { archetype: string | null }): string {
  if (!player.archetype) return "Founder";
  return `${player.archetype.charAt(0).toUpperCase()}${player.archetype.slice(1)} Founder`;
}

/** Accumulate host player-revenue (visit fees) onto the weekly row. Recorded only; score weighting is a flagged follow-up. */
export async function addPlayerRevenue(db: Db, playerId: string, week: string, stage: string, amountMinor: number) {
  await db.$executeRaw`
    INSERT INTO weekly_performance ("playerId", week, stage, "playerRevenueMinor")
    VALUES (${playerId}, ${week}, ${stage}, ${amountMinor})
    ON CONFLICT ("playerId", week) DO UPDATE SET
      "playerRevenueMinor" = weekly_performance."playerRevenueMinor" + EXCLUDED."playerRevenueMinor"
  `;
}

/** Accumulate visitor investment yield onto the visitor's weekly row. Recorded only; score weighting is a flagged follow-up. */
export async function addInvestYieldPerformance(db: Db, playerId: string, week: string, stage: string, amountMinor: number) {
  await db.$executeRaw`
    INSERT INTO weekly_performance ("playerId", week, stage, "investYieldMinor")
    VALUES (${playerId}, ${week}, ${stage}, ${amountMinor})
    ON CONFLICT ("playerId", week) DO UPDATE SET
      "investYieldMinor" = weekly_performance."investYieldMinor" + EXCLUDED."investYieldMinor"
  `;
}

export function visitReceiptFromRow(row: {
  id: string; day: string; action: string; hostId: string; buildingId: string; feeMinor: bigint; notionalMinor: bigint;
}): VisitReceipt {
  return {
    visitId: row.id,
    day: row.day,
    action: row.action,
    hostId: row.hostId,
    buildingId: row.buildingId,
    feeMinor: num(row.feeMinor),
    notionalMinor: num(row.notionalMinor),
    replayed: true,
  };
}

export function investReceiptFromRow(row: {
  id: string; startedDay: string; hostId: string; buildingId: string; amountMinor: bigint; shareBps: number; maturesDay: string;
}): InvestReceipt {
  return {
    investmentId: row.id,
    day: row.startedDay,
    hostId: row.hostId,
    buildingId: row.buildingId,
    amountMinor: num(row.amountMinor),
    shareBps: row.shareBps,
    startedDay: row.startedDay,
    maturesDay: row.maturesDay,
    replayed: true,
  };
}

async function ownBalance(tx: Prisma.TransactionClient, playerId: string): Promise<number> {
  const row = await tx.player.findUnique({ where: { id: playerId }, select: { cashMinor: true } });
  return Math.max(0, num(row?.cashMinor));
}

/**
 * Settlement hook for the player-visit economy. Runs INSIDE the daily
 * session-settle transaction AFTER the settle's absolute cash write, so the
 * conditional-debit checks below see the player's settled balance:
 *
 *  - pays investment yields to visitors (shareBps of each building's gross
 *    settle revenue), deducted from the host's credited proceeds,
 *  - repays matured principal; partial repayments carry owedMinor forward and
 *    are retried at every host settle (principal is never lost),
 *  - refunds remaining principal when the invested building disappeared,
 *  - returns outstanding deposit/borrow notional to visitors at their settle.
 */
export async function settleVisitEconomy(
  tx: Prisma.TransactionClient,
  playerId: string,
  day: string,
  revenueLines: { buildingId: string; amountMinor: number }[],
  boardBuildingIds: Set<string>,
  settleStartedAt: number,
): Promise<VisitEconomySummary> {
  const summary: VisitEconomySummary = { cashDeltaMinor: 0, yieldsChargedMinor: 0, repaidMinor: 0, receivedMinor: 0 };
  const week = isoWeek(new Date(`${day}T00:00:00Z`));
  const grossByBuilding = new Map(revenueLines.map((line) => [line.buildingId, Math.max(0, line.amountMinor)]));

  // --- Host side: yields, maturity repayments, building-gone refunds. -------
  const hosted = await tx.plotgoInvestment.findMany({ where: { hostId: playerId, status: "active" } });
  for (const inv of hosted) {
    const owed = num(inv.owedMinor);
    const buildingGone = !boardBuildingIds.has(inv.buildingId);

    // Yield: once per UTC day the building settles, before maturity.
    if (!buildingGone && inv.lastPaidDay < day && day < inv.maturesDay) {
      const gross = grossByBuilding.get(inv.buildingId) ?? 0;
      const yieldMinor = Math.min(investYieldMinor(gross, inv.shareBps), await ownBalance(tx, playerId));
      await tx.plotgoInvestment.update({
        where: { id: inv.id },
        data: { lastPaidDay: day, yieldPaidMinor: { increment: yieldMinor } },
      });
      if (yieldMinor > 0) {
        await tx.player.update({ where: { id: playerId }, data: { cashMinor: { decrement: yieldMinor } } });
        await tx.player.update({ where: { id: inv.visitorId }, data: { cashMinor: { increment: yieldMinor }, earnedMinor: { increment: yieldMinor } } });
        await recordLedger(tx, playerId, day, "invest_yield", -yieldMinor, await ownBalance(tx, playerId), { investmentId: inv.id, buildingId: inv.buildingId, grossMinor: gross, shareBps: inv.shareBps });
        const visitorBalance = await tx.player.findUnique({ where: { id: inv.visitorId }, select: { cashMinor: true } });
        await recordLedger(tx, inv.visitorId, day, "invest_yield", yieldMinor, num(visitorBalance?.cashMinor), { investmentId: inv.id, buildingId: inv.buildingId, grossMinor: gross, shareBps: inv.shareBps });
        const visitorStage = marketStageForEmpireLevel(empireLevel(await loadCards(inv.visitorId)));
        await addInvestYieldPerformance(tx, inv.visitorId, week, visitorStage, yieldMinor);
        summary.cashDeltaMinor -= yieldMinor;
        summary.yieldsChargedMinor += yieldMinor;
      }
    }

    // Principal repayment at maturity, or refund when the building is gone.
    const due = buildingGone || day >= inv.maturesDay;
    if (due && owed > 0) {
      const pay = Math.min(owed, await ownBalance(tx, playerId));
      if (pay > 0) {
        const debited = await tx.player.updateMany({ where: { id: playerId, cashMinor: { gte: pay } }, data: { cashMinor: { decrement: pay } } });
        if (debited.count === 1) {
          await tx.player.update({ where: { id: inv.visitorId }, data: { cashMinor: { increment: pay } } });
          const reasonMeta = { investmentId: inv.id, buildingId: inv.buildingId, kind: buildingGone ? "refund" : "maturity" };
          await recordLedger(tx, playerId, day, "invest_repay", -pay, await ownBalance(tx, playerId), reasonMeta);
          const visitorBalance = await tx.player.findUnique({ where: { id: inv.visitorId }, select: { cashMinor: true } });
          await recordLedger(tx, inv.visitorId, day, "invest_repay", pay, num(visitorBalance?.cashMinor), reasonMeta);
          summary.cashDeltaMinor -= pay;
          summary.repaidMinor += pay;
          const nextOwed = owed - pay;
          await tx.plotgoInvestment.update({
            where: { id: inv.id },
            data: nextOwed === 0
              ? { owedMinor: 0, status: buildingGone ? "refunded" : "matured", maturedAt: Date.now() }
              : { owedMinor: nextOwed },
          });
        }
      }
    }
  }

  // --- Visitor side: outstanding deposit/borrow notional returns. ------------
  const pendingReturns = await tx.plotgoVisit.findMany({
    where: {
      visitorId: playerId,
      action: { in: ["deposit", "borrow"] },
      returnedAt: null,
      createdAt: { lt: BigInt(settleStartedAt) },
    },
  });
  for (const visit of pendingReturns) {
    if (visit.day > day) continue;
    const notional = num(visit.notionalMinor);
    if (notional <= 0) {
      await tx.plotgoVisit.update({ where: { id: visit.id }, data: { returnedAt: Date.now() } });
      continue;
    }
    // The host repays the notional; skip (retry at a later settle) when the host cannot cover it.
    const debited = await tx.player.updateMany({ where: { id: visit.hostId, cashMinor: { gte: notional } }, data: { cashMinor: { decrement: notional } } });
    if (debited.count !== 1) continue;
    await tx.player.update({ where: { id: playerId }, data: { cashMinor: { increment: notional } } });
    const meta = { visitId: visit.id, action: visit.action };
    await recordLedger(tx, playerId, day, "deposit_return", notional, await ownBalance(tx, playerId), { ...meta, hostId: visit.hostId });
    const hostBalance = await tx.player.findUnique({ where: { id: visit.hostId }, select: { cashMinor: true } });
    await recordLedger(tx, visit.hostId, day, "deposit_return", -notional, num(hostBalance?.cashMinor), { ...meta, visitorId: playerId });
    await tx.plotgoVisit.update({ where: { id: visit.id }, data: { returnedAt: Date.now() } });
    summary.cashDeltaMinor += notional;
    summary.receivedMinor += notional;
  }

  return summary;
}

/** Public, privacy-filtered read model of another player's board (no cash, no ledger). */
export async function playerBoardView(playerId: string) {
  const player = await prisma.player.findUnique({ where: { id: playerId } });
  if (!player) return null;
  const cards = await loadCards(playerId);
  return {
    playerId: player.id,
    name: founderName(player),
    archetype: player.archetype,
    empireLevel: empireLevel(cards),
    buildings: cards.map((card) => {
      const spec = CARDS[resolveType(card.type)];
      return {
        id: card.id,
        type: spec?.id ?? card.type,
        name: spec?.name ?? card.type,
        hexId: card.hexId,
        stage: card.stage,
        lineage: spec?.lineage ?? "bank",
        color: spec ? lineageColor(spec.lineage) : "bank",
      };
    }),
  };
}

/** Stage label for weekly-row upserts at visit time. */
export async function hostStageLabel(hostId: string): Promise<string> {
  const cards = await loadCards(hostId);
  return marketStageForEmpireLevel(empireLevel(cards));
}
