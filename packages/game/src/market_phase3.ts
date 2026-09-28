import type { EmpireRank } from "./progression.ts";

/** v0.2 empire rank; kept as the market-stage alias for compatibility. */
export type MarketStage = EmpireRank;
export type HuntDifficulty = "easy" | "standard" | "hard" | "elite" | "jackpot";
export type RewardRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export type MarketStock = {
  ticker: string;
  name: string;
  sector: string;
  unlockStage: MarketStage;
  selectionWeight: number;
  allocationBps: number;
  oraclePriceMinor: number;
  affinityTags: readonly string[];
};

export type MarketCollection = {
  id: string;
  name: string;
  tickers: readonly string[];
  minStage: MarketStage;
  reward: string;
  secondaryReward: string;
};

export type MarketHuntTemplate = {
  id: string;
  name: string;
  family: string;
  minStage: MarketStage;
  difficulty: HuntDifficulty;
  requiredBusiness: string;
  metric: string;
  target: number;
  unit: string;
  durationHours: number;
  rewardBias: RewardRarity;
  points: number;
  stockAffinity: string;
  notes: string;
};

export type DifficultyRule = {
  difficulty: HuntDifficulty;
  targetMultiplier: number;
  durationHours: number;
  points: number;
  rarityOdds: Record<RewardRarity, number>;
  expectedRewardMinor: number;
};

export const MARKET_STAGES: readonly MarketStage[] = ["humble", "starter", "growing", "established", "elite", "tycoon"];
export const MARKET_STAGE_LABEL: Record<MarketStage, string> = {
  humble: "Humble",
  starter: "Starter",
  growing: "Growing",
  established: "Established",
  elite: "Elite",
  tycoon: "Tycoon",
};

export const STAGE_RULES: Record<MarketStage, {
  empireLevels: [number, number];
  baseHunts: number;
  bonusHunts: number;
  targetCompletion: number;
  difficultyMix: Record<HuntDifficulty, number>;
  weeklyPointTarget: number;
}> = {
  // v0.2 rank bands (Financial_Empire_Balancing_Model_v0.2): 1–4 / 5–8 / 9–12 / 13–16 / 17–20 / 21–24.
  humble: { empireLevels: [1, 4], baseHunts: 3, bonusHunts: 0, targetCompletion: 0.45, difficultyMix: { easy: 0.7, standard: 0.25, hard: 0.05, elite: 0, jackpot: 0 }, weeklyPointTarget: 22 },
  starter: { empireLevels: [5, 8], baseHunts: 3, bonusHunts: 1, targetCompletion: 0.55, difficultyMix: { easy: 0.5, standard: 0.4, hard: 0.1, elite: 0, jackpot: 0 }, weeklyPointTarget: 32 },
  growing: { empireLevels: [9, 12], baseHunts: 3, bonusHunts: 1, targetCompletion: 0.65, difficultyMix: { easy: 0.3, standard: 0.5, hard: 0.18, elite: 0.02, jackpot: 0 }, weeklyPointTarget: 45 },
  established: { empireLevels: [13, 16], baseHunts: 3, bonusHunts: 2, targetCompletion: 0.72, difficultyMix: { easy: 0.2, standard: 0.45, hard: 0.28, elite: 0.07, jackpot: 0 }, weeklyPointTarget: 60 },
  elite: { empireLevels: [17, 20], baseHunts: 4, bonusHunts: 2, targetCompletion: 0.78, difficultyMix: { easy: 0.1, standard: 0.35, hard: 0.35, elite: 0.18, jackpot: 0.02 }, weeklyPointTarget: 80 },
  tycoon: { empireLevels: [21, 24], baseHunts: 4, bonusHunts: 2, targetCompletion: 0.82, difficultyMix: { easy: 0.05, standard: 0.25, hard: 0.35, elite: 0.3, jackpot: 0.05 }, weeklyPointTarget: 100 },
};

