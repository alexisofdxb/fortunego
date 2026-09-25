import { Hono } from "hono";
import { displayCash, empireValueMinor } from "@plotgo/game";
import { prisma } from "../../infrastructure/postgres/client";
import { loadCards, loadFrags } from "../plot/board.service";
import { founderName } from "../economy/visits.service";
import { num } from "../../shared/types";

export const leaderboardRoutes = new Hono();

const BOARDS = new Set(["empire", "cash_7d", "reputation"]);

leaderboardRoutes.get("/api/leaderboard", async (c) => {
  const kindParam = c.req.query("board") ?? "empire";
  const kind = BOARDS.has(kindParam) ? kindParam : "empire";
  const rows = await prisma.player.findMany();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

  const baseEntry = (r: (typeof rows)[number]) => ({
    playerId: r.id,
    name: founderName(r),
    archetype: r.archetype,
    founder: true,
  });

  if (kind === "cash_7d") {
    const grouped = await prisma.plotgoLedger.groupBy({
      by: ["playerId"],
      where: { day: { gte: sevenDaysAgo }, amountMinor: { gt: 0 } },
      _sum: { amountMinor: true },
    });
    const byPlayer = new Map(grouped.map((g) => [g.playerId, num(g._sum.amountMinor)]));
    const board = rows
      .map((r) => ({ ...baseEntry(r), cash7dMinor: byPlayer.get(r.id) ?? 0 }))
      .sort((a, b) => b.cash7dMinor - a.cash7dMinor)
      .slice(0, 25);
    return c.json({ kind, board });
  }

  if (kind === "reputation") {
    const board = rows
      .map((r) => ({ ...baseEntry(r), reputationBps: r.reputationBps }))
      .sort((a, b) => b.reputationBps - a.reputationBps)
      .slice(0, 25);
    return c.json({ kind, board });
  }

  // Default: empire value (backward compatible shape plus name/archetype for the visit list).
  const ranked = [];
  for (const r of rows) {
    const board = await loadCards(r.id);
    const { units } = await loadFrags(r.id);
    const ev = empireValueMinor(num(r.cashMinor), board, units);
    ranked.push({
      ...baseEntry(r),
      empireValue: displayCash(ev),
      empireValueMinor: ev,
    });
  }
  ranked.sort((a, b) => b.empireValueMinor - b.empireValueMinor);
  return c.json({ kind: "empire", board: ranked.slice(0, 25) });
});
