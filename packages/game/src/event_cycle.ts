import { MARKET_STAGES, type MarketStage } from "./market_phase3.ts";

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
] as const;

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

const e = (id: string, event: string, category: EventCategory, tone: EventTone, minStage: MarketStage, scope: EventScope, durationHours: number, baseSpawnWeight: number, demand: number, activity: number, revenue: number, risk: number, rep: number, hunt: number, stockBias: string, playerChoice: boolean): CatalogEvent => ({
  id, event, category, tone, minStage, scope, durationHours, baseSpawnWeight, demandBps: Math.round(demand * 10_000), activityBps: Math.round(activity * 10_000), revenueBps: Math.round(revenue * 10_000), riskBps: Math.round(risk * 10_000), reputationDeltaMax: rep, huntSpawnMultiplier: hunt, stockBias, playerChoice,
});

export const EVENT_CATALOG: readonly CatalogEvent[] = [
  e("retail_investor_rush", "Retail Investor Rush", "Customer", "Positive", "humble", "Global", 24, 8, .18, .15, .10, 0, 1, 1.20, "AAPL,TSLA,AMZN", false),
  e("savings_campaign", "Savings Campaign", "Customer", "Positive", "humble", "Personal", 24, 6, .15, .05, .08, -.05, 1, 1.10, "SPY,MSFT", true),
  e("local_business_boom", "Local Business Boom", "Customer", "Positive", "humble", "Global", 36, 5, .12, .12, .10, 0, 1, 1.10, "AMZN,SPY", false),
  e("currency_volatility", "Currency Volatility", "Market", "Mixed", "humble", "Global", 18, 5, .02, .18, .08, .12, 0, 1.15, "Broad", true),
  e("consumer_slowdown", "Consumer Slowdown", "Customer", "Negative", "humble", "Global", 24, 4, -.12, -.08, -.10, .08, -1, .90, "SPY", true),
  e("trading_frenzy", "Trading Frenzy", "Market", "Positive", "humble", "Global", 12, 6, .08, .25, .18, .08, 1, 1.25, "TSLA,NVDA", false),
  e("service_backlog", "Service Backlog", "Operational", "Negative", "humble", "Personal", 8, 5, -.05, -.12, -.08, .10, -2, .85, "Broad", true),
  e("community_trust_boost", "Community Trust Boost", "Customer", "Positive", "humble", "Personal", 24, 4, .10, .05, .05, -.05, 3, 1.05, "Broad", false),
  e("rate_cut", "Rate Cut", "Macro", "Mixed", "starter", "Global", 48, 7, .12, .08, .04, -.02, 1, 1.20, "SPY,MSFT,AAPL", true),
  e("rate_hike", "Rate Hike", "Macro", "Mixed", "starter", "Global", 48, 6, -.06, -.04, .05, .08, 0, 1.15, "SPY", true),
  e("earnings_week", "Earnings Week", "Corporate", "Positive", "starter", "Global", 48, 8, .08, .16, .12, .06, 1, 1.30, "Event tickers", false),
  e("dividend_week", "Dividend Week", "Corporate", "Positive", "starter", "Global", 72, 5, .10, .06, .05, -.05, 1, 1.15, "SPY,AAPL,MSFT", false),
  e("brokerage_fee_war", "Brokerage Fee War", "Market", "Mixed", "starter", "Personal", 24, 5, .15, .20, -.10, .02, 0, 1.15, "AAPL,AMZN", true),
  e("loan_demand_surge", "Loan Demand Surge", "Customer", "Positive", "starter", "Global", 36, 6, .16, .10, .12, .10, 1, 1.10, "SPY,AMZN", true),
  e("credit_quality_deterioration", "Credit Quality Deterioration", "Risk/Crisis", "Negative", "starter", "Personal", 24, 4, -.08, -.05, -.12, .20, -2, .90, "SPY", true),
  e("research_breakthrough", "Research Breakthrough", "Sector", "Positive", "starter", "Personal", 24, 5, .04, .12, .08, -.03, 2, 1.25, "NVDA,MSFT,GOOGL", false),
  e("system_outage", "System Outage", "Operational", "Negative", "starter", "Personal", 6, 3, -.08, -.22, -.18, .15, -3, .70, "Broad", true),
  e("insurance_claim_wave", "Insurance Claim Wave", "Operational", "Negative", "starter", "Personal", 18, 4, -.04, -.05, -.15, .18, -2, .90, "SPY", true),
  e("ai_mania", "AI Mania", "Sector", "Positive", "growing", "Global", 36, 7, .10, .20, .16, .10, 1, 1.35, "NVDA,MSFT,GOOGL,META", false),
  e("tech_selloff", "Tech Selloff", "Sector", "Negative", "growing", "Global", 24, 5, -.04, .15, -.12, .20, 0, 1.25, "NVDA,TSLA,GOOGL", true),
  e("liquidity_boom", "Liquidity Boom", "Market", "Positive", "growing", "Global", 36, 6, .08, .18, .14, -.05, 1, 1.25, "COIN,SPY", false),
  e("liquidity_crunch", "Liquidity Crunch", "Risk/Crisis", "Negative", "growing", "Global", 24, 4, -.12, -.10, -.16, .28, -2, 1.20, "COIN,SPY", true),
  e("sme_growth_wave", "SME Growth Wave", "Customer", "Positive", "growing", "Global", 48, 6, .16, .10, .12, .05, 1, 1.10, "AMZN,SPY", false),
  e("cybersecurity_scare", "Cybersecurity Scare", "Operational", "Negative", "growing", "Personal", 12, 4, -.06, -.15, -.12, .20, -3, .90, "Broad", true),
  e("fund_inflow_surge", "Fund Inflow Surge", "Customer", "Positive", "growing", "Global", 36, 6, .12, .14, .13, .04, 1, 1.20, "SPY,MSFT,NVDA", false),
  e("portfolio_drawdown", "Portfolio Drawdown", "Market", "Negative", "growing", "Personal", 24, 5, -.05, .08, -.14, .18, -1, 1.15, "Broad", true),
  e("ipo_week", "IPO Week", "Corporate", "Positive", "established", "Global", 72, 6, .12, .18, .15, .08, 2, 1.35, "Event basket", true),
  e("ma_boom", "M&A Boom", "Corporate", "Positive", "established", "Global", 48, 5, .10, .15, .14, .08, 2, 1.25, "SPY,MSFT", false),
  e("institutional_flow", "Institutional Flow", "Customer", "Positive", "established", "Global", 48, 6, .12, .16, .14, .02, 2, 1.25, "SPY,MSFT", false),
  e("regulatory_review", "Regulatory Review", "Macro", "Mixed", "established", "Personal", 36, 4, -.05, -.08, -.05, .12, -1, 1.00, "Broad", true),
  e("bank_run_rumor", "Bank Run Rumor", "Risk/Crisis", "Negative", "established", "Personal", 18, 3, -.18, -.12, -.18, .32, -4, 1.10, "SPY", true),
  e("market_maker_dislocation", "Market Maker Dislocation", "Risk/Crisis", "Negative", "established", "Personal", 12, 3, -.08, .12, -.15, .28, -2, 1.25, "COIN,TSLA", true),
  e("private_wealth_influx", "Private Wealth Influx", "Customer", "Positive", "established", "Global", 36, 5, .15, .10, .13, -.02, 2, 1.15, "AAPL,MSFT,SPY", false),
  e("institutional_reputation_review", "Institutional Reputation Review", "Operational", "Mixed", "established", "Personal", 24, 4, 0, 0, 0, .05, 4, 1.00, "Broad", true),
  e("global_trading_boom", "Global Trading Boom", "Market", "Positive", "elite", "Global", 48, 5, .10, .28, .20, .12, 2, 1.40, "COIN,NVDA,TSLA", false),
  e("sovereign_allocation", "Sovereign Allocation", "Corporate", "Positive", "elite", "Global", 72, 4, .12, .14, .16, .02, 3, 1.25, "SPY,MSFT", true),
  e("systemic_stress_test", "Systemic Stress Test", "Risk/Crisis", "Mixed", "elite", "Personal", 36, 3, -.08, -.06, -.08, .25, 4, 1.10, "Broad", true),
  e("global_credit_shock", "Global Credit Shock", "Risk/Crisis", "Negative", "tycoon", "Global", 36, 2, -.18, -.14, -.22, .35, -4, 1.25, "SPY,COIN", true),
  e("world_market_week", "World Market Week", "Prestige/Seasonal", "Positive", "tycoon", "Global", 72, 3, .15, .25, .22, .10, 4, 1.50, "Broad", true),
  e("financial_summit", "Financial Summit", "Prestige/Seasonal", "Positive", "established", "Global", 48, 4, .10, .12, .10, -.03, 3, 1.20, "Broad", true),
] as const;

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

