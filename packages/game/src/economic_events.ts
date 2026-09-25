// ---------------------------------------------------------------------------
// Economic & Market Events — the 12 canonical families from
// PLOT_Customer_Economic_Simulation_v0.1 (Events sheet), plus the daily
// district-event surface moved here from the deleted events.ts
// (DistrictEvent / DistrictEventId / SessionVerb / SESSION_VERBS /
// DISTRICT_EVENTS / seedForDay / eventForDay). Pure and deterministic.
// ---------------------------------------------------------------------------
import type { CustomerSegments } from "./settle_phase2.ts";

export type SegmentDemandKey = keyof CustomerSegments;
/** Per-segment demand multipliers (1.0 = neutral). */
export type SegmentDemandMultipliers = Record<SegmentDemandKey, number>;

export type EconomicEventFamily =
  | "bull_market"
  | "market_correction"
  | "earnings_season"
  | "ipo_week"
  | "rate_cut"
  | "rate_hike"
  | "liquidity_crunch"
  | "credit_boom"
  | "bank_run"
  | "tech_rally"
  | "recession"
  | "dividend_week";

export type EconomicEvent = {
  id: EconomicEventFamily;
  name: string;
  description: string;
  /** Events sheet duration, hours. */
  durationHours: number;
  segmentDemand: SegmentDemandMultipliers;
  revenueMod: number;
  activityMod: number;
  riskMod: number;
};

/** Events sheet, verbatim (segment order: GC, RI, AT, SB, CC, HNW, Institutional). */
export const ECONOMIC_EVENTS: readonly EconomicEvent[] = [
  { id: "bull_market", name: "Bull Market", description: "Trading and investment demand expands.", durationHours: 24, segmentDemand: { generalConsumers: 1, retailInvestors: 1.2, activeTraders: 1.35, smallBusinesses: 1.05, corporateClients: 1.1, highNetWorth: 1.2, institutional: 1.25 }, revenueMod: 1.12, activityMod: 1.25, riskMod: 1.1 },
  { id: "market_correction", name: "Market Correction", description: "Volume rises but risk increases.", durationHours: 12, segmentDemand: { generalConsumers: 0.95, retailInvestors: 1.1, activeTraders: 1.45, smallBusinesses: 0.95, corporateClients: 0.95, highNetWorth: 1.05, institutional: 1.2 }, revenueMod: 1.05, activityMod: 1.3, riskMod: 1.3 },
  { id: "earnings_season", name: "Earnings Season", description: "Strong brokerage and research activity.", durationHours: 48, segmentDemand: { generalConsumers: 1, retailInvestors: 1.15, activeTraders: 1.25, smallBusinesses: 1, corporateClients: 1.05, highNetWorth: 1.1, institutional: 1.1 }, revenueMod: 1.05, activityMod: 1.18, riskMod: 1.05 },
  { id: "ipo_week", name: "IPO Week", description: "Corporate and institutional demand.", durationHours: 72, segmentDemand: { generalConsumers: 1, retailInvestors: 1.12, activeTraders: 1.2, smallBusinesses: 1.05, corporateClients: 1.25, highNetWorth: 1.15, institutional: 1.3 }, revenueMod: 1.1, activityMod: 1.2, riskMod: 1.1 },
  { id: "rate_cut", name: "Rate Cut", description: "Credit demand rises; risk slightly lower.", durationHours: 24, segmentDemand: { generalConsumers: 1.12, retailInvestors: 1.1, activeTraders: 1.1, smallBusinesses: 1.18, corporateClients: 1.1, highNetWorth: 1.1, institutional: 1.08 }, revenueMod: 1.04, activityMod: 1.12, riskMod: 0.95 },
  { id: "rate_hike", name: "Rate Hike", description: "Slower demand, more trading volatility.", durationHours: 24, segmentDemand: { generalConsumers: 0.92, retailInvestors: 0.95, activeTraders: 1.1, smallBusinesses: 0.9, corporateClients: 0.95, highNetWorth: 1, institutional: 1.05 }, revenueMod: 0.98, activityMod: 1.05, riskMod: 1.08 },
  { id: "liquidity_crunch", name: "Liquidity Crunch", description: "Stress event; liquidity businesses matter.", durationHours: 12, segmentDemand: { generalConsumers: 0.85, retailInvestors: 0.9, activeTraders: 1.25, smallBusinesses: 0.8, corporateClients: 0.85, highNetWorth: 0.9, institutional: 1.2 }, revenueMod: 0.92, activityMod: 1.2, riskMod: 1.45 },
  { id: "credit_boom", name: "Credit Boom", description: "Lending and business activity expands.", durationHours: 48, segmentDemand: { generalConsumers: 1.15, retailInvestors: 1.05, activeTraders: 1.05, smallBusinesses: 1.3, corporateClients: 1.2, highNetWorth: 1.05, institutional: 1 }, revenueMod: 1.1, activityMod: 1.12, riskMod: 1.2 },
  { id: "bank_run", name: "Bank Run", description: "High activity, poor banking economics and risk.", durationHours: 8, segmentDemand: { generalConsumers: 1.25, retailInvestors: 1.05, activeTraders: 1.2, smallBusinesses: 1.1, corporateClients: 1.1, highNetWorth: 1.2, institutional: 1.15 }, revenueMod: 0.85, activityMod: 1.25, riskMod: 1.6 },
  { id: "tech_rally", name: "Tech Rally", description: "Stock and market hunt friendly event.", durationHours: 24, segmentDemand: { generalConsumers: 1, retailInvestors: 1.25, activeTraders: 1.35, smallBusinesses: 1, corporateClients: 1.05, highNetWorth: 1.15, institutional: 1.1 }, revenueMod: 1.08, activityMod: 1.22, riskMod: 1.08 },
  { id: "recession", name: "Recession", description: "Broad demand and revenue pressure.", durationHours: 72, segmentDemand: { generalConsumers: 0.8, retailInvestors: 0.82, activeTraders: 0.95, smallBusinesses: 0.72, corporateClients: 0.75, highNetWorth: 0.88, institutional: 0.9 }, revenueMod: 0.85, activityMod: 0.9, riskMod: 1.35 },
  { id: "dividend_week", name: "Dividend Week", description: "Portfolio and fund engagement event.", durationHours: 48, segmentDemand: { generalConsumers: 1, retailInvestors: 1.18, activeTraders: 1.12, smallBusinesses: 1, corporateClients: 1.05, highNetWorth: 1.22, institutional: 1.1 }, revenueMod: 1.06, activityMod: 1.1, riskMod: 1 },
];