export const DIFFICULTY_RULES: Record<HuntDifficulty, DifficultyRule> = {
  easy: { difficulty: "easy", targetMultiplier: 0.75, durationHours: 24, points: 1, rarityOdds: { common: 0.75, uncommon: 0.2, rare: 0.05, epic: 0, legendary: 0 }, expectedRewardMinor: 15 },
  standard: { difficulty: "standard", targetMultiplier: 1, durationHours: 24, points: 2, rarityOdds: { common: 0.5, uncommon: 0.35, rare: 0.13, epic: 0.02, legendary: 0 }, expectedRewardMinor: 22.25 },
  hard: { difficulty: "hard", targetMultiplier: 1.5, durationHours: 36, points: 4, rarityOdds: { common: 0.25, uncommon: 0.35, rare: 0.28, epic: 0.1, legendary: 0.02 }, expectedRewardMinor: 40.25 },
  elite: { difficulty: "elite", targetMultiplier: 2.25, durationHours: 48, points: 7, rarityOdds: { common: 0.1, uncommon: 0.25, rare: 0.35, epic: 0.25, legendary: 0.05 }, expectedRewardMinor: 62.25 },
  jackpot: { difficulty: "jackpot", targetMultiplier: 3.5, durationHours: 72, points: 12, rarityOdds: { common: 0.02, uncommon: 0.08, rare: 0.25, epic: 0.4, legendary: 0.25 }, expectedRewardMinor: 117.2 },
};

export const REWARD_VALUES_MINOR: Record<RewardRarity, number> = {
  common: 10,
  uncommon: 25,
  rare: 50,
  epic: 100,
  legendary: 250,
};

export const MARKET_STOCKS: readonly MarketStock[] = [
  { ticker: "AAPL", name: "Apple", sector: "Mega Tech", unlockStage: "humble", selectionWeight: 12, allocationBps: 1200, oraclePriceMinor: 10_000, affinityTags: ["Consumer", "Brokerage", "Research"] },
  { ticker: "NVDA", name: "NVIDIA", sector: "AI & Compute", unlockStage: "starter", selectionWeight: 10, allocationBps: 1000, oraclePriceMinor: 10_000, affinityTags: ["Research", "Trading", "AI"] },
  { ticker: "TSLA", name: "Tesla", sector: "High Beta", unlockStage: "starter", selectionWeight: 9, allocationBps: 900, oraclePriceMinor: 10_000, affinityTags: ["Trading", "Brokerage", "Volatility"] },
  { ticker: "MSFT", name: "Microsoft", sector: "Mega Tech", unlockStage: "humble", selectionWeight: 12, allocationBps: 1200, oraclePriceMinor: 10_000, affinityTags: ["Research", "Fund", "Enterprise"] },
  { ticker: "AMZN", name: "Amazon", sector: "Consumer Digital", unlockStage: "humble", selectionWeight: 11, allocationBps: 1100, oraclePriceMinor: 10_000, affinityTags: ["Consumer", "Fund", "Brokerage"] },
  { ticker: "GOOGL", name: "Alphabet", sector: "Mega Tech", unlockStage: "growing", selectionWeight: 10, allocationBps: 1000, oraclePriceMinor: 10_000, affinityTags: ["Research", "Fund", "Data"] },
  { ticker: "META", name: "Meta", sector: "Mega Tech", unlockStage: "growing", selectionWeight: 9, allocationBps: 900, oraclePriceMinor: 10_000, affinityTags: ["Consumer", "Research", "Growth"] },
  { ticker: "COIN", name: "Coinbase", sector: "Market Infrastructure", unlockStage: "established", selectionWeight: 7, allocationBps: 700, oraclePriceMinor: 10_000, affinityTags: ["Crypto", "Exchange", "Trading"] },
  { ticker: "NFLX", name: "Netflix", sector: "Consumer Digital", unlockStage: "growing", selectionWeight: 8, allocationBps: 800, oraclePriceMinor: 10_000, affinityTags: ["Consumer", "Growth", "Fund"] },
  { ticker: "SPY", name: "SPDR S&P 500 ETF", sector: "Core Market", unlockStage: "humble", selectionWeight: 12, allocationBps: 1200, oraclePriceMinor: 10_000, affinityTags: ["Broad Market", "Fund", "Savings"] },
];

