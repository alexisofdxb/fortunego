import { MARKET_STAGES, type MarketStage } from "./market_phase3.ts";
import { ECONOMIC_EVENTS, averageSegmentDemand, type EconomicEvent, type EconomicEventFamily } from "./economic_events.ts";

export type EventCategory = "Customer" | "Market" | "Operational" | "Macro" | "Corporate" | "Risk/Crisis" | "Sector" | "Prestige/Seasonal";
export type EventTone = "Positive" | "Mixed" | "Negative";
export type EventScope = "Global" | "Personal";

export type MarketCycleState = "Expansion" | "Bull Market" | "Neutral" | "Risk-Off" | "Correction" | "Crisis" | "Recovery";
export type EventModifier = { demandBps: number; activityBps: number; revenueBps: number; riskBps: number; huntSpawnBps: number; reputationDelta: number };

export type MarketCycleRule = {
  state: MarketCycleState;
  weeklyProbability: number;
  typicalDurationHours: [number, number];
  demandMultiplier: number;
  activityMultiplier: number;
  revenueMultiplier: number;
  riskMultiplier: number;
  huntBias: string;
  stockBias: string;
};

export const MARKET_CYCLE_RULES: readonly MarketCycleRule[] = [
  { state: "Expansion", weeklyProbability: 0.18, typicalDurationHours: [72, 168], demandMultiplier: 1.10, activityMultiplier: 1.10, revenueMultiplier: 1.08, riskMultiplier: 0.90, huntBias: "Growth, customer acquisition", stockBias: "Growth / broad market" },
  { state: "Bull Market", weeklyProbability: 0.16, typicalDurationHours: [48, 120], demandMultiplier: 1.12, activityMultiplier: 1.18, revenueMultiplier: 1.15, riskMultiplier: 1.00, huntBias: "Trading, fund, brokerage", stockBias: "Equities / tech" },
  { state: "Neutral", weeklyProbability: 0.24, typicalDurationHours: [48, 144], demandMultiplier: 1.00, activityMultiplier: 1.00, revenueMultiplier: 1.00, riskMultiplier: 1.00, huntBias: "Balanced", stockBias: "Broad" },
  { state: "Risk-Off", weeklyProbability: 0.14, typicalDurationHours: [24, 96], demandMultiplier: 0.95, activityMultiplier: 0.92, revenueMultiplier: 0.94, riskMultiplier: 1.15, huntBias: "Treasury, risk, savings", stockBias: "SPY / defensive" },
  { state: "Correction", weeklyProbability: 0.12, typicalDurationHours: [24, 72], demandMultiplier: 0.92, activityMultiplier: 1.05, revenueMultiplier: 0.90, riskMultiplier: 1.22, huntBias: "Volatility, risk, liquidity", stockBias: "High-beta / broad" },
  { state: "Crisis", weeklyProbability: 0.05, typicalDurationHours: [12, 36], demandMultiplier: 0.82, activityMultiplier: 0.88, revenueMultiplier: 0.78, riskMultiplier: 1.40, huntBias: "Risk, treasury, liquidity", stockBias: "Scarce / event pool" },
  { state: "Recovery", weeklyProbability: 0.11, typicalDurationHours: [24, 96], demandMultiplier: 1.08, activityMultiplier: 1.12, revenueMultiplier: 1.10, riskMultiplier: 0.95, huntBias: "Growth after drawdown", stockBias: "Broad / tech" },
];

