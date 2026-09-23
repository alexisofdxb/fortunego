export const BOARD = 12;
export const CASH_SCALE = 100; // 1 Cash = 100 minor
export const STARTER_CASH_MINOR = 5_000 * CASH_SCALE; // 5,000 Cash
export const SETTLE_MS = 10_000;

export type CardId =
  | "bank"
  | "exchange"
  | "fund"
  | "vault"
  | "brokerage"
  | "research";

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
  blurb: string;
};

export const CARDS: Record<CardId, CardSpec> = {
  bank: {
    id: "bank",
    name: "Bank",
    footprint: [2, 2],
    placeCostMinor: 800 * CASH_SCALE,
    baseMinorPerTick: 40 * CASH_SCALE,
    blurb: "Steady Cash.",
  },
  exchange: {
    id: "exchange",
    name: "Exchange",
    footprint: [2, 2],
    placeCostMinor: 1_000 * CASH_SCALE,
    baseMinorPerTick: 28 * CASH_SCALE,
    blurb: "More Cash when the board is busy.",
  },
  fund: {
    id: "fund",
    name: "Fund",
    footprint: [2, 2],
    placeCostMinor: 1_000 * CASH_SCALE,
    baseMinorPerTick: 24 * CASH_SCALE,
    blurb: "Stock-related hunts.",
  },
  vault: {
    id: "vault",
    name: "Vault",
    footprint: [2, 2],
    placeCostMinor: 700 * CASH_SCALE,
    baseMinorPerTick: 12 * CASH_SCALE,
    blurb: "Protects bonuses. Boosts Cash efficiency.",
  },
  brokerage: {
    id: "brokerage",
    name: "Brokerage",
    footprint: [2, 2],
    placeCostMinor: 900 * CASH_SCALE,
    baseMinorPerTick: 18 * CASH_SCALE,
    blurb: "Better chance of stock-fragment drops.",
  },
  research: {
    id: "research",
    name: "Research",
    footprint: [2, 2],
    placeCostMinor: 600 * CASH_SCALE,
    baseMinorPerTick: 8 * CASH_SCALE,
    blurb: "Improves Market Hunt rewards.",
  },
};

export const CARD_ORDER: CardId[] = [
  "bank",
  "exchange",
  "fund",
  "vault",
  "brokerage",
  "research",
];

export type PlacedCard = {
  id: string;
  type: CardId;
  x: number;
  y: number;
  stage: 1 | 2 | 3;
};

export function stageMul(stage: 1 | 2 | 3): number {
  return stage === 1 ? 1 : stage === 2 ? 1.35 : 1.8;
}

export function upgradeCostMinor(type: CardId, from: 1 | 2): number {
  const base = CARDS[type].placeCostMinor;
  return from === 1 ? Math.round(base * 1.2) : Math.round(base * 1.8);
}

export function fits(
  cards: PlacedCard[],
  type: CardId,
  x: number,
  y: number,
  ignoreId?: string,
): boolean {
  const [w, h] = CARDS[type].footprint;
  if (x < 0 || y < 0 || x + w > BOARD || y + h > BOARD) return false;
  for (const c of cards) {
    if (c.id === ignoreId) continue;
    const [cw, ch] = CARDS[c.type].footprint;
    const overlap = x < c.x + cw && x + w > c.x && y < c.y + ch && y + h > c.y;
    if (overlap) return false;
  }
  return true;
}

export function occupancy(cards: PlacedCard[]): boolean[][] {
  const g = Array.from({ length: BOARD }, () => Array(BOARD).fill(false));
  for (const c of cards) {
    const [w, h] = CARDS[c.type].footprint;
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) g[c.y + dy][c.x + dx] = true;
    }
  }
  return g;
}

/** Cash earned for one 10s tick. */
export function tickMinor(cards: PlacedCard[]): number {
  const n = cards.length;
  const vaults = cards.filter((c) => c.type === "vault");
  const vaultBoost = 1 + vaults.length * 0.08;
  let gross = 0;
  for (const c of cards) {
    const spec = CARDS[c.type];
    let add = spec.baseMinorPerTick * stageMul(c.stage);
    if (c.type === "exchange") add += n * 4 * CASH_SCALE * stageMul(c.stage);
    gross += add;
  }
  return Math.round(gross * vaultBoost);
}

export function fragmentDropBps(cards: PlacedCard[]): number {
  const brokerage = cards.filter((c) => c.type === "brokerage");
  return 800 + brokerage.reduce((s, c) => s + 400 * c.stage, 0);
}

export function huntRewardMul(cards: PlacedCard[]): number {
  const research = cards.filter((c) => c.type === "research");
  return 1 + research.reduce((s, c) => s + 0.12 * c.stage, 0);
}

export function hasFund(cards: PlacedCard[]): boolean {
  return cards.some((c) => c.type === "fund");
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
    hint: "Place or upgrade an Exchange, three times today.",
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