export const MARKET_COLLECTIONS: readonly MarketCollection[] = [
  { id: "core_market", name: "Core Market", tickers: ["SPY", "AAPL", "MSFT"], minStage: "starter", reward: "Core Market board badge", secondaryReward: "1 free Hunt reroll / week" },
  { id: "mega_tech", name: "Mega Tech", tickers: ["AAPL", "MSFT", "GOOGL", "META"], minStage: "growing", reward: "Tech-themed board skin", secondaryReward: "Research Hunt spawn +5%" },
  { id: "ai_compute", name: "AI & Compute", tickers: ["NVDA", "MSFT", "GOOGL"], minStage: "growing", reward: "Research Module cosmetic skin", secondaryReward: "Research Hunt quality +3%" },
  { id: "consumer_digital", name: "Consumer Digital", tickers: ["AMZN", "NFLX", "META"], minStage: "established", reward: "Consumer Market card art", secondaryReward: "Customer event bonus +3%" },
  { id: "high_beta", name: "High Beta Markets", tickers: ["TSLA", "COIN", "NVDA"], minStage: "established", reward: "Volatility event badge", secondaryReward: "1 additional event reroll / week" },
  { id: "complete_ten", name: "Complete Ten", tickers: MARKET_STOCKS.map((stock) => stock.ticker), minStage: "elite", reward: "Collector landmark card", secondaryReward: "Permanent profile prestige + board cosmetic" },
];

const h = (
  id: string,
  name: string,
  family: string,
  minStage: MarketStage,
  difficulty: HuntDifficulty,
  requiredBusiness: string,
  metric: string,
  target: number,
  unit: string,
  rewardBias: RewardRarity,
  stockAffinity: string,
  notes: string,
): MarketHuntTemplate => ({ id, name, family, minStage, difficulty, requiredBusiness, metric, target, unit, durationHours: DIFFICULTY_RULES[difficulty].durationHours, rewardBias, points: DIFFICULTY_RULES[difficulty].points, stockAffinity, notes });