export const MARKET_CYCLE_TRANSITIONS: Record<MarketCycleState, Record<MarketCycleState, number>> = {
  "Expansion": { "Expansion": 0.35, "Bull Market": 0.25, Neutral: 0.20, "Risk-Off": 0.08, Correction: 0.05, Crisis: 0.01, Recovery: 0.06 },
  "Bull Market": { Expansion: 0.20, "Bull Market": 0.35, Neutral: 0.20, "Risk-Off": 0.08, Correction: 0.10, Crisis: 0.01, Recovery: 0.06 },
  Neutral: { Expansion: 0.18, "Bull Market": 0.15, Neutral: 0.32, "Risk-Off": 0.14, Correction: 0.08, Crisis: 0.02, Recovery: 0.11 },
  "Risk-Off": { Expansion: 0.08, "Bull Market": 0.05, Neutral: 0.28, "Risk-Off": 0.30, Correction: 0.16, Crisis: 0.04, Recovery: 0.09 },
  Correction: { Expansion: 0.04, "Bull Market": 0.03, Neutral: 0.20, "Risk-Off": 0.22, Correction: 0.25, Crisis: 0.08, Recovery: 0.18 },
  Crisis: { Expansion: 0.01, "Bull Market": 0.01, Neutral: 0.10, "Risk-Off": 0.18, Correction: 0.20, Crisis: 0.20, Recovery: 0.30 },
  Recovery: { Expansion: 0.18, "Bull Market": 0.18, Neutral: 0.25, "Risk-Off": 0.08, Correction: 0.05, Crisis: 0.01, Recovery: 0.25 },
};

export type CatalogEvent = {
  id: string;
  event: string;
  category: EventCategory;
  tone: EventTone;
  minStage: MarketStage;
  scope: EventScope;
  durationHours: number;
  baseSpawnWeight: number;
  demandBps: number;
  activityBps: number;
  revenueBps: number;
  riskBps: number;
  reputationDeltaMax: number;
  huntSpawnMultiplier: number;
  stockBias: string;
  playerChoice: boolean;
};

/** Plan §1.4 category/tone/minStage mapping + closest-equivalent spawn weights, hunt multipliers and stock biases carried over from the retired 40-event catalog. */
type FamilyMeta = {
  category: EventCategory;
  tone: EventTone;
  minStage: MarketStage;
  scope: EventScope;
  baseSpawnWeight: number;
  huntSpawnMultiplier: number;
  stockBias: string;
  playerChoice: boolean;
  reputationDeltaMax: number;
};

const FAMILY_META: Record<EconomicEventFamily, FamilyMeta> = {
  bull_market: { category: "Market", tone: "Positive", minStage: "humble", scope: "Global", baseSpawnWeight: 6, huntSpawnMultiplier: 1.25, stockBias: "TSLA,NVDA", playerChoice: false, reputationDeltaMax: 1 },
  tech_rally: { category: "Sector", tone: "Positive", minStage: "growing", scope: "Global", baseSpawnWeight: 7, huntSpawnMultiplier: 1.35, stockBias: "NVDA,MSFT,GOOGL,META", playerChoice: false, reputationDeltaMax: 1 },
  dividend_week: { category: "Market", tone: "Positive", minStage: "starter", scope: "Global", baseSpawnWeight: 5, huntSpawnMultiplier: 1.15, stockBias: "SPY,AAPL,MSFT", playerChoice: false, reputationDeltaMax: 1 },
  rate_cut: { category: "Macro", tone: "Positive", minStage: "starter", scope: "Personal", baseSpawnWeight: 7, huntSpawnMultiplier: 1.20, stockBias: "SPY,MSFT,AAPL", playerChoice: true, reputationDeltaMax: 1 },
  rate_hike: { category: "Macro", tone: "Mixed", minStage: "starter", scope: "Personal", baseSpawnWeight: 6, huntSpawnMultiplier: 1.15, stockBias: "SPY", playerChoice: true, reputationDeltaMax: 0 },
  credit_boom: { category: "Macro", tone: "Positive", minStage: "starter", scope: "Global", baseSpawnWeight: 6, huntSpawnMultiplier: 1.10, stockBias: "SPY,AMZN", playerChoice: true, reputationDeltaMax: 1 },
  recession: { category: "Macro", tone: "Negative", minStage: "established", scope: "Personal", baseSpawnWeight: 4, huntSpawnMultiplier: 0.90, stockBias: "SPY", playerChoice: true, reputationDeltaMax: -3 },
  liquidity_crunch: { category: "Risk/Crisis", tone: "Negative", minStage: "growing", scope: "Personal", baseSpawnWeight: 4, huntSpawnMultiplier: 1.20, stockBias: "COIN,SPY", playerChoice: true, reputationDeltaMax: -2 },
  bank_run: { category: "Risk/Crisis", tone: "Negative", minStage: "established", scope: "Personal", baseSpawnWeight: 3, huntSpawnMultiplier: 1.10, stockBias: "SPY", playerChoice: true, reputationDeltaMax: -4 },
  market_correction: { category: "Risk/Crisis", tone: "Negative", minStage: "growing", scope: "Personal", baseSpawnWeight: 5, huntSpawnMultiplier: 1.25, stockBias: "SPY,TSLA,COIN", playerChoice: true, reputationDeltaMax: -2 },
  earnings_season: { category: "Corporate", tone: "Positive", minStage: "starter", scope: "Global", baseSpawnWeight: 8, huntSpawnMultiplier: 1.30, stockBias: "Event tickers", playerChoice: false, reputationDeltaMax: 1 },
  ipo_week: { category: "Corporate", tone: "Positive", minStage: "established", scope: "Global", baseSpawnWeight: 6, huntSpawnMultiplier: 1.35, stockBias: "Event basket", playerChoice: true, reputationDeltaMax: 2 },
};

