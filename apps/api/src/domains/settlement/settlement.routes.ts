import { Hono } from "hono";
import { z } from "zod";
import { isoWeek } from "@plotgo/game";
import type { AppEnv } from "../../shared/types";
import { requireAdmin, requirePlayer } from "../../middleware/auth";
import { prisma } from "../../infrastructure/postgres/client";
import { finalizePerformanceWeek } from "./settlement.service";
import { snapshot } from "../../shared/snapshot";
import { num } from "../../shared/types";

export const settlementRoutes = new Hono<AppEnv>();

// Grouped here with the other settlement mutations from the old routes/performance.ts:
// marking an offline summary viewed finalizes that summary's pending state.
settlementRoutes.post("/api/offline/summary/view", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const body = z.object({ summaryId: z.string().optional() }).parse(await c.req.json().catch(() => ({})));
  const result = body.summaryId
    ? await prisma.plotgoOfflineSummary.updateMany({ where: { summaryId: body.summaryId, playerId: id, viewedAt: null }, data: { viewedAt: Date.now() } })
    : await prisma.$executeRaw`
        UPDATE plotgo_offline_summaries SET "viewedAt" = ${Date.now()}
        WHERE "summaryId" = (
          SELECT "summaryId" FROM plotgo_offline_summaries
          WHERE "playerId" = ${id} AND "viewedAt" IS NULL
          ORDER BY "returnedAt" DESC LIMIT 1
        )
      `;
  const viewed = typeof result === "number" ? result === 1 : result.count === 1;
  return c.json({ viewed });
});

settlementRoutes.post("/api/performance/finalize", requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({})) as { week?: unknown };
  const week = typeof body.week === "string" && /^\d{4}-W\d{2}$/.test(body.week)
    ? body.week
    : isoWeek(new Date(Date.now() - 7 * 86_400_000));
  return c.json(await finalizePerformanceWeek(week));
});

settlementRoutes.post("/api/performance/claim", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const body = await c.req.json().catch(() => ({})) as { week?: unknown };
  const week = typeof body.week === "string" && /^\d{4}-W\d{2}$/.test(body.week)
    ? body.week
    : isoWeek(new Date(Date.now() - 7 * 86_400_000));
  const row = await prisma.weeklyPerformance.findUnique({ where: { playerId_week: { playerId: id, week } } });
  if (!row) return c.json({ error: "No weekly performance record" }, 404);
  if (!row.finalized) return c.json({ error: "Weekly performance is not finalized" }, 400);
  if (row.claimedAt != null) return c.json({ error: "Payout already claimed" }, 400);
  if (num(row.payoutPlot) <= 0) return c.json({ error: "No payout available" }, 400);
  const claimedAt = Date.now();
  // Atomic claim: conditional on claimed_at IS NULL.
  const updated = await prisma.weeklyPerformance.updateMany({
    where: { playerId: id, week, claimedAt: null },
    data: { claimedAt },
  });
  if (updated.count !== 1) return c.json({ error: "Payout already claimed" }, 409);
  await prisma.player.update({ where: { id }, data: { plotBalance: { increment: row.payoutPlot } } });
  const snap = await snapshot(id);
  return c.json({ ...snap, claimedWeek: week, claimedPlot: num(row.payoutPlot) });
});
