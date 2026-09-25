import { Hono } from "hono";
import { z } from "zod";
import { CARDS, PHASE4_INSTRUMENTS, resolveType, utcDay } from "@plotgo/game";
import type { AppEnv } from "../../shared/types";
import { requirePlayer } from "../../middleware/auth";
import { prisma } from "../../infrastructure/postgres/client";
import { loadCards, loadFrags, positionRows, PHASE4_TICKERS } from "../plot/board.service";
import { recordOnboardingMilestone } from "../player/onboarding.service";
import { recordMeaningfulAction } from "../../shared/offline";
import { num } from "../../shared/types";

export const portfolioRoutes = new Hono<AppEnv>();

portfolioRoutes.get("/api/portfolio", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const { portfolio, collections } = await loadFrags(id);
  await recordOnboardingMilestone(id, "onboarding_first_portfolio", "portfolio.view");
  return c.json({ portfolio, collections, positions: await positionRows(id), instruments: PHASE4_INSTRUMENTS });
});

portfolioRoutes.get("/api/positions", requirePlayer, async (c) => {
  const id = c.get("player").id;
  return c.json({ positions: await positionRows(id), instruments: PHASE4_INSTRUMENTS });
});

const RebalanceInput = z.object({ weights: z.record(z.enum(PHASE4_TICKERS), z.number().int().min(0).max(10_000)) });

portfolioRoutes.post("/api/positions/rebalance", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const player = c.get("player");
  const board = await loadCards(id);
  if (!board.some((card) => ["broker", "fund"].includes(CARDS[resolveType(card.type)]?.lineage ?? ""))) {
    return c.json({ error: "Place a Brokerage or Fund building before allocating a portfolio" }, 409);
  }
  const body = RebalanceInput.parse(await c.req.json());
  const weights = Object.fromEntries(PHASE4_TICKERS.map((ticker) => [ticker, Number(body.weights[ticker] ?? 0)])) as Record<(typeof PHASE4_TICKERS)[number], number>;
  if (Object.values(weights).reduce((sum, value) => sum + value, 0) !== 10_000) return c.json({ error: "portfolio weights must total 10000 bps" }, 400);
  const now = Date.now();
  const effectiveDay = utcDay(now);
  const existing = await prisma.plotgoPosition.aggregate({ where: { playerId: id }, _sum: { allocatedMinor: true } });
  const portfolioCapitalMinor = num(existing._sum.allocatedMinor) > 0 ? num(existing._sum.allocatedMinor) : num(player.cashMinor);
  await prisma.$transaction(async (tx) => {
    for (const ticker of PHASE4_TICKERS) {
      await tx.plotgoPosition.upsert({
        where: { playerId_ticker: { playerId: id, ticker } },
        create: { playerId: id, ticker, weightBps: weights[ticker], allocatedMinor: Math.floor(portfolioCapitalMinor * weights[ticker] / 10_000), markBps: 0, lastMarkDay: "", effectiveDay, updatedAt: now },
        update: { weightBps: weights[ticker], allocatedMinor: Math.floor(portfolioCapitalMinor * weights[ticker] / 10_000), markBps: 0, effectiveDay, updatedAt: now },
      });
    }
  });
  await recordOnboardingMilestone(id, "onboarding_first_portfolio", "portfolio.rebalance");
  await recordMeaningfulAction(id, "portfolio:rebalance");
  return c.json({
    positions: await positionRows(id),
    instruments: PHASE4_INSTRUMENTS,
    receipt: {
      type: "rebalance",
      effectiveDay,
      capitalMinor: portfolioCapitalMinor,
      weights,
      message: "In-game positions are simulated and will receive their next daily mark on the next UTC settlement.",
    },
  });
});