export const EVENT_DECISIONS: readonly EventDecision[] = [
  d("crunch_inject_reserves", "liquidity_crunch", "Inject reserves", 50_000, 0, 0, -.05, -.18, 2, 24, "Have Treasury/Vault or enough Cash", "None beyond cost", 0, 4, "Spend Cash to protect empire"),
  d("crunch_limit_activity", "liquidity_crunch", "Limit activity", 0, -.05, -.20, -.12, -.12, 1, 24, "Accept lower throughput", "Lower revenue", 0, 3, "Safety vs activity"),
  d("crunch_operate_normally", "liquidity_crunch", "Operate normally", 0, -.10, .05, .05, .15, -2, 24, "Risk event does not trigger", "Extra rep loss + temporary capacity hit", 15_000, 5, "Upside vs downside"),
  d("hike_raise_rates", "rate_hike", "Raise lending rates", 0, -.08, -.05, .10, .08, -1, 48, "Maintain retention >85%", "Customer churn", 5_000, 3, "Margin vs growth"),
  d("hike_hold_rates", "rate_hike", "Hold customer rates", 0, .04, .03, -.05, -.02, 2, 48, "Maintain liquidity", "Lower profit", 0, 4, "Loyalty vs margin"),
  d("fee_cut", "brokerage_fee_war", "Cut fees", 10_000, 0, .18, -.15, .02, 1, 24, "Volume target met", "Cash loss without volume", 10_000, 4, "Acquire customers vs margin"),
  d("fee_keep", "brokerage_fee_war", "Keep fees", 0, -.05, -.08, .05, 0, 0, 24, "Retention stays healthy", "Lose market share", 0, 2, "Margin vs share"),
  d("outage_repair", "system_outage", "Emergency repair", 25_000, 0, -.05, -.05, -.12, 1, 6, "Pay cost", "None", 0, 4, "Cash vs uptime"),
  d("outage_degraded", "system_outage", "Run degraded", 0, -.05, -.18, -.12, .08, -2, 6, "No secondary failure", "Rep/capacity hit", 5_000, 2, "Save Cash vs service quality"),
  d("rumor_reassure", "bank_run_rumor", "Public reassurance", 15_000, -.04, -.05, -.08, -.10, 3, 18, "Reputation >=75", "If low reputation, effect halved", 0, 5, "Trust investment"),
  d("rumor_reserve", "bank_run_rumor", "Increase liquidity reserve", 50_000, -.02, -.10, -.10, -.20, 2, 18, "Reserve requirement met", "None", 0, 5, "Liquidity vs earnings"),
  d("rumor_ignore", "bank_run_rumor", "Ignore rumor", 0, -.15, -.05, .03, .20, -4, 18, "Rumor fades", "Customer outflow", 20_000, 4, "Bet on normalization"),
  d("review_full_audit", "regulatory_review", "Full compliance audit", 40_000, -.02, -.08, -.10, -.15, 4, 36, "Complete audit", "None", 0, 6, "Cost vs reputation"),
  d("review_minimal", "regulatory_review", "Minimal response", 5_000, -.05, -.03, .02, .12, -2, 36, "No escalation", "Rep loss / temporary restriction", 10_000, 2, "Short-term profit vs long-term trust"),
  d("selloff_reduce", "tech_selloff", "Reduce exposure", 10_000, 0, -.08, -.05, -.15, 1, 24, "Research building active", "Miss rebound bonus", 0, 4, "Protection vs upside"),
  d("selloff_buy", "tech_selloff", "Buy the dip", 25_000, .02, .12, .08, .15, 0, 24, "Recovery occurs", "Temporary drawdown", 25_000, 6, "Contrarian risk"),
  d("shock_tighten", "global_credit_shock", "Tighten lending", 0, -.12, -.15, -.08, -.20, 2, 36, "Credit losses stay below threshold", "Lower growth", 0, 7, "Preservation vs expansion"),
  d("shock_maintain", "global_credit_shock", "Maintain lending", 0, -.05, .04, .05, .20, -2, 36, "Defaults stay controlled", "Large loss + rep hit", 40_000, 8, "Performance vs systemic risk"),
];

