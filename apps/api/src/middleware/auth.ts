import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../shared/types";
import { env } from "../shared/config";
import { prisma } from "../infrastructure/postgres/client";

/** Prototype-grade identity: the caller self-declares via the x-player-id header. */
export const requirePlayer = createMiddleware<AppEnv>(async (c, next) => {
  const id = c.req.header("x-player-id");
  if (!id) return c.json({ error: "x-player-id required" }, 401);
  const player = await prisma.player.findUnique({ where: { id } });
  if (!player) return c.json({ error: "no plot" }, 404);
  c.set("player", player);
  await next();
});

export const requireAdmin = createMiddleware(async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!token || token !== env.adminToken) return c.json({ error: "forbidden" }, 403);
  await next();
});