export const MARKET_HUNTS: readonly MarketHuntTemplate[] = [
  h("first_customers", "First Customers", "Customers", "humble", "easy", "Any customer-facing business", "New customers", 25, "customers", "common", "Broad", "Intro acquisition mission"),
  h("busy_kiosk", "Busy Kiosk", "Customers", "humble", "easy", "Kiosk / Booth", "Utilization", 0.6, "utilization", "common", "Broad", "Reach healthy use without maxing capacity"),
  h("savings_rush", "Savings Rush", "Banking", "humble", "standard", "Savings / Bank", "Deposits activity", 10_000, "Cash activity", "uncommon", "SPY,AAPL", "Savings-driven hunt"),
  h("trade_the_session", "Trade the Session", "Trading", "humble", "standard", "Trading Booth / Brokerage", "Trades", 50, "trades", "uncommon", "AAPL,TSLA", "Entry trading hunt"),
  h("cashflow_positive", "Cashflow Positive", "Revenue", "humble", "easy", "Any", "Net Cash", 5_000, "Cash", "common", "Broad", "Basic business productivity"),
  h("reputation_builder", "Reputation Builder", "Customers", "humble", "standard", "Any", "Reputation gain", 3, "points", "uncommon", "Broad", "Rewards service quality"),
  h("first_upgrade", "First Upgrade", "Progression", "humble", "easy", "Any", "Building upgrades", 1, "upgrade", "common", "Broad", "Teaches reinvestment"),
  h("two_business_synergy", "Two-Business Synergy", "Placement", "humble", "standard", "Any valid synergy pair", "Synergy uptime", 6, "hours", "uncommon", "Broad", "Teaches placement relationships"),
  h("micro_lending_day", "Micro Lending Day", "Lending", "humble", "standard", "Micro Loan / Lending", "Loan activity", 8_000, "Cash activity", "uncommon", "SPY,AMZN", "Credit activity"),
  h("protect_the_customer", "Protect the Customer", "Insurance", "starter", "standard", "Insurance", "Policies", 25, "policies", "uncommon", "Broad", "Insurance usage"),
  h("brokerage_momentum", "Brokerage Momentum", "Trading", "starter", "standard", "Brokerage", "Active traders", 100, "traders", "uncommon", "AAPL,TSLA", "Active brokerage customer base"),
  h("volume_breakout", "Volume Breakout", "Trading", "starter", "hard", "Brokerage / Trading", "Trading volume", 100_000, "Cash volume", "rare", "TSLA,NVDA", "Volume objective"),
  h("research_signal", "Research Signal", "Research", "starter", "standard", "Research", "Research actions", 5, "actions", "uncommon", "NVDA,MSFT", "Research loop"),
  h("balanced_book", "Balanced Book", "Banking", "starter", "hard", "Bank / Savings", "Utilization band", 0.75, "target midpoint", "rare", "SPY,MSFT", "Reward healthy capacity"),
  h("customer_retention", "Customer Retention", "Customers", "starter", "hard", "Any", "Retention", 0.9, "retention", "rare", "Broad", "Quality > raw acquisition"),
  h("fund_launch", "Fund Launch", "Fund", "starter", "standard", "Fund", "AUM activity", 50_000, "Cash AUM", "uncommon", "SPY,AAPL", "Fund onboarding"),
  h("treasury_discipline", "Treasury Discipline", "Treasury", "starter", "standard", "Treasury / Vault", "Cash reserve ratio", 0.15, "reserve ratio", "uncommon", "SPY", "Liquidity management"),
  h("market_maker_pair", "Market Maker Pair", "Liquidity", "growing", "hard", "Exchange + Market Maker", "Liquidity activity", 250_000, "Cash volume", "rare", "COIN,TSLA", "Synergy-heavy mission"),
  h("fund_inflows", "Fund Inflows", "Fund", "growing", "hard", "Fund / Asset Mgmt", "Net inflows", 100_000, "Cash", "rare", "NVDA,MSFT", "Growth of managed capital"),
  h("investor_acquisition", "Investor Acquisition", "Customers", "growing", "standard", "Brokerage / Fund", "New investors", 250, "investors", "uncommon", "AAPL,AMZN", "Investor segment focus"),
  h("research_edge", "Research Edge", "Research", "growing", "hard", "Research Center", "Successful research actions", 8, "actions", "rare", "GOOGL,NVDA", "Better stock discovery"),
  h("data_throughput", "Data Throughput", "Infrastructure", "growing", "hard", "Data / Digital Finance", "Transactions processed", 5_000, "transactions", "rare", "GOOGL,META", "Infrastructure activity"),
  h("wealth_conversion", "Wealth Conversion", "Wealth", "growing", "hard", "Wealth Mgmt", "HNW conversions", 20, "customers", "rare", "AAPL,MSFT", "Customer journey progression"),
  h("diversified_revenue", "Diversified Revenue", "Strategy", "growing", "hard", "3+ business categories", "Revenue categories", 3, "categories", "rare", "Broad", "Discourages single-building meta"),
  h("no_bottlenecks", "No Bottlenecks", "Operations", "growing", "standard", "Any 3 businesses", "Capacity under 90%", 3, "businesses", "uncommon", "Broad", "Capacity discipline"),
  h("exchange_day", "Exchange Day", "Exchange", "established", "hard", "Securities Exchange", "Trading volume", 1_000_000, "Cash volume", "rare", "COIN,TSLA", "Large market activity"),
  h("institutional_flow", "Institutional Flow", "Institutional", "established", "elite", "Exchange / Investment Bank", "Institutional clients", 25, "clients", "epic", "MSFT,SPY", "Institutional gameplay"),
  h("corporate_mandate", "Corporate Mandate", "Investment Banking", "established", "hard", "Investment Bank", "Corporate actions", 3, "actions", "rare", "SPY,MSFT", "Corporate client activity"),
  h("risk_controlled_growth", "Risk-Controlled Growth", "Risk", "established", "elite", "Risk / Treasury / Bank", "Growth with risk below threshold", 1, "condition", "epic", "Broad", "Rewards smart growth"),
  h("liquidity_provider", "Liquidity Provider", "Liquidity", "established", "hard", "Market Maker", "Liquidity activity", 2_000_000, "Cash volume", "rare", "COIN", "Liquidity specialization"),
  h("private_client_week", "Private Client Week", "Wealth", "established", "elite", "Private Bank / Wealth", "HNW active customers", 100, "customers", "epic", "AAPL,MSFT", "High value clients"),
  h("portfolio_builder", "Portfolio Builder", "Portfolio", "established", "hard", "Fund / Brokerage", "Distinct stocks owned", 4, "tickers", "rare", "Broad", "Encourages collections"),
  h("tech_rally", "Tech Rally", "Event", "growing", "hard", "Research / Brokerage", "Tech activity", 1, "event objective", "rare", "NVDA,MSFT,GOOGL,META", "Event hunt"),
  h("earnings_window", "Earnings Window", "Event", "starter", "standard", "Brokerage / Research", "Event actions", 3, "actions", "uncommon", "Event ticker", "Triggered by earnings-style event"),
  h("volatility_desk", "Volatility Desk", "Event", "established", "elite", "Trading / Market Maker", "Volatility volume", 1, "event objective", "epic", "TSLA,COIN", "Higher-risk event"),
  h("regional_expansion", "Regional Expansion", "Growth", "established", "hard", "Regional institution", "New customers", 1_000, "customers", "rare", "Broad", "Late-stage acquisition"),
  h("global_session", "Global Session", "Trading", "elite", "elite", "Elite trading institution", "Trading volume", 10_000_000, "Cash volume", "epic", "COIN,NVDA", "Elite trading"),
  h("aum_milestone", "AUM Milestone", "Fund", "elite", "elite", "Elite asset manager", "AUM activity", 5_000_000, "Cash AUM", "epic", "SPY,MSFT", "Large fund scale"),
  h("institutional_reputation", "Institutional Reputation", "Reputation", "elite", "elite", "Any Elite institution", "Reputation", 90, "score", "epic", "Broad", "Prestige gate"),
  h("global_client_network", "Global Client Network", "Customers", "elite", "elite", "Global institution", "Active customers", 25_000, "customers", "epic", "Broad", "Scale objective"),
  h("tycoon_liquidity", "Tycoon Liquidity", "Liquidity", "tycoon", "jackpot", "World Exchange / Global Bank", "Liquidity volume", 50_000_000, "Cash volume", "legendary", "COIN,SPY", "Endgame hunt"),
  h("empire_efficiency", "Empire Efficiency", "Strategy", "tycoon", "elite", "Empire-wide", "Net margin", 0.35, "margin", "epic", "Broad", "Efficiency not just size"),
  h("diversified_empire", "Diversified Empire", "Strategy", "tycoon", "elite", "5+ business categories", "Active categories", 5, "categories", "epic", "Broad", "Endgame diversification"),
  h("global_fund_flow", "Global Fund Flow", "Fund", "tycoon", "jackpot", "Sovereign Fund / Asset Manager", "AUM activity", 25_000_000, "Cash AUM", "legendary", "SPY,NVDA", "Endgame capital hunt"),
  h("world_market_week", "World Market Week", "Event", "tycoon", "jackpot", "World Financial Exchange", "Event objective", 1, "condition", "legendary", "Broad", "Signature event hunt"),
];