export type EventMission = { id: string; mission: string; eventFamily: string; minStage: MarketStage; metric: string; baseTarget: number; timeLimitHours: number; cashRewardMinor: number; repReward: number; eventPoints: number; stockRewardBias: string; failurePenalty: string };
const m = (id: string, mission: string, family: string, stage: MarketStage, metric: string, target: number, hours: number, cash: number, rep: number, points: number, stock: string, penalty = "None"): EventMission => ({ id, mission, eventFamily: family, minStage: stage, metric, baseTarget: target, timeLimitHours: hours, cashRewardMinor: cash * 100, repReward: rep, eventPoints: points, stockRewardBias: stock, failurePenalty: penalty });
export const EVENT_MISSIONS: readonly EventMission[] = [
  m("capture_the_rush", "Capture the Rush", "Positive Market", "humble", "New customers", 100, 24, 2500, 1, 2, "Broad"),
  m("handle_peak_volume", "Handle Peak Volume", "Trading", "starter", "Transactions", 1000, 24, 5000, 1, 3, "TSLA,NVDA"),
  m("protect_retention", "Protect Retention", "Customer Pressure", "starter", "Retention", .88, 24, 4000, 2, 3, "Broad", "-1 rep if <80%"),
  m("maintain_liquidity", "Maintain Liquidity", "Risk", "growing", "Reserve ratio", .15, 24, 7500, 2, 4, "SPY", "Temporary risk +5%"),
  m("recover_service", "Recover Service", "Operational", "starter", "Restore capacity", .90, 12, 5000, 2, 3, "Broad", "Revenue -5% extra"),
  m("trade_the_volatility", "Trade the Volatility", "Market", "growing", "Trading volume", 500_000, 24, 10_000, 1, 4, "TSLA,COIN"),
  m("fund_the_opportunity", "Fund the Opportunity", "Fund", "growing", "AUM inflow", 250_000, 36, 12_000, 2, 4, "SPY,NVDA"),
  m("win_institutional_flow", "Win Institutional Flow", "Institutional", "established", "Institutional clients", 15, 48, 20_000, 3, 5, "SPY,MSFT"),
  m("survive_the_crunch", "Survive the Crunch", "Risk/Crisis", "established", "Risk below threshold", .25, 24, 25_000, 4, 6, "SPY,COIN", "-3 rep if severe fail"),
  m("complete_the_ipo_book", "Complete the IPO Book", "Corporate", "established", "Corporate actions", 3, 72, 30_000, 3, 6, "Event basket"),
  m("pass_the_stress_test", "Pass the Stress Test", "Risk/Crisis", "elite", "Composite health", .80, 36, 40_000, 5, 8, "Broad", "Prestige loss if failed"),
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
