import { Hono } from "hono";
import { isoWeek } from "@plotgo/game";
import type { AppEnv } from "../../shared/types";
import { requirePlayer } from "../../middleware/auth";
import { recordOnboardingMilestone } from "../player/onboarding.service";
import { snapshot } from "../../shared/snapshot";
import { prisma } from "../../infrastructure/postgres/client";
import { weekStartMs } from "./performance.service";

export const performanceRoutes = new Hono<AppEnv>();

performanceRoutes.get("/api/performance", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const snap = await snapshot(id);
  if (!snap) return c.json({ error: "no plot" }, 404);
  await recordOnboardingMilestone(id, "onboarding_first_portfolio", "portfolio.view");
  await recordOnboardingMilestone(id, "onboarding_first_performance", "performance.view");
  // Week status + time-to-close countdown (spec sheet 09): computed on read,
  // no stored countdown table. Prior week: open -> pending (at close) ->
  // finalized (admin finalize); the new week is never blocked by settlement.
  const now = Date.now();
  const week = isoWeek(new Date(now));
  const priorWeek = isoWeek(new Date(now - 7 * 86_400_000));
  const closesAt = weekStartMs(week) + 7 * 86_400_000;
  const [currentManifest, priorManifest] = await Promise.all([
    prisma.weeklySnapshot.findUnique({ where: { week }, select: { status: true } }),
    prisma.weeklySnapshot.findUnique({ where: { week: priorWeek }, select: { status: true } }),
  ]);
  return c.json({
    performance: snap.performance,
    plotBalance: snap.plotBalance,
    weekStatus: {
      week,
      status: (currentManifest?.status ?? "open") as "open" | "pending" | "finalized",
      closesAt,
      msUntilClose: Math.max(0, closesAt - now),
      priorWeek: { week: priorWeek, status: priorManifest?.status ?? "open" },
    },
  });
});