/** The 12 economic event families are the ONLY event catalog (plan §1.4). */
export const EVENT_CATALOG: readonly CatalogEvent[] = ECONOMIC_EVENTS.map((event: EconomicEvent) => {
  const meta = FAMILY_META[event.id];
  return {
    id: event.id,
    event: event.name,
    category: meta.category,
    tone: meta.tone,
    minStage: meta.minStage,
    scope: meta.scope,
    durationHours: event.durationHours,
    baseSpawnWeight: meta.baseSpawnWeight,
    demandBps: Math.round((averageSegmentDemand(event) - 1) * 10_000),
    activityBps: Math.round((event.activityMod - 1) * 10_000),
    revenueBps: Math.round((event.revenueMod - 1) * 10_000),
    riskBps: Math.round((event.riskMod - 1) * 10_000),
    reputationDeltaMax: meta.reputationDeltaMax,
    huntSpawnMultiplier: meta.huntSpawnMultiplier,
    stockBias: meta.stockBias,
    playerChoice: meta.playerChoice,
  };
});

export const BUILDING_EVENT_SENSITIVITY: Record<string, Record<EventCategory, number>> = {
  banking: { Macro: 1.15, Market: .80, Sector: .40, Customer: 1.20, Operational: .85, "Risk/Crisis": 1.30, Corporate: .80, "Prestige/Seasonal": .70 },
  brokerage: { Macro: .70, Market: 1.35, Sector: 1.20, Customer: 1.15, Operational: .90, "Risk/Crisis": 1.10, Corporate: 1.10, "Prestige/Seasonal": 1.05 },
  exchange: { Macro: .65, Market: 1.45, Sector: 1.15, Customer: 1.00, Operational: .95, "Risk/Crisis": 1.25, Corporate: 1.15, "Prestige/Seasonal": 1.15 },
  fund: { Macro: 1.00, Market: 1.25, Sector: 1.30, Customer: 1.05, Operational: .75, "Risk/Crisis": 1.15, Corporate: 1.20, "Prestige/Seasonal": 1.10 },
  insurance: { Macro: .80, Market: .50, Sector: .40, Customer: 1.00, Operational: 1.20, "Risk/Crisis": 1.25, Corporate: .60, "Prestige/Seasonal": .50 },
  research: { Macro: .60, Market: 1.00, Sector: 1.40, Customer: .70, Operational: 1.10, "Risk/Crisis": .80, Corporate: 1.00, "Prestige/Seasonal": .90 },
  treasury: { Macro: 1.20, Market: .70, Sector: .40, Customer: .70, Operational: .60, "Risk/Crisis": 1.45, Corporate: .60, "Prestige/Seasonal": .70 },
  wealth: { Macro: 1.00, Market: 1.05, Sector: 1.00, Customer: 1.25, Operational: .70, "Risk/Crisis": .95, Corporate: 1.15, "Prestige/Seasonal": 1.15 },
  investment_banking: { Macro: 1.10, Market: .95, Sector: .80, Customer: 1.00, Operational: .70, "Risk/Crisis": 1.00, Corporate: 1.45, "Prestige/Seasonal": 1.25 },
  market_maker: { Macro: .60, Market: 1.50, Sector: 1.15, Customer: .80, Operational: .90, "Risk/Crisis": 1.40, Corporate: 1.00, "Prestige/Seasonal": 1.10 },
};

