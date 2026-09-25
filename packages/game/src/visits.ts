import { CARDS, resolveType, type CardSpec, type Lineage } from "./buildings.ts";

export const VISIT_ACTIONS = ["trade", "deposit", "borrow"] as const;
export type VisitAction = (typeof VISIT_ACTIONS)[number];

/** Simulated notional (minor units) behind each visit action. */
export const VISIT_NOTIONAL_MINOR: Record<VisitAction, number> = {
  trade: 20_000,
  deposit: 50_000,
  borrow: 30_000,
};

export const INVEST_TERM_DAYS = 3;
/** Visitor earns this share (bps) of the building's gross daily settle revenue. */
export const INVEST_SHARE_BPS = 2_500;
export const INVEST_MIN_MINOR = 10_000;
export const INVEST_MAX_MINOR = 500_000;

/**
 * Which building lineages each visit action can be performed against
 * (spec engine 3: trade on exchange/brokerage/stock-exchange venues, deposit
 * to a fund, borrow from a bank/lender).
 */
export const VISIT_ACTION_LINEAGES: Record<VisitAction, readonly Lineage[]> = {
  trade: ["exchange", "trade", "broker"],
  deposit: ["fund"],
  borrow: ["bank", "lend"],
};

export function visitEligible(lineage: Lineage, action: VisitAction): boolean {
  return VISIT_ACTION_LINEAGES[action].includes(lineage);
}

/** Catalog spec for a visit target building (legacy aliases resolved), or null. */
export function visitSpec(type: string): CardSpec | null {
  return CARDS[resolveType(type)] ?? null;
}

/**
 * Visit fee: notional × the building's catalog rate, capped at the visitor's
 * balance so a trade fee never overdraws. The deposit/borrow notional is a
 * separate transfer and is NOT capped here (guarded by a conditional debit).
 */
export function visitFeeMinor(action: VisitAction, rateBps: number, balanceMinor: number): number {
  const raw = Math.round((VISIT_NOTIONAL_MINOR[action] * Math.max(0, rateBps)) / 10_000);
  return Math.max(0, Math.min(raw, Math.max(0, balanceMinor)));
}

/** Visitor revenue share of a building's gross daily settle revenue (0 if the building earned 0). */
export function investYieldMinor(grossMinor: number, shareBps: number): number {
  const bps = Math.max(0, Math.min(10_000, shareBps));
  return Math.max(0, Math.round((Math.max(0, grossMinor) * bps) / 10_000));
}

export function investAmountOk(amountMinor: number): boolean {
  return Number.isInteger(amountMinor) && amountMinor >= INVEST_MIN_MINOR && amountMinor <= INVEST_MAX_MINOR;
}

function addUtcDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** UTC day the investment matures: startedDay + INVEST_TERM_DAYS. */
export function investMaturesDay(startedDay: string): string {
  return addUtcDays(startedDay, INVEST_TERM_DAYS);
}

/** Whole UTC days from fromDay to toDay (negative when toDay is earlier). */
export function utcDaysBetween(fromDay: string, toDay: string): number {
  return Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / 86_400_000);
}
