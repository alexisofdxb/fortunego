export { BOARD, CASH_SCALE, STARTER_CASH_MINOR, SETTLE_MS } from "./constants.ts";
export {
  BUILDING_LIST,
  CARDS,
  CARD_ORDER,
  ERA_LABEL,
  ERA_ORDER,
  LEGACY_TYPE,
  isUnlocked,
  lineageColor,
  resolveType,
  type CardId,
  type CardSpec,
  type Era,
  type Lineage,
} from "./buildings.ts";

import { BOARD, CASH_SCALE, SETTLE_MS } from "./constants.ts";
import { CARDS, resolveType } from "./buildings.ts";

export type HuntId = "exchange_actions" | "upgrade_any" | "cash_target";

export const FRAGMENTS = [
  "AAPL",
  "NVDA",
  "TSLA",
  "MSFT",
  "AMZN",
  "GOOGL",
  "META",
  "JPM",
  "GS",
  "BRK",
] as const;
export type FragmentTicker = (typeof FRAGMENTS)[number];

export type CardSpec = {
  id: CardId;
  name: string;
  footprint: [number, number];
  placeCostMinor: number;
  /** Cash minor per 10s at stage 1. */
  baseMinorPerTick: number;
  customersBase: number;
  blurb: string;
  description: string;
};

export const STAGE_LABEL: Record<1 | 2 | 3, string> = {
  1: "Branch",
  2: "Regional",
  3: "Tower",
};

export type PlacedCard = {
  id: string;
  type: string;
  x: number;
  y: number;
  stage: 1 | 2 | 3;
};

function specOf(type: string) {
  const s = CARDS[resolveType(type)];
  if (!s) throw new Error(`Unknown building ${type}`);
  return s;
}

export function stageMul(stage: 1 | 2 | 3): number {
  return stage === 1 ? 1 : stage === 2 ? 1.35 : 1.8;
}

export function upgradeCostMinor(type: string, from: 1 | 2): number {
  const base = specOf(type).placeCostMinor;
  return from === 1 ? Math.round(base * 1.2) : Math.round(base * 1.8);
}

export function plotRank(cards: { type: string }[]): number {
  const er: Record<string, number> = {
    humble: 0,
    starter: 0,
    growing: 1,
    established: 2,
    elite: 3,
    tycoon: 4,
  };
  let r = 0;
  for (const c of cards) {
    const s = CARDS[resolveType(c.type)];
    if (s) r = Math.max(r, er[s.era] ?? 0);
  }
  return r;
}

export function boardSize(rank: number): number {
  return 12 + Math.min(4, Math.max(0, rank)) * 4;
}

export function fits(
  cards: PlacedCard[],
  type: string,
  x: number,
  y: number,
  ignoreId?: string,
  n = BOARD,
): boolean {
  const [w, h] = specOf(type).footprint;
  if (x < 0 || y < 0 || x + w > n || y + h > n) return false;
  for (const c of cards) {
    if (c.id === ignoreId) continue;
    const [cw, ch] = specOf(c.type).footprint;
    const overlap = x < c.x + cw && x + w > c.x && y < c.y + ch && y + h > c.y;
    if (overlap) return false;
  }
  return true;
}

export function occupancy(cards: PlacedCard[], n = BOARD): boolean[][] {
  const g = Array.from({ length: n }, () => Array(n).fill(false));
  for (const c of cards) {
    const [w, h] = specOf(c.type).footprint;
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) g[c.y + dy][c.x + dx] = true;
    }
  }
  return g;
}

export function vaultBoost(cards: PlacedCard[]): number {
  return 1 + cards.filter((c) => specOf(c.type).lineage === "vault").length * 0.08;
}

export function cardTickMinor(card: PlacedCard, all: PlacedCard[]): number {
  const spec = specOf(card.type);
  let add = spec.baseMinorPerTick * stageMul(card.stage);
  if (spec.lineage === "trade" || spec.lineage === "exchange") {
    add += all.length * 4 * CASH_SCALE * stageMul(card.stage);
  }
  return Math.round(add * vaultBoost(all));
}

/** Cash earned for one 10s tick. */
export function tickMinor(cards: PlacedCard[]): number {
  return cards.reduce((s, c) => s + cardTickMinor(c, cards), 0);
}

export function cardHourMinor(card: PlacedCard, all: PlacedCard[]): number {
  return cardTickMinor(card, all) * Math.round(3_600_000 / SETTLE_MS);
}

export function cardCustomers(card: PlacedCard): number {
  return Math.round(specOf(card.type).customersBase * stageMul(card.stage));
}

export function fragmentDropBps(cards: PlacedCard[]): number {
  const brokerage = cards.filter((c) => specOf(c.type).lineage === "broker");
  return 800 + brokerage.reduce((s, c) => s + 400 * c.stage, 0);
}

export function huntRewardMul(cards: PlacedCard[]): number {
  const research = cards.filter((c) => specOf(c.type).lineage === "research");
  return 1 + research.reduce((s, c) => s + 0.12 * c.stage, 0);
}

export function hasFund(cards: PlacedCard[]): boolean {
  return cards.some((c) => specOf(c.type).lineage === "fund");
}

export type HuntDef = {
  id: HuntId;
  title: string;
  hint: string;
  cashRewardMinor: number;
};

export const HUNTS: HuntDef[] = [
  {
    id: "exchange_actions",
    title: "Complete 3 Exchange actions",
    hint: "Place or upgrade a trading or exchange building, three times today.",
    cashRewardMinor: 400 * CASH_SCALE,
  },
  {
    id: "upgrade_any",
    title: "Upgrade any building",
    hint: "Raise any card to the next stage.",
    cashRewardMinor: 250 * CASH_SCALE,
  },
  {
    id: "cash_target",
    title: "Generate 100,000 Cash",
    hint: "Lifetime Cash earned on this Plot, not the wallet balance.",
    cashRewardMinor: 600 * CASH_SCALE,
  },
];

export function pickHunt(daySeed: number): HuntDef {
  return HUNTS[Math.abs(daySeed) % HUNTS.length]!;
}

export function fragmentForHunt(
  hunt: HuntId,
  cards: PlacedCard[],
  roll01: number,
): FragmentTicker | "MYSTERY" | null {
  const drop = roll01 < fragmentDropBps(cards) / 10_000;
  if (!drop && hunt !== "exchange_actions") return null;
  if (hunt === "exchange_actions") return "NVDA";
  if (hunt === "cash_target") return "AAPL";
  return "MYSTERY";
}

export function resolveMystery(roll: number): FragmentTicker {
  return FRAGMENTS[Math.abs(Math.floor(roll * FRAGMENTS.length)) % FRAGMENTS.length]!;
}

export const FRAGMENT_UNITS = 0.01;

export function empireValueMinor(
  cashMinor: number,
  cards: PlacedCard[],
  fragmentUnits: number,
): number {
  const buildings = cards.reduce((s, c) => s + 50 * CASH_SCALE * c.stage, 0);
  const frags = Math.round(fragmentUnits * 1_000 * CASH_SCALE);
  return cashMinor + buildings + frags;
}

export function utcDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function displayCash(minor: number): string {
  const n = minor / CASH_SCALE;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.floor(n).toLocaleString()}`;
}