export function economicEvent(id: EconomicEventFamily): EconomicEvent {
  return ECONOMIC_EVENTS.find((event) => event.id === id) ?? ECONOMIC_EVENTS[0]!;
}

export function averageSegmentDemand(event: EconomicEvent): number {
  const keys = Object.keys(event.segmentDemand) as SegmentDemandKey[];
  return keys.reduce((sum, key) => sum + event.segmentDemand[key], 0) / keys.length;
}

// ---------------------------------------------------------------------------
// Daily district-event surface (moved verbatim from the deleted events.ts,
// now sourced from the 12 economic event families).
// ---------------------------------------------------------------------------

/**
 * Daily district event ids. The 12 economic families are the live catalog;
 * the legacy "quiet_day" literal stays in the union so existing persisted rows
 * and API comparisons (e.g. `.id !== "quiet_day"`) keep compiling.
 */
export type DistrictEventId = EconomicEventFamily | "quiet_day";

export type DistrictEvent = {
  id: DistrictEventId;
  title: string;
  description: string;
  activityBps: number;
  populationBps: number;
  riskDeltaBps: number;
  revenueBps?: number;
  riskBps?: number;
  reputationDelta?: number;
  /** Doc per-segment demand multipliers (richer family fields, backward-compatible). */
  segmentDemand?: Partial<SegmentDemandMultipliers>;
  /** Doc event duration in hours. */
  durationHours?: number;
};

/** Project an economic event onto the DistrictEvent shape consumed by settleDistrict. */
export function toDistrictEvent(event: EconomicEvent): DistrictEvent {
  return {
    id: event.id,
    title: event.name,
    description: event.description,
    activityBps: Math.round(event.activityMod * 10_000),
    populationBps: Math.round(averageSegmentDemand(event) * 10_000),
    riskDeltaBps: Math.round((event.riskMod - 1) * 10_000),
    revenueBps: Math.round((event.revenueMod - 1) * 10_000),
    riskBps: Math.round((event.riskMod - 1) * 10_000),
    reputationDelta: event.riskMod >= 1.2 ? -1 : event.riskMod <= 0.95 ? 1 : 0,
    segmentDemand: { ...event.segmentDemand },
    durationHours: event.durationHours,
  };
}

/** The daily district-event catalog: the 12 economic families. */
export const DISTRICT_EVENTS: readonly DistrictEvent[] = ECONOMIC_EVENTS.map(toDistrictEvent);

export type SessionVerb = "walk" | "price_loans" | "open_floor" | "rebalance" | "campaign";

export const SESSION_VERBS: readonly { id: SessionVerb; title: string; description: string }[] = [
  { id: "walk", title: "Walk the district", description: "Collect the base activity from the businesses already placed." },
  { id: "price_loans", title: "Price loans", description: "Lean into lending and banking activity." },
  { id: "open_floor", title: "Open the floor", description: "Push trading, exchange, and brokerage volume." },
  { id: "rebalance", title: "Rebalance", description: "Use research, funds, and vaults to reduce risk." },
  { id: "campaign", title: "Run a campaign", description: "Spend Cash to attract customers for today's settlement." },
];

/** FNV-1a seed for (day, playerId); unchanged from the deleted events.ts. */
export function seedForDay(day: string, playerId: string): number {
  let h = 2_166_136_261;
  const value = `${day}:${playerId}`;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16_777_619);
  }
  return h >>> 0;
}

/**
 * Deterministic daily district event: the seeded active family event from the
 * 12 economic events (same FNV seed as before, objectives evidence unchanged).
 */
export function eventForDay(day: string, playerId: string): DistrictEvent {
  const seed = seedForDay(day, playerId);
  return DISTRICT_EVENTS[seed % DISTRICT_EVENTS.length]!;
}
