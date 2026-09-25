import { Hono } from "hono";
import { z } from "zod";
import { utcDay, type EmpireArchetype } from "@plotgo/game";
import type { AppEnv } from "../../shared/types";
import { requirePlayer } from "../../middleware/auth";
import { prisma } from "../../infrastructure/postgres/client";
import { recordLedger } from "../economy/ledger.service";
import { recordMeaningfulAction } from "../../shared/offline";
import { snapshot } from "../../shared/snapshot";
import { num } from "../../shared/types";

export const economyRoutes = new Hono<AppEnv>();

const ArchetypeInput = z.object({ archetype: z.enum(["trading", "investment", "banking", "tokenized_stock"]) });

economyRoutes.post("/api/archetype", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const player = c.get("player");
  const body = ArchetypeInput.parse(await c.req.json());
  const now = Date.now();
  const current = (player.archetype ?? null) as EmpireArchetype | null;
  if (current === body.archetype) return c.json({ archetype: current, chargedMinor: 0, changedAt: player.archetypeChangedAt == null ? null : num(player.archetypeChangedAt) });
  if (player.archetypeChangedAt != null && now - num(player.archetypeChangedAt) < 7 * 24 * 60 * 60_000) return c.json({ error: "archetype can be retuned once every 7 days" }, 409);
  const retuneCost = 20_000;
  if (num(player.cashMinor) < retuneCost) return c.json({ error: "retuning requires 200 Cash" }, 409);
  // Hardened conditional debit.
  const changed = await prisma.player.updateMany({
    where: { id, cashMinor: { gte: retuneCost } },
    data: { cashMinor: { decrement: retuneCost }, archetype: body.archetype, archetypeChangedAt: now },
  });
  if (changed.count !== 1) return c.json({ error: "retuning failed" }, 409);
  await recordLedger(prisma, id, utcDay(), "archetype_retune", -retuneCost, num(player.cashMinor) - retuneCost, { archetype: body.archetype });
  await recordMeaningfulAction(id, `archetype:${body.archetype}`);
  const snap = await snapshot(id);
  return c.json({ ...snap, chargedMinor: retuneCost });
});
