import { Hono } from "hono";
import type { AppEnv } from "../../shared/types";
import { requirePlayer } from "../../middleware/auth";
import { recordOnboardingMilestone } from "../player/onboarding.service";
import { snapshot } from "../../shared/snapshot";

export const performanceRoutes = new Hono<AppEnv>();

performanceRoutes.get("/api/performance", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const snap = await snapshot(id);
  if (!snap) return c.json({ error: "no plot" }, 404);
  await recordOnboardingMilestone(id, "onboarding_first_portfolio", "portfolio.view");
  await recordOnboardingMilestone(id, "onboarding_first_performance", "performance.view");
  return c.json({ performance: snap.performance, plotBalance: snap.plotBalance });
});