export const MARKET_EVENT_RULES = [
  { id: "earnings_week", title: "Earnings Week", durationHours: 48, spawnMultiplier: 1.25, targetMultiplier: 1.1, customerDemand: 1.05, activityModifier: 1.1, rewardRarityShift: "+1 tier chance", stockBias: "Event company / tech", minStage: "starter" as MarketStage, frequency: "2–4 / month" },
  { id: "tech_rally", title: "Tech Rally", durationHours: 36, spawnMultiplier: 1.35, targetMultiplier: 1.2, customerDemand: 1.05, activityModifier: 1.15, rewardRarityShift: "Rare +8%", stockBias: "NVDA,MSFT,GOOGL,META", minStage: "growing" as MarketStage, frequency: "1–2 / month" },
  { id: "market_correction", title: "Market Correction", durationHours: 36, spawnMultiplier: 1.2, targetMultiplier: 1.15, customerDemand: 0.95, activityModifier: 1.2, rewardRarityShift: "Rare +5%", stockBias: "SPY,TSLA,COIN", minStage: "growing" as MarketStage, frequency: "1–2 / month" },
  { id: "rate_cut", title: "Rate Cut", durationHours: 48, spawnMultiplier: 1.2, targetMultiplier: 1.1, customerDemand: 1.1, activityModifier: 1.08, rewardRarityShift: "Uncommon +10%", stockBias: "SPY,MSFT", minStage: "starter" as MarketStage, frequency: "1 / month" },
  { id: "rate_hike", title: "Rate Hike", durationHours: 48, spawnMultiplier: 1.15, targetMultiplier: 1.15, customerDemand: 0.95, activityModifier: 1.05, rewardRarityShift: "Rare +5%", stockBias: "SPY", minStage: "starter" as MarketStage, frequency: "1 / month" },
  { id: "ipo_week", title: "IPO Week", durationHours: 72, spawnMultiplier: 1.3, targetMultiplier: 1.25, customerDemand: 1.1, activityModifier: 1.15, rewardRarityShift: "Epic +5%", stockBias: "Event basket", minStage: "established" as MarketStage, frequency: "1 / season" },
  { id: "liquidity_crunch", title: "Liquidity Crunch", durationHours: 36, spawnMultiplier: 1.25, targetMultiplier: 1.3, customerDemand: 0.9, activityModifier: 1.1, rewardRarityShift: "Epic +3%", stockBias: "COIN,SPY", minStage: "established" as MarketStage, frequency: "1 / season" },
  { id: "retail_trading_boom", title: "Retail Trading Boom", durationHours: 24, spawnMultiplier: 1.4, targetMultiplier: 1.15, customerDemand: 1.2, activityModifier: 1.2, rewardRarityShift: "Uncommon +15%", stockBias: "AAPL,TSLA,AMZN", minStage: "starter" as MarketStage, frequency: "1–2 / month" },
  { id: "institutional_flow", title: "Institutional Flow", durationHours: 48, spawnMultiplier: 1.25, targetMultiplier: 1.2, customerDemand: 1.1, activityModifier: 1.15, rewardRarityShift: "Rare +10%", stockBias: "SPY,MSFT", minStage: "established" as MarketStage, frequency: "1 / month" },
  { id: "ai_mania", title: "AI Mania", durationHours: 36, spawnMultiplier: 1.35, targetMultiplier: 1.25, customerDemand: 1.05, activityModifier: 1.2, rewardRarityShift: "Epic +5%", stockBias: "NVDA,MSFT,GOOGL", minStage: "growing" as MarketStage, frequency: "1 / month" },
  { id: "dividend_week", title: "Dividend Week", durationHours: 72, spawnMultiplier: 1.15, targetMultiplier: 1.05, customerDemand: 1.1, activityModifier: 1.05, rewardRarityShift: "Uncommon +10%", stockBias: "SPY,AAPL,MSFT", minStage: "starter" as MarketStage, frequency: "1 / season" },
  { id: "world_market_week", title: "World Market Week", durationHours: 72, spawnMultiplier: 1.5, targetMultiplier: 1.35, customerDemand: 1.15, activityModifier: 1.25, rewardRarityShift: "Legendary +3%", stockBias: "Broad", minStage: "tycoon" as MarketStage, frequency: "1 / season" },
] as const;

