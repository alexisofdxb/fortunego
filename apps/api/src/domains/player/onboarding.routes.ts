import { Hono } from "hono";
import type { AppEnv } from "../../shared/types";
import { requirePlayer } from "../../middleware/auth";
import { prisma } from "../../infrastructure/postgres/client";
import { ensureOnboardingStarted, onboardingRow, onboardingSnapshot } from "../player/onboarding.service";

export const onboardingRoutes = new Hono<AppEnv>();

onboardingRoutes.get("/api/onboarding", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const state = await onboardingSnapshot(id);
  if (!state) return c.json({ error: "no plot" }, 404);
  return c.json(state);
});

onboardingRoutes.post("/api/onboarding/start", requirePlayer, async (c) => {
  const id = c.get("player").id;
  await ensureOnboardingStarted(id);
  const state = await onboardingSnapshot(id);
  if (!state) return c.json({ error: "no plot" }, 404);
  return c.json(state);
});

onboardingRoutes.post("/api/onboarding/skip", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const row = await onboardingRow(id);
  if (!row) return c.json({ error: "no plot" }, 404);
  const now = Date.now();
  await prisma.$executeRaw`
    UPDATE players
    SET "onboardingStatus" = 'skipped', "onboardingStep" = 'freeplay', "onboardingSkippedAt" = COALESCE("onboardingSkippedAt", ${now})
    WHERE id = ${id}
  `;
  return c.json(await onboardingSnapshot(id));
});
