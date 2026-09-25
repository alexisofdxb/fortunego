import { marketEventForDay, type MarketEventRule } from "./market_phase3.ts";
import { seedForDay } from "./economic_events.ts";

export const PHASE4_ANNUAL_AUM_FEE_BPS = 150;
export const PHASE4_DAILY_MARK_CAP_BPS = 500;

export type Phase4Sector = "technology" | "consumer" | "financial" | "cash";

export type Phase4Instrument = {
  ticker: "NVDA" | "AAPL" | "TSLA" | "CASH";
  name: string;
  sector: Phase4Sector;
  source: "sim";
};

export const PHASE4_INSTRUMENTS: readonly Phase4Instrument[] = [
  { ticker: "NVDA", name: "In-game NVDA", sector: "technology", source: "sim" },
  { ticker: "AAPL", name: "In-game AAPL", sector: "consumer", source: "sim" },
  { ticker: "TSLA", name: "In-game TSLA", sector: "financial", source: "sim" },
  { ticker: "CASH", name: "In-game Cash", sector: "cash", source: "sim" },
];

export type Phase4DayMark = {
  ticker: Phase4Instrument["ticker"];
  returnBps: number;
};

export type PortfolioPositionValue = {
  ticker: Phase4Instrument["ticker"];
  weightBps: number;
  allocatedMinor: number;
};

export type PortfolioMarkResult = {
  positions: (PortfolioPositionValue & { markBps: number; grossMarkMinor: number; feeMinor: number; endMinor: number })[];
  grossMarkMinor: number;
  preFeeAumMinor: number;
  feeMinor: number;
  endAumMinor: number;
};

function hash(value: string): number {
  let result = 2_654_435_761;
  for (let i = 0; i < value.length; i++) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 16_777_619);
  }
  return result >>> 0;
}

function bounded(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function eventBias(ticker: Phase4Instrument["ticker"], event: MarketEventRule): number {
  if (ticker === "CASH") return 0;
  const bias = event.stockBias.toUpperCase();
  if (event.id === "ai_mania" && ticker === "NVDA") return 275;
  if (event.id === "market_correction" && (ticker === "TSLA" || ticker === "NVDA")) return -225;
  if (event.id === "retail_trading_boom" && (ticker === "AAPL" || ticker === "TSLA")) return 125;
  if (event.id === "dividend_week" && ticker === "AAPL") return 60;
  if (bias.includes(ticker)) return event.id.includes("correction") ? -100 : 90;
  if (bias.includes("BROAD")) return event.id.includes("crunch") ? -60 : 35;
  return 0;
}

/** Deterministic, in-game-only daily marks. The event is an input so callers can persist the exact output. */
export function phase4Marks(day: string, playerId: string, event = marketEventForDay(day, playerId)): Phase4DayMark[] {
  const seed = seedForDay(day, playerId);
  return PHASE4_INSTRUMENTS.map((instrument) => {
    if (instrument.ticker === "CASH") return { ticker: instrument.ticker, returnBps: 0 };
    const random = (hash(`${seed}:${day}:${playerId}:${instrument.ticker}`) % 601) - 300;
    return { ticker: instrument.ticker, returnBps: bounded(random + eventBias(instrument.ticker, event), -PHASE4_DAILY_MARK_CAP_BPS, PHASE4_DAILY_MARK_CAP_BPS) };
  });
}

/** Applies a stored mark, then charges the documented 150 bps/year AUM fee on end-of-day book value. */
export function applyPortfolioMarks(
  positions: readonly PortfolioPositionValue[],
  marks: readonly Phase4DayMark[],
  annualFeeBps = PHASE4_ANNUAL_AUM_FEE_BPS,
): PortfolioMarkResult {
  const markByTicker = new Map(marks.map((mark) => [mark.ticker, mark.returnBps]));
  const marked = positions.map((position) => {
    const markBps = position.ticker === "CASH" ? 0 : bounded(markByTicker.get(position.ticker) ?? 0, -PHASE4_DAILY_MARK_CAP_BPS, PHASE4_DAILY_MARK_CAP_BPS);
    const grossMarkMinor = Math.round(position.allocatedMinor * markBps / 10_000);
    return { ...position, markBps, grossMarkMinor, preFeeMinor: Math.max(0, position.allocatedMinor + grossMarkMinor) };
  });
  const grossMarkMinor = marked.reduce((sum, position) => sum + position.grossMarkMinor, 0);
  const preFeeAumMinor = marked.reduce((sum, position) => sum + position.preFeeMinor, 0);
  const feeMinor = Math.max(0, Math.round(preFeeAumMinor * annualFeeBps / 365 / 10_000));
  let feeAssigned = 0;
  const result = marked.map((position, index) => {
    const feeShare = index === marked.length - 1
      ? Math.max(0, feeMinor - feeAssigned)
      : Math.floor(feeMinor * position.preFeeMinor / Math.max(1, preFeeAumMinor));
    feeAssigned += feeShare;
    return { ...position, feeMinor: feeShare, endMinor: Math.max(0, position.preFeeMinor - feeShare) };
  });
  return {
    positions: result,
    grossMarkMinor,
    preFeeAumMinor,
    feeMinor,
    endAumMinor: result.reduce((sum, position) => sum + position.endMinor, 0),
  };
}
