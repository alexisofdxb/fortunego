export type DistrictEventId =
  | "quiet_day"
  | "customer_surge"
  | "market_rally"
  | "liquidity_crunch"
  | "bank_run"
  | "credit_squeeze"
  | "tech_boom"
  | "research_week"
  | "settlement_day"
  | "storm_warning";

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
};

export const DISTRICT_EVENTS: readonly DistrictEvent[] = [
  { id: "quiet_day", title: "Quiet day", description: "Business is steady and predictable.", activityBps: 10_000, populationBps: 10_000, riskDeltaBps: 0 },
  { id: "customer_surge", title: "Customer surge", description: "The district is busier than usual.", activityBps: 11_500, populationBps: 13_000, riskDeltaBps: 100 },
  { id: "market_rally", title: "Market rally", description: "Trading desks and brokers see a rush of activity.", activityBps: 12_500, populationBps: 10_500, riskDeltaBps: 250 },
  { id: "liquidity_crunch", title: "Liquidity crunch", description: "Cash is harder to move and spreads are under pressure.", activityBps: 8_500, populationBps: 8_500, riskDeltaBps: 500 },
  { id: "bank_run", title: "Bank run", description: "Customers are testing the district's reserves.", activityBps: 7_500, populationBps: 9_000, riskDeltaBps: 1_100 },
  { id: "credit_squeeze", title: "Credit squeeze", description: "Borrowers are cautious and lenders carry more risk.", activityBps: 8_000, populationBps: 8_000, riskDeltaBps: 900 },
  { id: "tech_boom", title: "Technology boom", description: "Research and digital businesses attract attention.", activityBps: 11_000, populationBps: 11_500, riskDeltaBps: 150 },
  { id: "research_week", title: "Research week", description: "Good information makes every decision a little sharper.", activityBps: 10_500, populationBps: 10_000, riskDeltaBps: -250 },
  { id: "settlement_day", title: "Settlement day", description: "Funds and exchanges are busy clearing positions.", activityBps: 11_500, populationBps: 10_500, riskDeltaBps: 350 },
  { id: "storm_warning", title: "Storm warning", description: "The district is open, but everyone is watching the downside.", activityBps: 9_000, populationBps: 9_000, riskDeltaBps: 700 },
] as const;

export type SessionVerb = "walk" | "price_loans" | "open_floor" | "rebalance" | "campaign";

export const SESSION_VERBS: readonly { id: SessionVerb; title: string; description: string }[] = [
  { id: "walk", title: "Walk the district", description: "Collect the base activity from the businesses already placed." },
  { id: "price_loans", title: "Price loans", description: "Lean into lending and banking activity." },
  { id: "open_floor", title: "Open the floor", description: "Push trading, exchange, and brokerage volume." },
  { id: "rebalance", title: "Rebalance", description: "Use research, funds, and vaults to reduce risk." },
  { id: "campaign", title: "Run a campaign", description: "Spend Cash to attract customers for today's settlement." },
];

export function seedForDay(day: string, playerId: string): number {
  let h = 2_166_136_261;
  const value = `${day}:${playerId}`;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16_777_619);
  }
  return h >>> 0;
}

export function eventForDay(day: string, playerId: string): DistrictEvent {
  const seed = seedForDay(day, playerId);
  return DISTRICT_EVENTS[seed % DISTRICT_EVENTS.length]!;
}
