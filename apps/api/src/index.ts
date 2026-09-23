import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  CARDS,
  CARD_ORDER,
  FRAGMENTS,
  FRAGMENT_UNITS,
  HUNTS,
  STARTER_CASH_MINOR,
  SETTLE_MS,
  type CardId,
  type HuntId,
  type PlacedCard,
  displayCash,
  empireValueMinor,
  fits,
  fragmentForHunt,
  hasFund,
  huntRewardMul,
  pickHunt,
  resolveMystery,
  tickMinor,
  upgradeCostMinor,
  utcDay,
} from "@plotgo/game";
import { db, sqlite } from "./db.ts";
import { cards, fragments, players } from "./schema.ts";

const app = new Hono();
app.use(
  "*",
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    allowHeaders: ["Content-Type", "x-player-id"],
  }),
);

function newId(): string {
  return crypto.randomUUID();
}

function hashDay(day: string): number {
  let h = 0;
  for (let i = 0; i < day.length; i++) h = (h * 31 + day.charCodeAt(i)) | 0;
  return h;
}

async function loadCards(playerId: string): Promise<PlacedCard[]> {
  const rows = await db.select().from(cards).where(eq(cards.playerId, playerId));
  return rows.map((r) => ({
    id: r.id,
    type: r.type as CardId,
    x: r.x,
    y: r.y,
    stage: r.stage as 1 | 2 | 3,
  }));
}

async function loadFrags(playerId: string) {
  const rows = await db.select().from(fragments).where(eq(fragments.playerId, playerId));
  const map: Record<string, number> = {};
  let units = 0;
  for (const r of rows) {
    const u = r.unitsBps / 100;
    map[r.ticker] = (map[r.ticker] ?? 0) + u;
    units += u;
  }
  return { map, units };
}

function addFragment(playerId: string, ticker: string) {
  const add = Math.round(FRAGMENT_UNITS * 100);
  sqlite
    .prepare(
      `INSERT INTO fragments (player_id, ticker, units_bps) VALUES (?, ?, ?)
       ON CONFLICT(player_id, ticker) DO UPDATE SET units_bps = units_bps + excluded.units_bps`,
    )
    .run(playerId, ticker, add);
}

async function settlePlayer(playerId: string) {
  const [p] = await db.select().from(players).where(eq(players.id, playerId));
  if (!p) return null;
  const now = Date.now();
  const ticks = Math.floor((now - p.lastSettleAt) / SETTLE_MS);
  const board = await loadCards(playerId);
  let cash = p.cashMinor;
  let earned = p.earnedMinor;
  let last = p.lastSettleAt;
  if (ticks > 0) {
    const gain = tickMinor(board) * Math.min(ticks, 360);
    cash += gain;
    earned += gain;
    last += ticks * SETTLE_MS;
    await db
      .update(players)
      .set({ cashMinor: cash, earnedMinor: earned, lastSettleAt: last })
      .where(eq(players.id, playerId));
  }
  const day = utcDay(now);
  let huntDay = p.huntDay;
  let huntId = p.huntId as HuntId;
  let huntClaimed = p.huntClaimed;
  let exchangeActionsToday = p.exchangeActionsToday;
  if (p.huntDay !== day) {
    huntDay = day;
    huntId = pickHunt(hashDay(day + playerId)).id;
    huntClaimed = 0;
    exchangeActionsToday = 0;
    await db
      .update(players)
      .set({ huntDay, huntId, huntClaimed, exchangeActionsToday })
      .where(eq(players.id, playerId));
  }
  return {
    ...p,
    cashMinor: cash,
    earnedMinor: earned,
    lastSettleAt: last,
    huntDay,
    huntId,
    huntClaimed,
    exchangeActionsToday,
    board,
  };
}

async function snapshot(playerId: string) {
  const p = await settlePlayer(playerId);
  if (!p) return null;
  const { map, units } = await loadFrags(playerId);
  const hunt = HUNTS.find((h) => h.id === p.huntId) ?? pickHunt(0);
  const ev = empireValueMinor(p.cashMinor, p.board, units);
  const progress = huntProgress(p, hunt.id);
  return {
    playerId,
    founder: true,
    cashMinor: p.cashMinor,
    cash: displayCash(p.cashMinor),
    earnedMinor: p.earnedMinor,
    empireValueMinor: ev,
    empireValue: displayCash(ev),
    weeklyScore: p.weeklyScore,
    weeklyRedeemable: false,
    cards: p.board,
    catalog: CARD_ORDER.map((id) => CARDS[id]),
    fragments: map,
    hunt: {
      ...hunt,
      claimed: Boolean(p.huntClaimed),
      progress,
      ready: progress.done && !p.huntClaimed,
    },
    tickMinor: tickMinor(p.board),
  };
}

function huntProgress(
  p: {
    exchangeActionsToday: number;
    earnedMinor: number;
    board: PlacedCard[];
  },
  huntId: HuntId,
): { current: number; target: number; done: boolean } {
  if (huntId === "exchange_actions") {
    return { current: p.exchangeActionsToday, target: 3, done: p.exchangeActionsToday >= 3 };
  }
  if (huntId === "upgrade_any") {
    const ups = p.board.filter((c) => c.stage > 1).length;
    return { current: ups, target: 1, done: ups >= 1 };
  }
  const target = 100_000 * 100;
  return { current: p.earnedMinor, target, done: p.earnedMinor >= target };
}

app.get("/health", (c) => c.json({ ok: true }));

