import {
  CARDS,
  MARKET_STOCKS,
  PHASE4_INSTRUMENTS,
  applyPortfolioMarks,
  collectionProgress,
  eventForDay,
  marketEventForDay,
  phase4Marks,
  resolveArchetype,
  resolveType,
  seedForDay,
  upgradeCostMinor,
  type EmpireArchetype,
  type PlacedCard,
} from "@plotgo/game";
import { prisma } from "../../infrastructure/postgres/client";
import { num } from "../../shared/types";
import { oraclePriceMinor } from "../hunts/hunts.service";

function seedToIntLocal(seed: number): number {
  return seed | 0;
}

function seedFromIntLocal(seed: number): number {
  return seed >>> 0;
}

/** Local mirror of the Phase 4 instrument tickers (wire contract). */
export const PHASE4_TICKERS = ["NVDA", "AAPL", "TSLA", "CASH"] as const;

export async function loadCards(playerId: string): Promise<PlacedCard[]> {
  const rows = await prisma.card.findMany({ where: { playerId } });
  const migrationPlacedAt = Date.now();
  const cards = rows.map((r) => ({
    id: r.id,
    type: resolveType(r.type),
    x: r.x,
    y: r.y,
    stage: r.stage as 1 | 2 | 3,
    orientation: (r.orientation ?? 0) as 0 | 90 | 180 | 270,
    placedAt: num(r.placedAt) || migrationPlacedAt,
    operationalUntil: num(r.operationalUntil) || 0,
  }));
  for (const card of cards) {
    const source = rows.find((row) => row.id === card.id)!;
    if (num(source.placedAt) === 0) {
      await prisma.card.updateMany({ where: { id: card.id, placedAt: 0 }, data: { placedAt: migrationPlacedAt } });
    }
  }
  return cards;
}

export async function loadFrags(playerId: string) {
  const rows = await prisma.fragment.findMany({ where: { playerId } });
  const map: Record<string, number> = {};
  let units = 0;
  for (const r of rows) {
    const u = num(r.unitsMicros ?? BigInt(r.unitsBps) * 10_000n) / 1_000_000;
    map[r.ticker] = (map[r.ticker] ?? 0) + u;
    units += u;
  }
  const portfolio = [];
  for (const stock of MARKET_STOCKS) {
    const stockUnits = map[stock.ticker] ?? 0;
    if (stockUnits <= 0) continue;
    const price = await oraclePriceMinor(stock.ticker);
    portfolio.push({ ...stock, units: stockUnits, oraclePriceMinor: price, valueMinor: Math.round(stockUnits * price) });
  }
  return { map, units, portfolio, collections: collectionProgress(map) };
}

export async function addStockUnits(playerId: string, ticker: string, unitsMicros: number) {
  await prisma.$executeRaw`
    INSERT INTO fragments ("playerId", ticker, "unitsBps", "unitsMicros") VALUES (${playerId}, ${ticker}, 0, ${unitsMicros})
    ON CONFLICT ("playerId", ticker) DO UPDATE SET "unitsMicros" = COALESCE(fragments."unitsMicros", fragments."unitsBps" * 10000) + EXCLUDED."unitsMicros"
  `;
}

export async function positionRows(playerId: string) {
  const rows = await prisma.plotgoPosition.findMany({ where: { playerId }, orderBy: { ticker: "asc" } });
  const byTicker = new Map(rows.map((row) => [row.ticker, row]));
  return PHASE4_INSTRUMENTS.map((instrument) => {
    const row = byTicker.get(instrument.ticker);
    return {
      ...instrument,
      inGame: true,
      weightBps: row?.weightBps ?? (instrument.ticker === "CASH" && rows.length === 0 ? 10_000 : 0),
      allocatedMinor: num(row?.allocatedMinor ?? 0),
      markBps: row?.markBps ?? 0,
      lastMarkDay: row == null ? null : row.lastMarkDay,
      effectiveDay: row == null ? null : row.effectiveDay,
      updatedAt: row == null ? null : num(row.updatedAt),
    };
  });
}

export async function archetypeResolutionForPlayer(playerId: string, board: PlacedCard[]) {
  const row = await prisma.player.findUnique({ where: { id: playerId }, select: { archetype: true } });
  const [fragCount, positionCount] = await Promise.all([
    prisma.fragment.count({ where: { playerId, OR: [{ unitsMicros: { gt: 0 } }, { AND: [{ unitsMicros: null }, { unitsBps: { gt: 0 } }] }] } }),
    prisma.plotgoPosition.count({ where: { playerId, weightBps: { gt: 0 } } }),
  ]);
  return resolveArchetype(board, (row?.archetype ?? null) as EmpireArchetype | null, fragCount + positionCount > 0);
}

export function operatingBoard(board: PlacedCard[], now = Date.now()): PlacedCard[] {
  return board.filter((card) => !card.operationalUntil || card.operationalUntil <= now);
}

