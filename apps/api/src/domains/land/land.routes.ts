import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../../infrastructure/postgres/client";
import { requirePlayer } from "../../middleware/auth";
import type { AppEnv } from "../../shared/types";
import { acquireLand, landFit, landView, ownedLandRows } from "./land.service";
import { scoreAction } from "../liveops/liveops.service";

export const landRoutes = new Hono<AppEnv>();

/** Full land board: all 35 parcels with grade/LVI/attributes, price, owned/frontier flags. */
landRoutes.get("/api/land", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const player = await prisma.player.findUnique({ where: { id }, select: { empireLevel: true } });
  if (!player) return c.json({ error: "no plot" }, 404);
  const rows = await ownedLandRows(id);
  return c.json(landView(player.empireLevel, rows));
});

const Acquire = z.object({ hexId: z.string() });

/**
 * Acquire a parcel (starter grant / frontier deed / cash purchase). 403 with
 * the canAcquire reason when not allowed; idempotent replay of an owned hex
 * returns the existing ownership with 200.
 */
landRoutes.post("/api/land/acquire", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const body = Acquire.parse(await c.req.json());
  const outcome = await acquireLand(id, body.hexId);
  if (outcome.status !== 200) return c.json({ error: outcome.error }, outcome.status);
  if (!outcome.replayed) await scoreAction(id, "land");
  const player = await prisma.player.findUnique({ where: { id }, select: { empireLevel: true } });
  const rows = await ownedLandRows(id);
  return c.json({ ownership: outcome.ownership, replayed: outcome.replayed, ...landView(player?.empireLevel ?? 1, rows) });
});

/** Placement-fit preview for the placement UI: multiplier + per-factor breakdown. */
landRoutes.get("/api/land/fit", requirePlayer, async (c) => {
  const hexId = c.req.query("hexId");
  const type = c.req.query("type");
  if (!hexId || !type) return c.json({ error: "hexId and type are required" }, 400);
  const fit = landFit(hexId, type);
  if (!fit) return c.json({ error: "Unknown hex or building type" }, 400);
  return c.json(fit);
});