export type EventDecision = { id: string; eventId: string; choice: string; immediateCostMinor: number; modifier: EventModifier; durationHours: number; successCondition: string; failureConsequence: string; cashRewardMinor: number; eventPoints: number; tradeoff: string };
const d = (id: string, eventId: string, choice: string, cost: number, demand: number, activity: number, revenue: number, risk: number, rep: number, durationHours: number, successCondition: string, failureConsequence: string, cashReward: number, points: number, tradeoff: string): EventDecision => ({ id, eventId, choice, immediateCostMinor: cost * 100, modifier: { demandBps: demand * 10_000, activityBps: activity * 10_000, revenueBps: revenue * 10_000, riskBps: risk * 10_000, huntSpawnBps: 0, reputationDelta: rep }, durationHours, successCondition, failureConsequence, cashRewardMinor: cashReward * 100, eventPoints: points, tradeoff });

/** Re-authored onto the 12 families (≥1 per family, same 18-decision shape). */
export const EVENT_DECISIONS: readonly EventDecision[] = [
  d("bull_ride_momentum", "bull_market", "Ride the momentum", 10_000, .05, .12, .08, .10, 0, 24, "Trading volume target met", "Drawdown if momentum reverses", 25_000, 6, "Upside vs reversal risk"),
  d("bull_take_profits", "bull_market", "Take profits early", 0, -.04, -.08, .02, -.12, 1, 24, "Any", "Miss part of the rally", 10_000, 3, "Safety vs upside"),
  d("correction_reduce_exposure", "market_correction", "Reduce exposure", 10_000, 0, -.08, -.05, -.15, 1, 12, "Research building active", "Miss rebound bonus", 0, 4, "Protection vs upside"),
  d("correction_buy_dip", "market_correction", "Buy the dip", 25_000, .02, .12, .08, .15, 0, 12, "Recovery occurs", "Temporary drawdown", 25_000, 6, "Contrarian risk"),
  d("earnings_publish_research", "earnings_season", "Publish research notes", 5_000, .03, .10, .05, .02, 1, 48, "Brokerage or research building active", "Spend without lift", 15_000, 4, "Spend to capture attention"),
  d("ipo_join_syndicate", "ipo_week", "Join the IPO syndicate", 40_000, .05, .12, .10, .08, 2, 72, "Corporate or institutional building active", "Fees without allocation", 30_000, 6, "Fees vs allocation"),
  d("ratecut_expand_credit", "rate_cut", "Expand lending book", 0, .10, .06, .06, .06, 1, 24, "Bank or lending building active", "Credit risk builds", 10_000, 4, "Growth vs risk"),
  d("hike_raise_rates", "rate_hike", "Raise lending rates", 0, -.08, -.05, .10, .08, -1, 24, "Maintain retention >85%", "Customer churn", 5_000, 3, "Margin vs growth"),
  d("hike_hold_rates", "rate_hike", "Hold customer rates", 0, .04, .03, -.05, -.02, 2, 24, "Maintain liquidity", "Lower profit", 0, 4, "Loyalty vs margin"),
  d("crunch_inject_reserves", "liquidity_crunch", "Inject reserves", 50_000, 0, 0, -.05, -.18, 2, 12, "Have Treasury/Vault or enough Cash", "None beyond cost", 0, 4, "Spend Cash to protect empire"),
  d("crunch_limit_activity", "liquidity_crunch", "Limit activity", 0, -.05, -.20, -.12, -.12, 1, 12, "Accept lower throughput", "Lower revenue", 0, 3, "Safety vs activity"),
  d("creditboom_expand_book", "credit_boom", "Expand the loan book", 0, .08, .08, .08, .10, 1, 48, "Lending building active", "Credit losses later", 15_000, 4, "Growth vs credit quality"),
  d("bankrun_reassure", "bank_run", "Public reassurance", 15_000, -.04, -.05, -.08, -.10, 3, 8, "Reputation >=75", "If low reputation, effect halved", 0, 5, "Trust investment"),
  d("bankrun_reserve", "bank_run", "Increase liquidity reserve", 50_000, -.02, -.10, -.10, -.20, 2, 8, "Reserve requirement met", "None", 0, 5, "Liquidity vs earnings"),
  d("techrally_double_down", "tech_rally", "Double down on tech flow", 10_000, .04, .14, .08, .10, 1, 24, "Research or digital building active", "Crowded trade reverses", 20_000, 5, "Momentum vs crowding"),
  d("recession_tighten", "recession", "Tighten operations", 0, -.12, -.15, -.08, -.20, 2, 72, "Credit losses stay below threshold", "Lower growth", 0, 7, "Preservation vs expansion"),
  d("recession_maintain", "recession", "Maintain lending", 0, -.05, .04, .05, .20, -2, 72, "Defaults stay controlled", "Large loss + rep hit", 40_000, 8, "Performance vs systemic risk"),
  d("dividend_reinvest", "dividend_week", "Reinvest distributions", 0, .02, .06, .04, 0, 1, 48, "Fund or wealth building active", "None", 10_000, 3, "Reinvestment vs Cash now"),
];

