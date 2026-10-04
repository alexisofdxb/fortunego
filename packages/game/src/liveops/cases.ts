export const LIVEOPS_LOOT_TABLE_VERSION = "v1.0";

export type LiveopsCaseId = "daily" | "business" | "market" | "event" | "executive" | "tycoon";

export type LiveopsLootKind = "cash" | "item" | "boost" | "module" | "jackpot";

export type LiveopsLootEntry = {
  id: string;
  weight: number;
  kind: LiveopsLootKind;
  rarePlus?: boolean;
  itemId?: string;
  minQty: number;
  maxQty: number;
  /** Cash range in whole dollars (converted with CASH_SCALE at grant time). */
  cashMin?: number;
  cashMax?: number;
  moduleRarity?: "rare" | "epic" | "legendary";
  legendary?: boolean;
};

export type LiveopsCaseDef = {
  id: LiveopsCaseId;
  name: string;
  blurb: string;
  access: "daily_free" | "key";
  keyItemId?: string;
  pityRarePlusEvery?: number;
  pityLegendaryEvery?: number;
  loot: readonly LiveopsLootEntry[];
};

export const LIVEOPS_BOOST_POOL = ["maturation_booster", "customer_campaign", "efficiency_voucher"] as const;

export const LIVEOPS_CASES: readonly LiveopsCaseDef[] = [
  {
    id: "daily",
    name: "Daily Case",
    blurb: "One free open each UTC day.",
    access: "daily_free",
    loot: [
      { id: "daily_cash", weight: 45, kind: "cash", minQty: 1, maxQty: 1, cashMin: 500, cashMax: 2_500 },
      { id: "daily_shards", weight: 25, kind: "item", itemId: "module_shard", minQty: 5, maxQty: 15 },
      { id: "daily_ticket", weight: 12, kind: "item", itemId: "market_hunt_ticket", minQty: 1, maxQty: 1 },
      { id: "daily_boost", weight: 10, kind: "boost", minQty: 1, maxQty: 1 },
      { id: "daily_component", weight: 7, kind: "item", itemId: "precision_component", minQty: 1, maxQty: 2 },
      { id: "daily_jackpot", weight: 1, kind: "jackpot", minQty: 1, maxQty: 1, cashMin: 8_000, cashMax: 20_000, moduleRarity: "rare" },
    ],
  },
  {
    id: "business",
    name: "Business Case",
    blurb: "Earned with a Business Key.",
    access: "key",
    keyItemId: "business_key",
    pityRarePlusEvery: 12,
    loot: [
      { id: "biz_cash", weight: 30, kind: "cash", minQty: 1, maxQty: 1, cashMin: 1_500, cashMax: 7_500 },
      { id: "biz_shards", weight: 30, kind: "item", itemId: "module_shard", minQty: 10, maxQty: 40 },
      { id: "biz_boost", weight: 15, kind: "item", itemId: "maturation_booster", minQty: 1, maxQty: 2 },
      { id: "biz_component", weight: 15, kind: "item", itemId: "precision_component", minQty: 1, maxQty: 3 },
      { id: "biz_rare", weight: 8, kind: "module", minQty: 1, maxQty: 1, moduleRarity: "rare", rarePlus: true },
      { id: "biz_epic", weight: 2, kind: "module", minQty: 1, maxQty: 1, moduleRarity: "epic", rarePlus: true },
    ],
  },
  {
    id: "market",
    name: "Market Case",
    blurb: "Earned with a Market Key.",
    access: "key",
    keyItemId: "market_key",
    pityRarePlusEvery: 12,
    loot: [
      { id: "mkt_frag", weight: 35, kind: "item", itemId: "stock_fragment", minQty: 1, maxQty: 4 },
      { id: "mkt_ticket", weight: 20, kind: "item", itemId: "market_hunt_ticket", minQty: 1, maxQty: 2 },
      { id: "mkt_cash", weight: 20, kind: "cash", minQty: 1, maxQty: 1, cashMin: 1_000, cashMax: 5_000 },
      { id: "mkt_reroll", weight: 12, kind: "item", itemId: "opportunity_reroll", minQty: 1, maxQty: 2 },
      { id: "mkt_boost", weight: 10, kind: "item", itemId: "efficiency_voucher", minQty: 1, maxQty: 1 },
      { id: "mkt_epic", weight: 3, kind: "module", minQty: 1, maxQty: 1, moduleRarity: "rare", rarePlus: true },
    ],
  },
  {
    id: "event",
    name: "Event Case",
    blurb: "Seasonal table. Opens with an Event Key.",
    access: "key",
    keyItemId: "event_key",
    pityRarePlusEvery: 20,
    loot: [
      { id: "evt_shards", weight: 30, kind: "item", itemId: "module_shard", minQty: 12, maxQty: 30 },
      { id: "evt_cosmetic", weight: 20, kind: "item", itemId: "city_cosmetic_token", minQty: 1, maxQty: 1 },
      { id: "evt_cash", weight: 20, kind: "cash", minQty: 1, maxQty: 1, cashMin: 2_000, cashMax: 8_000 },
      { id: "evt_ticket", weight: 12, kind: "item", itemId: "market_hunt_ticket", minQty: 1, maxQty: 2 },
      { id: "evt_component", weight: 10, kind: "item", itemId: "precision_component", minQty: 1, maxQty: 2 },
      { id: "evt_epic", weight: 8, kind: "module", minQty: 1, maxQty: 1, moduleRarity: "epic", rarePlus: true },
    ],
  },
  {
    id: "executive",
    name: "Executive Case",
    blurb: "High-tier earned case. Pity Epic+ at 20.",
    access: "key",
    keyItemId: "executive_key",
    pityRarePlusEvery: 20,
    loot: [
      { id: "ex_rare", weight: 40, kind: "module", minQty: 1, maxQty: 1, moduleRarity: "rare", rarePlus: true },
      { id: "ex_epic", weight: 20, kind: "module", minQty: 1, maxQty: 1, moduleRarity: "epic", rarePlus: true },
      { id: "ex_leg", weight: 3, kind: "module", minQty: 1, maxQty: 1, moduleRarity: "legendary", rarePlus: true, legendary: true },
      { id: "ex_comp", weight: 15, kind: "item", itemId: "executive_component", minQty: 1, maxQty: 3 },
      { id: "ex_permit", weight: 7, kind: "item", itemId: "prime_permit", minQty: 1, maxQty: 1 },
      { id: "ex_cash", weight: 10, kind: "cash", minQty: 1, maxQty: 1, cashMin: 10_000, cashMax: 30_000 },
      { id: "ex_cosmetic", weight: 5, kind: "item", itemId: "city_cosmetic_token", minQty: 1, maxQty: 1 },
    ],
  },
  {
    id: "tycoon",
    name: "Tycoon Case",
    blurb: "Endgame case. Pity Legendary at 30.",
    access: "key",
    keyItemId: "tycoon_key",
    pityLegendaryEvery: 30,
    loot: [
      { id: "ty_epic", weight: 45, kind: "module", minQty: 1, maxQty: 1, moduleRarity: "epic", rarePlus: true },
      { id: "ty_leg", weight: 10, kind: "module", minQty: 1, maxQty: 1, moduleRarity: "legendary", rarePlus: true, legendary: true },
      { id: "ty_comp", weight: 20, kind: "item", itemId: "executive_component", minQty: 2, maxQty: 5 },
      { id: "ty_permit", weight: 10, kind: "item", itemId: "prime_permit", minQty: 1, maxQty: 2 },
      { id: "ty_cosmetic", weight: 10, kind: "item", itemId: "city_cosmetic_token", minQty: 1, maxQty: 1 },
      { id: "ty_jackpot", weight: 5, kind: "jackpot", minQty: 1, maxQty: 1, cashMin: 50_000, cashMax: 100_000, moduleRarity: "legendary" },
    ],
  },
];

const BY_ID = new Map(LIVEOPS_CASES.map((entry) => [entry.id, entry]));

export function liveopsCase(id: string): LiveopsCaseDef | undefined {
  return BY_ID.get(id as LiveopsCaseId);
}

export function liveopsLootTotal(entries: readonly LiveopsLootEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.weight, 0);
}

/** `roll` is in [0, total). */
export function pickLiveopsLoot(entries: readonly LiveopsLootEntry[], roll: number): LiveopsLootEntry {
  let cursor = 0;
  const total = liveopsLootTotal(entries);
  const n = ((roll % total) + total) % total;
  for (const entry of entries) {
    cursor += entry.weight;
    if (n < cursor) return entry;
  }
  return entries[entries.length - 1]!;
}

export function liveopsPityForceEntry(def: LiveopsCaseDef): LiveopsLootEntry | undefined {
  const legendary = def.loot.filter((entry) => entry.legendary);
  if (def.pityLegendaryEvery && legendary.length) return legendary.at(-1);
  const rarePlus = def.loot.filter((entry) => entry.rarePlus);
  return rarePlus.at(-1) ?? rarePlus[0];
}
