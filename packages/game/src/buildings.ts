import { CASH_SCALE } from "./constants.ts";
import { buildingsUnlockedAtOrBelow } from "./progression.ts";
import v02Buildings from "./v02/buildings.json";
import v02Progression from "./v02/progression.json";

export type Era = "humble" | "starter" | "growing" | "established" | "elite" | "tycoon";
export type Lineage =
  | "bank"
  | "trade"
  | "broker"
  | "fund"
  | "research"
  | "lend"
  | "insure"
  | "vault"
  | "wealth"
  | "treasury"
  | "digital"
  | "exchange"
  | "ib"
  | "empire";

export type CardId = (typeof BUILDING_LIST)[number]["id"];

/**
 * Financial_Empire_Balancing_Model_v0.2 economics (v02/buildings.json, matched
 * to BUILDING_LIST order: BLD001..BLD050 = catalog order). The v0.1 customer
 * fields (lv1Capacity / grossCashPerHour / activityPtsPerHour / opCostBps /
 * attractionMult / baseMinorPerTick / customersBase) were retired with the
 * v0.1 customer simulation.
 */
export type CardSpec = {
  id: string;
  name: string;
  era: Era;
  lineage: Lineage;
  /** Display footprint only (one card per hex since the hex migration). */
  footprint: [number, number];
  placeCostMinor: number;
  /** Net Cash per day at stage 1 (v0.2 Building Economics). */
  baseNetPerDay: number;
  /** v0.2 category (drives placement affinities, v02/affinities.json). */
  category: string;
  /** v0.2 primary customer segment (display). */
  primarySegment: string;
  /**
   * Canonical v0.2 upgrade cost (minor units), derived per workbook:
   * stage 2 = 0.35 × baseNetPerDay × 5, stage 3 = 0.45 × baseNetPerDay × 8,
   * rounded to 2dp Cash then × CASH_SCALE.
   */
  upgradeCostMinor: (stage: 2 | 3) => number;
  /** Visit fee rate in bps, applied to the action's simulated notional. */
  rateBps: number;
  blurb: string;
  description: string;
  /** Previous building in this institution's progression line; informational only and never an unlock gate. */
  progressionFrom: string | null;
};

type V02Building = {
  id: string;
  name: string;
  rank: string;
  unlockLevel: number;
  category: string;
  baseNetPerDay: number;
  s2cost: number;
  s3cost: number;
  primarySegment: string;
};

const V02 = v02Buildings as V02Building[];

/**
 * Standing visit-fee rate per lineage (spec engine 3, bps on the action notional).
 * Exchanges undercut brokerages; funds charge a daily management fee; bank/lend
 * quote a loan spread. Lineages outside the visit action set rate 0.
 */