export type MarketEventRule = (typeof MARKET_EVENT_RULES)[number];

export function marketEventForDay(day: string, playerId: string): MarketEventRule {
  let seed = 2_654_435_761;
  const value = `${day}:${playerId}:market`;
  for (let i = 0; i < value.length; i++) {
    seed ^= value.charCodeAt(i);
    seed = Math.imul(seed, 16_777_619);
  }
  return MARKET_EVENT_RULES[(seed >>> 0) % MARKET_EVENT_RULES.length]!;
}

export function marketStageForRank(rank: number): MarketStage {
  return MARKET_STAGES[Math.min(MARKET_STAGES.length - 1, Math.max(0, rank))]!;
}

export function marketStageForEmpireLevel(level: number): MarketStage {
  const safeLevel = Math.max(1, Math.min(24, Math.floor(level)));
  return MARKET_STAGES.find((stage) => safeLevel >= STAGE_RULES[stage].empireLevels[0] && safeLevel <= STAGE_RULES[stage].empireLevels[1]) ?? "tycoon";
}

export function marketStageIndex(stage: MarketStage): number {
  return MARKET_STAGES.indexOf(stage);
}

export function stockOf(ticker: string): MarketStock {
  return MARKET_STOCKS.find((stock) => stock.ticker === ticker) ?? MARKET_STOCKS[0]!;
}

