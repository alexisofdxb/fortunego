import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../shared/types";
import { requirePlayer } from "../../middleware/auth";
import {
  buyLiveopsSku,
  claimSeasonPass,
  faucetPlot,
  liveopsInventoryRows,
  liveopsLeaderboard,
  openLiveopsCase,
  unlockSeasonPass,
} from "./liveops.service";
import { snapshot } from "../../shared/snapshot";

export const liveopsRoutes = new Hono<AppEnv>();

liveopsRoutes.get("/api/liveops/inventory", requirePlayer, async (c) => {
  const id = c.get("player").id;
  return c.json({ inventory: await liveopsInventoryRows(id) });
});

const OpenCase = z.object({
  caseType: z.enum(["daily", "business", "market", "event", "executive", "tycoon"]),
});

liveopsRoutes.post("/api/liveops/cases/open", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const body = OpenCase.parse(await c.req.json());
  const caseResult = await openLiveopsCase(id, body.caseType);
  return c.json({ ...(await snapshot(id)), caseResult });
});

liveopsRoutes.get("/api/liveops/leaderboard", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const eventId = c.req.query("eventId") ?? "global_finance_week";
  return c.json(await liveopsLeaderboard(id, eventId));
});

liveopsRoutes.post("/api/liveops/pass/unlock", requirePlayer, async (c) => {
  const id = c.get("player").id;
  await unlockSeasonPass(id);
  return c.json(await snapshot(id));
});

const ClaimPass = z.object({
  level: z.number().int().min(1).max(30),
  track: z.enum(["free", "premium"]),
});

liveopsRoutes.post("/api/liveops/pass/claim", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const body = ClaimPass.parse(await c.req.json());
  const label = await claimSeasonPass(id, body.level, body.track);
  return c.json({ ...(await snapshot(id)), passReward: label });
});

const BuySku = z.object({ sku: z.string().min(1), quoteId: z.string().min(1) });

liveopsRoutes.post("/api/liveops/shop/buy", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const body = BuySku.parse(await c.req.json());
  const name = await buyLiveopsSku(id, body.sku, body.quoteId);
  return c.json({ ...(await snapshot(id)), shopItem: name });
});

liveopsRoutes.post("/api/liveops/shop/faucet", requirePlayer, async (c) => {
  const id = c.get("player").id;
  const granted = await faucetPlot(id);
  return c.json({ ...(await snapshot(id)), faucetPlot: granted });
});
