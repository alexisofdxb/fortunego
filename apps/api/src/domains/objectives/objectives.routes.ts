import { Hono } from "hono";
import { z } from "zod";
import { marketStageForEmpireLevel, utcDay, type ObjectiveLane } from "@plotgo/game";
import type { AppEnv } from "../../shared/types";
import { requirePlayer } from "../../middleware/auth";
import { operatingBoard } from "../plot/board.service";
import { currentEmpireLevel } from "../player/onboarding.service";
import { settlePlayer } from "../../shared/snapshot";
import { dailyFlag } from "../../shared/daily-state";
import {
  ensureDailyObjectives,
  evaluateObjectives,
  rerollObjectiveLane,
  type ObjectiveContext,
} from "./objectives.service";

export const objectiveRoutes = new Hono<AppEnv>();

async function objectiveContextFor(playerId: string): Promise<{ stage: ReturnType<typeof marketStageForEmpireLevel>; ctx: ObjectiveContext; populationSource: Awaited<ReturnType<typeof settlePlayer>> } | null> {
  const p = await settlePlayer(playerId);
  if (!p) return null;
  const activeBoard = operatingBoard(p.board);
  const stage = marketStageForEmpireLevel(await currentEmpireLevel(playerId, activeBoard));
  return { stage, populationSource: p, ctx: { population: p.population, capacity: p.capacity, cardCount: activeBoard.length } };
}

objectiveRoutes.get("/api/objectives", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const day = utcDay();
  const resolved = await objectiveContextFor(id);
  if (!resolved) return c.json({ error: "no plot" }, 404);
  const { stage, ctx } = resolved;
  await ensureDailyObjectives(id, day, stage, ctx);
  const objectives = await evaluateObjectives(id, day);
  return c.json({ day, rerollAvailable: !(await dailyFlag(id, day, "objectiveRerolled")), objectives });
});

const ObjectiveReroll = z.object({ lane: z.enum(["operations", "growth", "market"]) });

objectiveRoutes.post("/api/objectives/reroll", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const body = ObjectiveReroll.parse(await c.req.json().catch(() => ({})));
  const day = utcDay();
  const resolved = await objectiveContextFor(id);
  if (!resolved) return c.json({ error: "no plot" }, 404);
  // Ensure today's lanes exist before rerolling one of them.
  await ensureDailyObjectives(id, day, resolved.stage, resolved.ctx);
  const result = await rerollObjectiveLane(id, day, body.lane as ObjectiveLane, resolved.ctx);
  if ("error" in result) return c.json({ error: result.error }, result.status);
  return c.json({ day, rerollAvailable: false, objectives: await evaluateObjectives(id, day), rerolled: result.view });
});