export type EventMission = { id: string; mission: string; eventFamily: string; minStage: MarketStage; metric: string; baseTarget: number; timeLimitHours: number; cashRewardMinor: number; repReward: number; eventPoints: number; stockRewardBias: string; failurePenalty: string };
const m = (id: string, mission: string, family: string, stage: MarketStage, metric: string, target: number, hours: number, cash: number, rep: number, points: number, stock: string, penalty = "None"): EventMission => ({ id, mission, eventFamily: family, minStage: stage, metric, baseTarget: target, timeLimitHours: hours, cashRewardMinor: cash * 100, repReward: rep, eventPoints: points, stockRewardBias: stock, failurePenalty: penalty });
export const EVENT_MISSIONS: readonly EventMission[] = [
  m("trade_the_rally", "Trade the Rally", "Market", "growing", "Trading volume", 500_000, 24, 10_000, 1, 4, "TSLA,NVDA"),
  m("dividend_collector", "Dividend Collector", "Market", "starter", "AUM inflow", 100_000, 48, 8_000, 1, 3, "SPY,AAPL,MSFT"),
  m("capture_the_tech_rally", "Capture the Tech Rally", "Sector", "growing", "New customers", 250, 24, 7_500, 1, 3, "NVDA,MSFT"),
  m("fund_the_opportunity", "Fund the Opportunity", "Macro", "growing", "AUM inflow", 250_000, 36, 12_000, 2, 4, "SPY,NVDA"),
  m("protect_retention", "Protect Retention", "Macro", "starter", "Retention", .88, 24, 4_000, 2, 3, "Broad", "-1 rep if <80%"),
  m("lend_into_the_boom", "Lend Into the Boom", "Macro", "starter", "Lending volume", 100_000, 36, 10_000, 2, 4, "SPY,AMZN"),
  m("weather_the_recession", "Weather the Recession", "Macro", "established", "Composite health", .80, 72, 40_000, 5, 8, "Broad", "Prestige loss if failed"),
  m("maintain_liquidity", "Maintain Liquidity", "Risk/Crisis", "growing", "Reserve ratio", .15, 24, 7_500, 2, 4, "SPY", "Temporary risk +5%"),
  m("survive_the_correction", "Survive the Correction", "Risk/Crisis", "established", "Risk below threshold", .25, 24, 25_000, 4, 6, "SPY,COIN", "-3 rep if severe fail"),
  m("hold_the_line", "Hold the Line", "Risk/Crisis", "established", "Retention", .85, 12, 20_000, 3, 6, "SPY", "-2 rep if failed"),
  m("handle_peak_volume", "Handle Peak Volume", "Corporate", "starter", "Transactions", 1000, 48, 5_000, 1, 3, "Event tickers"),
  m("complete_the_ipo_book", "Complete the IPO Book", "Corporate", "established", "Corporate actions", 3, 72, 30_000, 3, 6, "Event basket"),
  m("world_market_leader", "World Market Leader", "Prestige", "tycoon", "Event activity score", 10_000_000, 72, 75_000, 5, 10, "Broad"),
];

