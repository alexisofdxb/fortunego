import {
  MARKET_COLLECTIONS,
  MARKET_STOCKS,
  rewardUnitsMicros,
  type MarketCollection,
  type MarketStock,
  type RewardRarity,
} from "./market_phase3.ts";

export {
  DIFFICULTY_RULES,
  MARKET_COLLECTIONS,
  MARKET_EVENT_RULES,
  MARKET_HUNTS,
  MARKET_STAGE_LABEL,
  MARKET_STAGES,
  MARKET_STOCKS,
  REWARD_VALUES_MINOR,
  STAGE_RULES,
  chooseRarity,
  isoWeek,
  marketStageForRank,
  marketStageForEmpireLevel,
  marketStageIndex,
  marketEventForDay,
  rewardUnitsMicros,
  rewardUnitsMicrosAtPrice,
  collectionBonuses,
  stockOf,
  weightedChoice,
  type DifficultyRule,
  type HuntDifficulty,
  type MarketCollection,
  type MarketHuntTemplate,
  type MarketEventRule,
  type MarketStage,
  type MarketStock,
  type RewardRarity,
} from "./market_phase3.ts";

export const STOCKS = MARKET_STOCKS;
export const COLLECTIONS = MARKET_COLLECTIONS;
export type StockDef = MarketStock;
export type CollectionDef = MarketCollection;
export type StockRarity = RewardRarity;

export function fragmentUnitsBps(ticker: string): number {
  return rewardUnitsMicros(ticker, 10);
}

export function collectionProgress(portfolio: Record<string, number>) {
  return MARKET_COLLECTIONS.map((collection) => {
    const owned = collection.tickers.filter((ticker) => (portfolio[ticker] ?? 0) > 0).length;
    return { ...collection, owned, total: collection.tickers.length, complete: owned === collection.tickers.length };
  });
}