function parsePhase4Marks(raw: unknown) {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw ?? "[]") : raw ?? [];
    if (!Array.isArray(parsed)) return null;
    const marks = parsed.filter((mark): mark is { ticker: (typeof PHASE4_TICKERS)[number]; returnBps: number } =>
      mark && PHASE4_TICKERS.includes(mark.ticker) && Number.isFinite(Number(mark.returnBps)),
    ).map((mark) => ({ ticker: mark.ticker, returnBps: Number(mark.returnBps) }));
    return marks.length === PHASE4_TICKERS.length ? marks : null;
  } catch {
    return null;
  }
}

export async function districtDay(playerId: string, day: string) {
  const existing = await prisma.plotgoDistrictDay.findUnique({ where: { playerId_day: { playerId, day } } });
  const event = eventForDay(day, playerId);
  if (existing) {
    const marks = parsePhase4Marks(existing.marksJson) ?? phase4Marks(day, playerId, marketEventForDay(day, playerId));
    if (!parsePhase4Marks(existing.marksJson)) {
      await prisma.plotgoDistrictDay.update({ where: { playerId_day: { playerId, day } }, data: { marksJson: marks as object } });
    }
    return { seed: seedFromIntLocal(existing.seed), event, marks };
  }
  const seed = seedForDay(day, playerId);
  const marks = phase4Marks(day, playerId, marketEventForDay(day, playerId));
  await prisma.plotgoDistrictDay.create({
    data: { playerId, day, seed: seedToIntLocal(seed), eventId: event.id, marksJson: JSON.parse(JSON.stringify(marks)) as object },
  });
  return { seed, event, marks };
}

export async function settlePortfolio(playerId: string, day: string, marks: ReturnType<typeof phase4Marks>) {
  const rows = await prisma.plotgoPosition.findMany({ where: { playerId }, orderBy: { ticker: "asc" } });
  const eligible = rows.filter((row) =>
    PHASE4_TICKERS.includes(row.ticker as (typeof PHASE4_TICKERS)[number]) && (row.effectiveDay === "" || row.effectiveDay < day) && row.lastMarkDay !== day);
  if (!eligible.length) return { applied: false, grossMarkMinor: 0, preFeeAumMinor: 0, feeMinor: 0, endAumMinor: 0, positions: [], marks };
  const result = applyPortfolioMarks(eligible.map((row) => ({
    ticker: row.ticker as (typeof PHASE4_TICKERS)[number],
    weightBps: row.weightBps,
    allocatedMinor: Math.max(0, num(row.allocatedMinor)),
  })), marks);
  await prisma.$transaction(async (tx) => {
    for (const position of result.positions) {
      await tx.plotgoPosition.update({
        where: { playerId_ticker: { playerId, ticker: position.ticker } },
        data: { allocatedMinor: position.endMinor, markBps: position.markBps, lastMarkDay: day, updatedAt: Date.now() },
      });
    }
  });
  return { applied: true, ...result, marks };
}

export async function sessionFor(playerId: string, day: string) {
  const row = await prisma.plotgoSession.findUnique({ where: { playerId_day: { playerId, day } } });
  if (!row) return null;
  return { verb: row.verb, settledAt: num(row.settledAt), receipt: row.receiptJson };
}

export function isTrade(type: string): boolean {
  const lin = CARDS[resolveType(type)]?.lineage;
  return lin === "trade" || lin === "exchange";
}

export function buildValueMinor(card: PlacedCard): number {
  const base = CARDS[resolveType(card.type)]!.placeCostMinor;
  return card.stage <= 1 ? base : card.stage === 2 ? base + upgradeCostMinor(card.type, 1) : base + upgradeCostMinor(card.type, 1) + upgradeCostMinor(card.type, 2);
}

export function effectiveDistrictEvent(
  event: ReturnType<typeof eventForDay>,
  marketEvent: ReturnType<typeof marketEventForDay>,
  customerDemandBps = 0,
  eventModifiers: { demandBps: number; activityBps: number; revenueBps: number; riskBps: number; huntSpawnBps: number; reputationDelta: number } = { demandBps: 0, activityBps: 0, revenueBps: 0, riskBps: 0, huntSpawnBps: 0, reputationDelta: 0 },
) {
  return {
    ...event,
    activityBps: Math.round(event.activityBps * marketEvent.activityModifier * (1 + eventModifiers.activityBps / 10_000)),
    populationBps: Math.round(event.populationBps * marketEvent.customerDemand * (1 + customerDemandBps / 10_000) * (1 + eventModifiers.demandBps / 10_000)),
    revenueBps: eventModifiers.revenueBps,
    riskBps: eventModifiers.riskBps,
    riskDeltaBps: event.riskDeltaBps,
    reputationDelta: eventModifiers.reputationDelta,
  };
}

export function stockClaimGate(p: { createdAt: number; activeDays: string[] }) {
  // The workbook allows these gates to be waived in private beta; production enables them with =1.
  if (process.env.PLOTGO_STOCK_CLAIM_GATES !== "1") return { eligible: true, reason: null };
  const ageHours = (Date.now() - p.createdAt) / 3_600_000;
  if (ageHours < 24) return { eligible: false, reason: `Stock claims unlock after 24 hours (${Math.ceil(24 - ageHours)}h remaining).` };
  if (p.activeDays.length < 2) return { eligible: false, reason: "Stock claims unlock after 2 active days." };
  return { eligible: true, reason: null };
}