const LINEAGE_RATE_BPS: Record<Lineage, number> = {
  bank: 40,
  trade: 25,
  broker: 20,
  fund: 150,
  research: 0,
  lend: 60,
  insure: 0,
  vault: 0,
  wealth: 0,
  treasury: 0,
  digital: 0,
  exchange: 18,
  ib: 0,
  empire: 0,
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

let catalogIndex = 0;

function b(
  id: string,
  name: string,
  era: Era,
  lineage: Lineage,
  footprint: [number, number],
  cost: number,
  blurb: string,
  description: string,
  progressionFrom: string | null,
): CardSpec {
  const index = catalogIndex;
  catalogIndex += 1;
  const v02 = V02[index];
  if (!v02) throw new Error(`Missing v02/buildings.json entry for catalog index ${index} (${id})`);
  if (v02.name !== name) throw new Error(`v02/buildings.json order mismatch at index ${index}: ${v02.name} !== ${name}`);
  return {
    id,
    name,
    era,
    lineage,
    footprint,
    placeCostMinor: cost * CASH_SCALE,
    baseNetPerDay: v02.baseNetPerDay,
    category: v02.category,
    primarySegment: v02.primarySegment,
    upgradeCostMinor: (stage) =>
      Math.round((stage === 2 ? round2(0.35 * v02.baseNetPerDay * 5) : round2(0.45 * v02.baseNetPerDay * 8)) * CASH_SCALE),
    rateBps: LINEAGE_RATE_BPS[lineage],
    blurb,
    description,
    progressionFrom,
  };
}

export const BUILDING_LIST: CardSpec[] = [
  b("cash_kiosk", "Cash Kiosk", "humble", "bank", [1, 1], 300, "A stool and a cash box.", "The smallest way to take money in. One window, one line.", null),
  b("trading_booth", "Trading Booth", "humble", "trade", [1, 1], 370, "A folding table for tickets.", "Hand-written tickets. Volume is tiny. The start of a pit.", null),
  b("savings_stand", "Savings Stand", "humble", "bank", [1, 1], 460, "A jar with a ledger.", "Neighbors drop coins. You write names in a book.", null),
  b("mini_brokerage", "Mini Brokerage Desk", "humble", "broker", [1, 2], 560, "One desk, two chairs.", "You take a few retail orders and keep a paper blotter.", null),
  b("market_info", "Market Info Kiosk", "humble", "research", [1, 1], 60, "Prices on a chalkboard.", "A board of last prices. People stop, look, walk on.", null),
  b("micro_loan", "Micro Loan Booth", "humble", "lend", [1, 1], 85, "Small loans, cash in hand.", "Tiny loans, daily collection. High touch, small book.", null),
  b("fx_stand", "Currency Exchange Stand", "humble", "trade", [1, 2], 110, "A spread on the street.", "You buy and sell cash at a window. The spread is the living.", null),
  b("insurance_desk", "Insurance Desk", "humble", "insure", [1, 1], 75, "A pad of policies.", "Handwritten cover for a stall, a cart, a family.", null),
  b("advice_booth", "Investment Advice Booth", "humble", "wealth", [1, 1], 80, "Advice for a fee.", "You talk, they pay. No book yet, only a chair.", null),
  b("cash_locker", "Secure Cash Locker", "humble", "vault", [1, 1], 70, "A box with a lock.", "The first vault. It holds the float and little else.", null),

  b("neighborhood_shop", "Neighborhood Finance Shop", "starter", "bank", [2, 2], 400, "A real shopfront.", "The kiosk grew walls. Deposits and bills under one roof.", "cash_kiosk"),
  b("small_brokerage", "Small Brokerage Office", "starter", "broker", [2, 2], 450, "A two-room office.", "A blotter, a clerk, a phone. Orders leave the street.", "mini_brokerage"),
  b("local_savings", "Local Savings Office", "starter", "bank", [2, 2], 380, "Passbooks and a counter.", "The stand became an office. Regulars keep passbooks here.", "savings_stand"),
  b("microfinance", "Microfinance Office", "starter", "lend", [2, 2], 420, "A book of small loans.", "The booth hired a clerk. Loans are still small, now recorded.", "micro_loan"),
  b("trading_room", "Trading Room", "starter", "trade", [2, 2], 480, "Screens on a wall.", "The booth got a room. A handful of tickets at once.", "trading_booth"),
  b("small_research", "Small Research Office", "starter", "research", [1, 2], 320, "Two analysts, one printer.", "The chalkboard became a note. Hunt rewards tick up.", "market_info"),
  b("local_insurance", "Local Insurance Office", "starter", "insure", [2, 2], 400, "A filing cabinet of policies.", "Cover for a block, not a stall.", "insurance_desk"),
  b("treasury_office", "Treasury Office", "starter", "treasury", [2, 2], 360, "The Plot's till.", "Counts the district float. Neighbors run a little cleaner.", "cash_locker"),
  b("small_fund", "Small Fund Office", "starter", "fund", [2, 2], 500, "A first book.", "A tiny portfolio. Stock hunts start to matter.", "advice_booth"),
  b("services_hub", "Financial Services Hub", "starter", "digital", [2, 2], 460, "Many desks, one door.", "Kiosks under one roof. Foot traffic for the block.", null),

  b("community_bank", "Community Bank Branch", "growing", "bank", [2, 2], 900, "A branch with a vault room.", "Deposits, loans, a manager. The shop became a bank.", "neighborhood_shop"),
  b("brokerage_house", "Brokerage House", "growing", "broker", [2, 2], 950, "A house of tickets.", "Retail flow all day. Fragment drops improve.", "small_brokerage"),
  b("advisory_firm", "Investment Advisory Firm", "growing", "wealth", [2, 2], 880, "Retainers, not tips.", "Advice is a practice. Clients come back.", "advice_booth"),
  b("asset_office", "Asset Management Office", "growing", "fund", [2, 3], 1_100, "A proper book.", "AUM is still modest. The office has a door that closes.", "small_fund"),
  b("research_center", "Market Research Center", "growing", "research", [2, 2], 800, "A floor of notes.", "Hunt rewards and intel for neighbors.", "small_research"),
  b("lending_center", "Lending Center", "growing", "lend", [2, 2], 920, "A credit book.", "Loans at branch scale. Spreads pay the floor.", "microfinance"),
  b("wealth_office", "Wealth Management Office", "growing", "wealth", [2, 2], 1_000, "Fewer clients, more capital.", "The advisory firm kept the rich ones.", "advisory_firm"),
  b("digital_hub", "Digital Finance Hub", "growing", "digital", [2, 2], 860, "Apps on top of the shop.", "Volume without more counters.", "services_hub"),
  b("trading_house", "Trading House", "growing", "trade", [2, 3], 1_200, "A real pit.", "Fees rise with how busy the Plot is.", "trading_room"),
  b("private_vault", "Private Vault Facility", "growing", "vault", [2, 2], 700, "Steel, not a locker.", "Holds reserves. Boosts Cash across the board.", "cash_locker"),

  b("regional_bank", "Regional Bank", "established", "bank", [3, 3], 2_200, "A regional floor.", "Many branches' worth of deposits in one building.", "community_bank"),
  b("stock_brokerage", "Stock Brokerage Center", "established", "broker", [3, 2], 2_000, "Listed flow.", "A center, not a house. Fragment chance is high.", "brokerage_house"),
  b("fund_hq", "Investment Fund HQ", "established", "fund", [2, 3], 2_400, "Headquarters for the book.", "The office became an HQ. Hunts lean to stocks.", "asset_office"),
  b("insurance_hq", "Insurance Company HQ", "established", "insure", [3, 3], 2_100, "A balance sheet of policies.", "Premiums at company scale.", "local_insurance"),
  b("data_center", "Financial Data Center", "established", "research", [2, 3], 1_800, "Pipes, not pens.", "Does not print the most Cash. Neighbors trade better.", "research_center"),
  b("market_maker", "Market Maker Office", "established", "trade", [2, 3], 2_300, "Two-sided quotes.", "Spread and inventory. Wants an exchange beside it.", "trading_house"),
  b("private_bank", "Private Banking Center", "established", "wealth", [3, 2], 2_500, "Names on a card.", "Capital, not crowds.", "wealth_office"),
  b("corp_treasury", "Corporate Treasury Center", "established", "treasury", [2, 3], 1_900, "The Plot's capital desk.", "Efficiency for every vault and bank nearby.", "treasury_office"),
  b("securities_exchange", "Securities Exchange", "established", "exchange", [3, 3], 2_800, "A listed venue.", "Nine tiles. The board's first real exchange.", "trading_house"),
  b("investment_bank", "Investment Bank", "established", "ib", [3, 3], 2_600, "Deals, not deposits.", "Earns when hunts and events fire.", "advisory_firm"),

  b("global_brokerage", "Global Brokerage Tower", "elite", "broker", [3, 3], 4_500, "A tower of flow.", "Retail and institutions. Fragments are common.", "stock_brokerage"),
  b("major_am", "Major Asset Manager", "elite", "fund", [3, 3], 4_800, "A known book.", "AUM at elite scale.", "fund_hq"),
  b("inst_trading", "Institutional Trading Center", "elite", "trade", [3, 3], 5_000, "Block flow.", "The house now speaks in size.", "market_maker"),
  b("global_wealth", "Global Wealth Center", "elite", "wealth", [3, 3], 4_600, "Families, not accounts.", "The private bank went global.", "private_bank"),
  b("exchange_tower", "Financial Exchange Tower", "elite", "exchange", [3, 3], 5_200, "The Plot's exchange.", "Volume is the rent.", "securities_exchange"),

  b("intl_bank", "International Bank HQ", "tycoon", "bank", [4, 4], 9_000, "A headquarters.", "The kiosk's last form. Sixteen tiles.", "regional_bank"),
  b("global_ib", "Global Investment Bank", "tycoon", "ib", [4, 4], 9_500, "Deals at the top.", "The advisory booth's last form.", "investment_bank"),
  b("sovereign_fund", "Sovereign Fund Tower", "tycoon", "fund", [4, 4], 10_000, "A tower of AUM.", "The small fund's last form.", "major_am"),
  b("world_exchange", "World Financial Exchange", "tycoon", "exchange", [4, 4], 11_000, "The board's peak venue.", "The trading booth's last form.", "exchange_tower"),
  b("empire_hq", "Financial Empire Headquarters", "tycoon", "empire", [4, 4], 12_000, "The Plot, named.", "Not a shop. The whole empire under one roof.", "intl_bank"),
];

if (BUILDING_LIST.length !== V02.length) {
  throw new Error(`Catalog/v02 mismatch: BUILDING_LIST has ${BUILDING_LIST.length} entries, v02/buildings.json has ${V02.length}`);
}

export const CARDS: Record<string, CardSpec> = Object.fromEntries(BUILDING_LIST.map((x) => [x.id, x]));
export const CARD_ORDER = BUILDING_LIST.map((x) => x.id);

/**
 * Canonical building unlock level under the v0.2 cumulative schedule: building
 * catalog index i unlocks at the first level L where cumulativeBuildings(L) > i.
 */
// Local copy of the v0.2 cumulative unlock schedule (v02/progression.json) so
// no progression.ts import is needed at module-init time (progression.ts
// imports BUILDING_LIST; init-time const access would hit the TDZ cycle).
const V02_CUMULATIVE_BUILDINGS: readonly number[] = (v02Progression as { cumulativeBuildings: number }[]).map((row) => row.cumulativeBuildings);

export const CARD_UNLOCK_LEVEL: Record<string, number> = (() => {
  const levels: Record<string, number> = {};
  let cursor = 0;
  for (let level = 0; level < V02_CUMULATIVE_BUILDINGS.length && cursor < BUILDING_LIST.length; level++) {
    const target = V02_CUMULATIVE_BUILDINGS[level]!;
    while (cursor < target && cursor < BUILDING_LIST.length) {
      levels[BUILDING_LIST[cursor]!.id] = level + 1;
      cursor += 1;
    }
  }
  return levels;
})();

export const LEGACY_TYPE: Record<string, string> = {
  bank: "community_bank",
  exchange: "securities_exchange",
  fund: "small_fund",
  vault: "private_vault",
  brokerage: "brokerage_house",
  research: "small_research",
};

export const ERA_LABEL: Record<Era, string> = {
  humble: "Humble",
  starter: "Starter",
  growing: "Growing",
  established: "Established",
  elite: "Elite",
  tycoon: "Tycoon",
};

export const ERA_ORDER: Era[] = ["humble", "starter", "growing", "established", "elite", "tycoon"];

export function resolveType(id: string): string {
  return LEGACY_TYPE[id] ?? id;
}

export function buildingUnlockLevel(type: string): number | null {
  const id = resolveType(type);
  return CARD_UNLOCK_LEVEL[id] ?? null;
}

/**
 * v0.2 unlock rule: a building is available when the player's empire level has
 * it inside the cumulative unlock schedule (buildingsUnlockedAtOrBelow). The
 * legacy `placed` argument is kept for signature compatibility; unlocks are
 * level-based now, so callers should pass the empire level via levelOverride.
 */
export function isUnlocked(type: string, placed: { type: string; stage: number }[], levelOverride?: number): boolean {
  const spec = CARDS[resolveType(type)];
  if (!spec) return false;
  const unlockLevel = buildingUnlockLevel(spec.id);
  if (unlockLevel === null) return false;
  const empireLevel = levelOverride ?? Math.min(24, Math.max(1, placed.length)); // 24 = MAX_EMPIRE_LEVEL
  return buildingsUnlockedAtOrBelow(empireLevel).has(spec.id);
}

export function lineageColor(lineage: Lineage): string {
  const map: Record<Lineage, string> = {
    bank: "bank",
    trade: "exchange",
    broker: "brokerage",
    fund: "fund",
    research: "research",
    lend: "bank",
    insure: "research",
    vault: "vault",
    wealth: "fund",
    treasury: "vault",
    digital: "brokerage",
    exchange: "exchange",
    ib: "exchange",
    empire: "vault",
  };
  return map[lineage];
}