app.post("/api/session", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const id =
    (typeof body.playerId === "string" && body.playerId) ||
    c.req.header("x-player-id") ||
    newId();
  const [existing] = await db.select().from(players).where(eq(players.id, id));
  if (!existing) {
    const day = utcDay();
    await db.insert(players).values({
      id,
      createdAt: Date.now(),
      founder: 1,
      cashMinor: STARTER_CASH_MINOR,
      earnedMinor: 0,
      lastSettleAt: Date.now(),
      exchangeActionsToday: 0,
      huntDay: day,
      huntId: pickHunt(hashDay(day + id)).id,
      huntClaimed: 0,
      weeklyScore: 0,
    });
  }
  const snap = await snapshot(id);
  return c.json({ playerId: id, plot: snap });
});

app.get("/api/plot", async (c) => {
  const id = c.req.header("x-player-id");
  if (!id) return c.json({ error: "x-player-id required" }, 401);
  const snap = await snapshot(id);
  if (!snap) return c.json({ error: "no plot" }, 404);
  return c.json(snap);
});

const Place = z.object({
  type: z.enum(["bank", "exchange", "fund", "vault", "brokerage", "research"]),
  x: z.number().int().min(0).max(11),
  y: z.number().int().min(0).max(11),
});

app.post("/api/plot/place", async (c) => {
  const id = c.req.header("x-player-id");
  if (!id) return c.json({ error: "x-player-id required" }, 401);
  const p = await settlePlayer(id);
  if (!p) return c.json({ error: "no plot" }, 404);
  const body = Place.parse(await c.req.json());
  const spec = CARDS[body.type];
  if (p.cashMinor < spec.placeCostMinor) {
    return c.json({ error: "Not enough Cash" }, 400);
  }
  if (!fits(p.board, body.type, body.x, body.y)) {
    return c.json({ error: "Does not fit" }, 400);
  }
  const cardId = newId();
  await db.insert(cards).values({
    id: cardId,
    playerId: id,
    type: body.type,
    x: body.x,
    y: body.y,
    stage: 1,
  });
  let exchange = p.exchangeActionsToday;
  if (body.type === "exchange") exchange += 1;
  await db
    .update(players)
    .set({
      cashMinor: p.cashMinor - spec.placeCostMinor,
      exchangeActionsToday: exchange,
    })
    .where(eq(players.id, id));
  return c.json(await snapshot(id));
});

const Upgrade = z.object({ cardId: z.string() });

app.post("/api/plot/upgrade", async (c) => {
  const id = c.req.header("x-player-id");
  if (!id) return c.json({ error: "x-player-id required" }, 401);
  const p = await settlePlayer(id);
  if (!p) return c.json({ error: "no plot" }, 404);
  const { cardId } = Upgrade.parse(await c.req.json());
  const card = p.board.find((x) => x.id === cardId);
  if (!card) return c.json({ error: "missing card" }, 404);
  if (card.stage >= 3) return c.json({ error: "Max stage" }, 400);
  const cost = upgradeCostMinor(card.type, card.stage as 1 | 2);
  if (p.cashMinor < cost) return c.json({ error: "Not enough Cash" }, 400);
  await db
    .update(cards)
    .set({ stage: card.stage + 1 })
    .where(eq(cards.id, cardId));
  let exchange = p.exchangeActionsToday;
  if (card.type === "exchange") exchange += 1;
  await db
    .update(players)
    .set({ cashMinor: p.cashMinor - cost, exchangeActionsToday: exchange })
    .where(eq(players.id, id));
  return c.json(await snapshot(id));
});

app.post("/api/hunt/claim", async (c) => {
  const id = c.req.header("x-player-id");
  if (!id) return c.json({ error: "x-player-id required" }, 401);
  const p = await settlePlayer(id);
  if (!p) return c.json({ error: "no plot" }, 404);
  if (p.huntClaimed) return c.json({ error: "Already claimed" }, 400);
  const hunt = HUNTS.find((h) => h.id === p.huntId)!;
  const prog = huntProgress(p, hunt.id);
  if (!prog.done) return c.json({ error: "Hunt not complete" }, 400);
  if (hunt.id === "exchange_actions" && !hasFund(p.board)) {
    /* still pay; fund only flavors the fragment toward stocks */
  }
  const mul = huntRewardMul(p.board);
  const reward = Math.round(hunt.cashRewardMinor * mul);
  const roll = Math.random();
  let frag = fragmentForHunt(hunt.id, p.board, roll);
  if (frag === "MYSTERY") frag = resolveMystery(Math.random());
  if (frag) await addFragment(id, frag);
  await db
    .update(players)
    .set({
      cashMinor: p.cashMinor + reward,
      earnedMinor: p.earnedMinor + reward,
      huntClaimed: 1,
      weeklyScore: p.weeklyScore + reward,
    })
    .where(eq(players.id, id));
  const snap = await snapshot(id);
  return c.json({ ...snap, dropped: frag });
});

app.get("/api/leaderboard", async (c) => {
  const rows = await db.select().from(players);
  const ranked = [];
  for (const r of rows) {
    const board = await loadCards(r.id);
    const { units } = await loadFrags(r.id);
    const ev = empireValueMinor(r.cashMinor, board, units);
    ranked.push({
      playerId: r.id.slice(0, 8),
      empireValue: displayCash(ev),
      empireValueMinor: ev,
      founder: true,
    });
  }
  ranked.sort((a, b) => b.empireValueMinor - a.empireValueMinor);
  return c.json({ board: ranked.slice(0, 25) });
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => {
  console.log(`PlotGo API http://localhost:${port}`);
});
