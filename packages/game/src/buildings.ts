import { CASH_SCALE } from "./constants.ts";

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

export type CardSpec = {
  id: string;
  name: string;
  era: Era;
  lineage: Lineage;
  footprint: [number, number];
  placeCostMinor: number;
  baseMinorPerTick: number;
  customersBase: number;
  /** Visit fee rate in bps, applied to the action's simulated notional. */
  rateBps: number;
  blurb: string;
  description: string;
  /** Previous building in this institution's progression line; informational only and never an unlock gate. */
  progressionFrom: string | null;
};

const C = CASH_SCALE;

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

function b(
  id: string,
  name: string,
  era: Era,
  lineage: Lineage,
  footprint: [number, number],
  cost: number,
  tick: number,
  customers: number,
  blurb: string,
  description: string,
  progressionFrom: string | null,
): CardSpec {
  return {
    id,
    name,
    era,
    lineage,
    footprint,
    placeCostMinor: cost * C,
    baseMinorPerTick: tick * C,
    customersBase: customers,
    rateBps: LINEAGE_RATE_BPS[lineage],
    blurb,
    description,
    progressionFrom,
  };
}

export const BUILDING_LIST: CardSpec[] = [
  b("cash_kiosk", "Cash Kiosk", "humble", "bank", [1, 1], 300, 6, 40, "A stool and a cash box.", "The smallest way to take money in. One window, one line.", null),
  b("trading_booth", "Trading Booth", "humble", "trade", [1, 1], 370, 7, 25, "A folding table for tickets.", "Hand-written tickets. Volume is tiny. The start of a pit.", null),
  b("savings_stand", "Savings Stand", "humble", "bank", [1, 1], 460, 5, 35, "A jar with a ledger.", "Neighbors drop coins. You write names in a book.", null),
  b("mini_brokerage", "Mini Brokerage Desk", "humble", "broker", [1, 2], 560, 8, 20, "One desk, two chairs.", "You take a few retail orders and keep a paper blotter.", null),
  b("market_info", "Market Info Kiosk", "humble", "research", [1, 1], 60, 4, 18, "Prices on a chalkboard.", "A board of last prices. People stop, look, walk on.", null),
  b("micro_loan", "Micro Loan Booth", "humble", "lend", [1, 1], 85, 7, 22, "Small loans, cash in hand.", "Tiny loans, daily collection. High touch, small book.", null),
  b("fx_stand", "Currency Exchange Stand", "humble", "trade", [1, 2], 110, 8, 28, "A spread on the street.", "You buy and sell cash at a window. The spread is the living.", null),
  b("insurance_desk", "Insurance Desk", "humble", "insure", [1, 1], 75, 5, 16, "A pad of policies.", "Handwritten cover for a stall, a cart, a family.", null),
  b("advice_booth", "Investment Advice Booth", "humble", "wealth", [1, 1], 80, 5, 12, "Advice for a fee.", "You talk, they pay. No book yet, only a chair.", null),
  b("cash_locker", "Secure Cash Locker", "humble", "vault", [1, 1], 70, 3, 8, "A box with a lock.", "The first vault. It holds the float and little else.", null),

  b("neighborhood_shop", "Neighborhood Finance Shop", "starter", "bank", [2, 2], 400, 18, 90, "A real shopfront.", "The kiosk grew walls. Deposits and bills under one roof.", "cash_kiosk"),
  b("small_brokerage", "Small Brokerage Office", "starter", "broker", [2, 2], 450, 20, 50, "A two-room office.", "A blotter, a clerk, a phone. Orders leave the street.", "mini_brokerage"),
  b("local_savings", "Local Savings Office", "starter", "bank", [2, 2], 380, 16, 80, "Passbooks and a counter.", "The stand became an office. Regulars keep passbooks here.", "savings_stand"),
  b("microfinance", "Microfinance Office", "starter", "lend", [2, 2], 420, 19, 55, "A book of small loans.", "The booth hired a clerk. Loans are still small, now recorded.", "micro_loan"),
  b("trading_room", "Trading Room", "starter", "trade", [2, 2], 480, 22, 45, "Screens on a wall.", "The booth got a room. A handful of tickets at once.", "trading_booth"),
  b("small_research", "Small Research Office", "starter", "research", [1, 2], 320, 12, 22, "Two analysts, one printer.", "The chalkboard became a note. Hunt rewards tick up.", "market_info"),
  b("local_insurance", "Local Insurance Office", "starter", "insure", [2, 2], 400, 15, 40, "A filing cabinet of policies.", "Cover for a block, not a stall.", "insurance_desk"),
  b("treasury_office", "Treasury Office", "starter", "treasury", [2, 2], 360, 11, 15, "The Plot's till.", "Counts the district float. Neighbors run a little cleaner.", "cash_locker"),
  b("small_fund", "Small Fund Office", "starter", "fund", [2, 2], 500, 21, 30, "A first book.", "A tiny portfolio. Stock hunts start to matter.", "advice_booth"),
  b("services_hub", "Financial Services Hub", "starter", "digital", [2, 2], 460, 18, 70, "Many desks, one door.", "Kiosks under one roof. Foot traffic for the block.", null),

  b("community_bank", "Community Bank Branch", "growing", "bank", [2, 2], 900, 40, 180, "A branch with a vault room.", "Deposits, loans, a manager. The shop became a bank.", "neighborhood_shop"),
  b("brokerage_house", "Brokerage House", "growing", "broker", [2, 2], 950, 36, 90, "A house of tickets.", "Retail flow all day. Fragment drops improve.", "small_brokerage"),
  b("advisory_firm", "Investment Advisory Firm", "growing", "wealth", [2, 2], 880, 32, 50, "Retainers, not tips.", "Advice is a practice. Clients come back.", "advice_booth"),
  b("asset_office", "Asset Management Office", "growing", "fund", [2, 3], 1_100, 42, 55, "A proper book.", "AUM is still modest. The office has a door that closes.", "small_fund"),
  b("research_center", "Market Research Center", "growing", "research", [2, 2], 800, 24, 35, "A floor of notes.", "Hunt rewards and intel for neighbors.", "small_research"),
  b("lending_center", "Lending Center", "growing", "lend", [2, 2], 920, 38, 100, "A credit book.", "Loans at branch scale. Spreads pay the floor.", "microfinance"),
  b("wealth_office", "Wealth Management Office", "growing", "wealth", [2, 2], 1_000, 34, 28, "Fewer clients, more capital.", "The advisory firm kept the rich ones.", "advisory_firm"),
  b("digital_hub", "Digital Finance Hub", "growing", "digital", [2, 2], 860, 30, 120, "Apps on top of the shop.", "Volume without more counters.", "services_hub"),
  b("trading_house", "Trading House", "growing", "trade", [2, 3], 1_200, 48, 80, "A real pit.", "Fees rise with how busy the Plot is.", "trading_room"),
  b("private_vault", "Private Vault Facility", "growing", "vault", [2, 2], 700, 14, 12, "Steel, not a locker.", "Holds reserves. Boosts Cash across the board.", "cash_locker"),

  b("regional_bank", "Regional Bank", "established", "bank", [3, 3], 2_200, 90, 420, "A regional floor.", "Many branches' worth of deposits in one building.", "community_bank"),
  b("stock_brokerage", "Stock Brokerage Center", "established", "broker", [3, 2], 2_000, 78, 160, "Listed flow.", "A center, not a house. Fragment chance is high.", "brokerage_house"),
  b("fund_hq", "Investment Fund HQ", "established", "fund", [2, 3], 2_400, 88, 90, "Headquarters for the book.", "The office became an HQ. Hunts lean to stocks.", "asset_office"),
  b("insurance_hq", "Insurance Company HQ", "established", "insure", [3, 3], 2_100, 70, 140, "A balance sheet of policies.", "Premiums at company scale.", "local_insurance"),
  b("data_center", "Financial Data Center", "established", "research", [2, 3], 1_800, 40, 25, "Pipes, not pens.", "Does not print the most Cash. Neighbors trade better.", "research_center"),
  b("market_maker", "Market Maker Office", "established", "trade", [2, 3], 2_300, 82, 60, "Two-sided quotes.", "Spread and inventory. Wants an exchange beside it.", "trading_house"),
  b("private_bank", "Private Banking Center", "established", "wealth", [3, 2], 2_500, 76, 40, "Names on a card.", "Capital, not crowds.", "wealth_office"),
  b("corp_treasury", "Corporate Treasury Center", "established", "treasury", [2, 3], 1_900, 36, 20, "The Plot's capital desk.", "Efficiency for every vault and bank nearby.", "treasury_office"),
  b("securities_exchange", "Securities Exchange", "established", "exchange", [3, 3], 2_800, 110, 200, "A listed venue.", "Nine tiles. The board's first real exchange.", "trading_house"),
  b("investment_bank", "Investment Bank", "established", "ib", [3, 3], 2_600, 95, 70, "Deals, not deposits.", "Earns when hunts and events fire.", "advisory_firm"),

  b("global_brokerage", "Global Brokerage Tower", "elite", "broker", [3, 3], 4_500, 160, 280, "A tower of flow.", "Retail and institutions. Fragments are common.", "stock_brokerage"),
  b("major_am", "Major Asset Manager", "elite", "fund", [3, 3], 4_800, 170, 140, "A known book.", "AUM at elite scale.", "fund_hq"),
  b("inst_trading", "Institutional Trading Center", "elite", "trade", [3, 3], 5_000, 185, 120, "Block flow.", "The house now speaks in size.", "market_maker"),
  b("global_wealth", "Global Wealth Center", "elite", "wealth", [3, 3], 4_600, 155, 55, "Families, not accounts.", "The private bank went global.", "private_bank"),
  b("exchange_tower", "Financial Exchange Tower", "elite", "exchange", [3, 3], 5_200, 200, 320, "The Plot's exchange.", "Volume is the rent.", "securities_exchange"),

  b("intl_bank", "International Bank HQ", "tycoon", "bank", [4, 4], 9_000, 280, 800, "A headquarters.", "The kiosk's last form. Sixteen tiles.", "regional_bank"),
  b("global_ib", "Global Investment Bank", "tycoon", "ib", [4, 4], 9_500, 300, 160, "Deals at the top.", "The advisory booth's last form.", "investment_bank"),
  b("sovereign_fund", "Sovereign Fund Tower", "tycoon", "fund", [4, 4], 10_000, 310, 200, "A tower of AUM.", "The small fund's last form.", "major_am"),
  b("world_exchange", "World Financial Exchange", "tycoon", "exchange", [4, 4], 11_000, 340, 600, "The board's peak venue.", "The trading booth's last form.", "exchange_tower"),
  b("empire_hq", "Financial Empire Headquarters", "tycoon", "empire", [4, 4], 12_000, 400, 500, "The Plot, named.", "Not a shop. The whole empire under one roof.", "intl_bank"),
];

export const CARDS: Record<string, CardSpec> = Object.fromEntries(BUILDING_LIST.map((x) => [x.id, x]));
export const CARD_ORDER = BUILDING_LIST.map((x) => x.id);
/** Canonical Building Card unlock level: one catalog entry per Empire Level. */
export const CARD_UNLOCK_LEVEL: Record<string, number> = Object.fromEntries(
  CARD_ORDER.map((id, index) => [id, index + 1]),
);

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

export function isUnlocked(type: string, placed: { type: string; stage: number }[], levelOverride?: number): boolean {
  const spec = CARDS[resolveType(type)];
  if (!spec) return false;
  const unlockLevel = buildingUnlockLevel(spec.id);
  if (unlockLevel === null) return false;
  const empireLevel = levelOverride ?? Math.max(
    1,
    Math.min(
      BUILDING_LIST.length,
      placed.reduce((sum, card) => sum + Math.max(1, Math.floor(card.stage || 1)), 0),
    ),
  );
  return empireLevel >= unlockLevel;
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