export const EVENT_REWARD_RULES = { weeklyCashCapMinor: 500_000, weeklyMissionPointsCap: 5, crisisCooldownHours: 168, negativePityWindowHours: 48, sameEventCooldownHours: { humble: 48, starter: 48, growing: 72, established: 72, elite: 96, tycoon: 96 } as Record<MarketStage, number> } as const;

export function stageIndex(stage: MarketStage): number { return MARKET_STAGES.indexOf(stage); }
export function eventEligible(event: CatalogEvent, stage: MarketStage): boolean { return stageIndex(stage) >= stageIndex(event.minStage); }
export function cycleRule(state: MarketCycleState): MarketCycleRule { return MARKET_CYCLE_RULES.find((rule) => rule.state === state) ?? MARKET_CYCLE_RULES[2]!; }
export function cycleModifier(state: MarketCycleState): EventModifier { const rule = cycleRule(state); return { demandBps: Math.round((rule.demandMultiplier - 1) * 10_000), activityBps: Math.round((rule.activityMultiplier - 1) * 10_000), revenueBps: Math.round((rule.revenueMultiplier - 1) * 10_000), riskBps: Math.round((rule.riskMultiplier - 1) * 10_000), huntSpawnBps: 0, reputationDelta: 0 }; }
export function catalogModifier(event: CatalogEvent, family?: string): EventModifier {
  const sensitivity = family ? BUILDING_EVENT_SENSITIVITY[family]?.[event.category] ?? 1 : 1;
  return { demandBps: event.demandBps, activityBps: Math.round(event.activityBps * sensitivity), revenueBps: Math.round(event.revenueBps * sensitivity), riskBps: Math.round(event.riskBps * sensitivity), huntSpawnBps: Math.round((event.huntSpawnMultiplier - 1) * 10_000), reputationDelta: event.reputationDeltaMax };
}

export function stackModifiers(modifiers: readonly EventModifier[]): EventModifier {
  const result: EventModifier = { demandBps: 0, activityBps: 0, revenueBps: 0, riskBps: 0, huntSpawnBps: 0, reputationDelta: 0 };
  for (const key of ["demandBps", "activityBps", "revenueBps", "riskBps"] as const) {
    const raw = modifiers.reduce((sum, modifier) => sum + modifier[key], 0);
    const sameDirectionCap = raw >= 0 ? 4_000 : -4_000;
    result[key] = Math.max(-5_000, Math.min(5_000, Math.min(Math.abs(raw), Math.abs(sameDirectionCap)) * Math.sign(raw)));
  }
  result.huntSpawnBps = Math.max(-5_000, Math.min(5_000, modifiers.reduce((sum, modifier) => sum + modifier.huntSpawnBps, 0)));
  result.reputationDelta = modifiers.reduce((sum, modifier) => sum + modifier.reputationDelta, 0);
  return result;
}

export const EVENT_CATALOG_COUNT = EVENT_CATALOG.length;