export function collectionProgress(portfolio: Record<string, number>) {
  return MARKET_COLLECTIONS.map((collection) => {
    const owned = collection.tickers.filter((ticker) => (portfolio[ticker] ?? 0) > 0).length;
    return { ...collection, owned, total: collection.tickers.length, complete: owned === collection.tickers.length };
  });
}

export function weightedChoice<T>(items: readonly T[], weights: readonly number[], seed: number): T {
  const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  if (total <= 0 || items.length === 0) throw new Error("Cannot choose from an empty weighted set");
  let cursor = (Math.abs(seed) % 1_000_000) / 1_000_000 * total;
  for (let i = 0; i < items.length; i++) {
    cursor -= Math.max(0, weights[i] ?? 0);
    if (cursor <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

/** Difficulty draw from the stage mix (canonical weights, deterministic seed). */
export function chooseDifficulty(stage: MarketStage, seed: number): HuntDifficulty {
  const rule = STAGE_RULES[stage];
  const entries = Object.entries(rule.difficultyMix) as [HuntDifficulty, number][];
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = ((seed % 1_000_000) / 1_000_000) * total;
  for (const [difficulty, weight] of entries) {
    cursor -= weight;
    if (cursor <= 0) return difficulty;
  }
  return "easy";
}

/**
 * Account-age rule (retention spec sheet 05): during the first 3 account days
 * only Easy / Standard hunts may be offered, regardless of the stage mix.
 */
export function chooseDifficultyForAccount(stage: MarketStage, seed: number, accountAgeDays: number): HuntDifficulty {
  const difficulty = chooseDifficulty(stage, seed);
  if (accountAgeDays < 3 && difficulty !== "easy" && difficulty !== "standard") return "standard";
  return difficulty;
}

export function chooseRarity(difficulty: HuntDifficulty, seed: number): RewardRarity {
  const rule = DIFFICULTY_RULES[difficulty];
  return weightedChoice(Object.keys(rule.rarityOdds) as RewardRarity[], Object.values(rule.rarityOdds), seed);
}

export function rewardUnitsMicros(ticker: string, rewardMinor: number): number {
  const price = stockOf(ticker).oraclePriceMinor;
  return rewardUnitsMicrosAtPrice(rewardMinor, price);
}

export function rewardUnitsMicrosAtPrice(rewardMinor: number, priceMinor: number): number {
  return Math.max(0, Math.round((rewardMinor / Math.max(1, priceMinor)) * 1_000_000));
}

export function collectionBonuses(portfolio: Record<string, number>) {
  const completed = new Set(MARKET_COLLECTIONS.filter((collection) => collection.tickers.every((ticker) => (portfolio[ticker] ?? 0) > 0)).map((collection) => collection.id));
  return {
    completed,
    researchSpawnBps: completed.has("mega_tech") ? 500 : 0,
    researchQualityBps: completed.has("ai_compute") ? 300 : 0,
    customerDemandBps: completed.has("consumer_digital") ? 300 : 0,
  };
}

export function isoWeek(now = new Date()): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
