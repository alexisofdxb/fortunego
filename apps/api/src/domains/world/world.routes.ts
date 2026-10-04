import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../shared/types";
import { requirePlayer } from "../../middleware/auth";
import { visitWorldRegion, worldMap } from "./world.service";

export const worldRoutes = new Hono<AppEnv>();

worldRoutes.get("/api/world", requirePlayer, async (c) => {
  const id = c.get("player").id;
  return c.json(await worldMap(id));
});

worldRoutes.post("/api/world/visit", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const body = z.object({ regionId: z.string().min(1) }).parse(await c.req.json());
  const result = await visitWorldRegion(id, body.regionId);
  if (result.status !== 200) return c.json({ error: result.error }, result.status);
  return c.json(result);
});
