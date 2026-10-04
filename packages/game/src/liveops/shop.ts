import { CASH_SCALE } from "../constants.ts";
import { liveopsSeasonAt } from "./pass.ts";

/** Workbook Assumptions: reference $PLOT price and pack reprice threshold. */
export const LIVEOPS_PLOT_REF_USD = 0.015;
export const LIVEOPS_REPRICE_THRESHOLD = 0.05;
export const LIVEOPS_QUOTE_TTL_MS = 15 * 60 * 1000;
export const LIVEOPS_PASS_USD = 9.99;
export const LIVEOPS_FAUCET_PLOT = 2_000;

export type LiveopsPackLimit = "account" | "season" | "day";

export type LiveopsPackContent =
  | { kind: "cash"; cashMinor: number; label: string }
  | { kind: "item"; itemId: string; quantity: number; label: string }
  | { kind: "module"; rarity: "rare" | "epic"; quantity: number; label: string };

export type LiveopsPack = {
  id: string;
  name: string;
  blurb: string;
  usd: number;
  payment: "plot" | "cash";
  cashMinor?: number;
  limit: { kind: LiveopsPackLimit; count: number };
  contents: readonly LiveopsPackContent[];
};

const cash = (dollars: number): LiveopsPackContent => ({
  kind: "cash",
  cashMinor: Math.round(dollars * CASH_SCALE),
  label: `$${dollars.toLocaleString()} Cash`,
});

const item = (itemId: string, quantity: number, label: string): LiveopsPackContent => ({
  kind: "item",
  itemId,
  quantity,
  label,
});

const moduleGrant = (rarity: "rare" | "epic", quantity: number, label: string): LiveopsPackContent => ({
  kind: "module",
  rarity,
  quantity,
  label,
});

export const LIVEOPS_PACKS: readonly LiveopsPack[] = [
  {
    id: "starter_expansion",
    name: "Starter Expansion Pack",
    blurb: "Early convenience, not a permanent advantage.",
    usd: 4.99,
    payment: "plot",
    limit: { kind: "account", count: 1 },
    contents: [
      cash(10_000),
      item("market_hunt_ticket", 2, "2 Market Hunt Tickets"),
      item("module_shard", 15, "15 Module Shards"),
      item("maturation_booster", 1, "1 minor boost"),
    ],
  },
  {
    id: "investor",
    name: "Investor Pack",
    blurb: "Broad utility for a growing city.",
    usd: 9.99,
    payment: "plot",
    limit: { kind: "season", count: 2 },
    contents: [
      cash(30_000),
      item("market_hunt_ticket", 4, "4 Market Hunt Tickets"),
      moduleGrant("rare", 1, "1 Rare Module"),
      item("opportunity_reroll", 2, "2 Opportunity Rerolls"),
    ],
  },
  {
    id: "executive_pack",
    name: "Executive Pack",
    blurb: "Progression plus a cosmetic.",
    usd: 19.99,
    payment: "plot",
    limit: { kind: "season", count: 2 },
    contents: [
      cash(75_000),
      moduleGrant("rare", 1, "1 Rare Module"),
      item("precision_component", 2, "2 Precision Components"),
      item("maturation_booster", 4, "4 boosts"),
      item("city_cosmetic_token", 1, "Cosmetic token"),
    ],
  },
  {
    id: "tycoon_pack",
    name: "Tycoon Pack",
    blurb: "High-value deterministic bundle.",
    usd: 49.99,
    payment: "plot",
    limit: { kind: "season", count: 1 },
    contents: [
      cash(175_000),
      moduleGrant("epic", 1, "1 Epic Module"),
      moduleGrant("rare", 2, "2 Rare Modules"),
      item("prime_permit", 1, "Prime Permit"),
      item("city_cosmetic_token", 1, "Exclusive cosmetic"),
    ],
  },
  {
    id: "season_launch",
    name: "Season Launch Pack",
    blurb: "Season kickoff bundle.",
    usd: 14.99,
    payment: "plot",
    limit: { kind: "season", count: 1 },
    contents: [
      item("city_cosmetic_token", 1, "Season cosmetic"),
      item("event_key", 3, "3 Event Keys"),
      item("module_shard", 30, "30 Module Shards"),
      item("market_hunt_ticket", 3, "3 Market Hunt Tickets"),
    ],
  },
  {
    id: "daily_ticket",
    name: "Hunt Ticket",
    blurb: "Soft-currency daily utility.",
    usd: 0.5,
    payment: "cash",
    cashMinor: 50 * CASH_SCALE,
    limit: { kind: "day", count: 3 },
    contents: [item("market_hunt_ticket", 1, "1 Market Hunt Ticket")],
  },
  {
    id: "reroll_bundle",
    name: "Reroll Bundle",
    blurb: "Two opportunity rerolls. Does not bypass the catalog.",
    usd: 0.75,
    payment: "plot",
    limit: { kind: "day", count: 3 },
    contents: [item("opportunity_reroll", 2, "2 Opportunity Rerolls")],
  },
  {
    id: "cosmetic_feature",
    name: "City Cosmetic",
    blurb: "Visual only. No economic power.",
    usd: 1.2,
    payment: "plot",
    limit: { kind: "season", count: 5 },
    contents: [item("city_cosmetic_token", 1, "City Cosmetic Token")],
  },
];

const BY_ID = new Map(LIVEOPS_PACKS.map((pack) => [pack.id, pack]));

export function liveopsPack(id: string): LiveopsPack | undefined {
  return BY_ID.get(id);
}

export function liveopsPlotPriceFromUsd(usd: number, refUsd = LIVEOPS_PLOT_REF_USD): number {
  return Math.max(1, Math.round(usd / refUsd));
}

export const LIVEOPS_PASS_PLOT = liveopsPlotPriceFromUsd(LIVEOPS_PASS_USD);

export function liveopsQuoteWindow(now = Date.now()): { issuedAt: number; expiresAt: number } {
  return { issuedAt: now, expiresAt: now + LIVEOPS_QUOTE_TTL_MS };
}

export function liveopsShouldReprice(quotedRef: number, liveRef = LIVEOPS_PLOT_REF_USD): boolean {
  if (quotedRef <= 0) return true;
  return Math.abs(liveRef - quotedRef) / quotedRef >= LIVEOPS_REPRICE_THRESHOLD;
}

export type LiveopsShopSlot = {
  id: string;
  label: string;
  rotation: "daily" | "weekly" | "always";
  sku: string;
};

export function liveopsShopSlots(now = Date.now()): LiveopsShopSlot[] {
  const season = liveopsSeasonAt(now);
  const featured = season.index % 2 === 0 ? "season_launch" : "investor";
  return [
    { id: "featured", label: "Featured Pack", rotation: "weekly", sku: featured },
    { id: "daily_utility", label: "Daily Utility", rotation: "daily", sku: "daily_ticket" },
    { id: "premium_utility", label: "Premium Utility", rotation: "daily", sku: "reroll_bundle" },
    { id: "cosmetic", label: "Cosmetic Feature", rotation: "weekly", sku: "cosmetic_feature" },
    { id: "starter", label: "Starter", rotation: "always", sku: "starter_expansion" },
    { id: "executive", label: "Executive", rotation: "always", sku: "executive_pack" },
    { id: "tycoon", label: "Tycoon", rotation: "always", sku: "tycoon_pack" },
  ];
}

export function liveopsPurchasePeriod(limit: LiveopsPackLimit, now = Date.now()): string {
  if (limit === "account") return "account";
  if (limit === "day") return new Date(now).toISOString().slice(0, 10);
  return liveopsSeasonAt(now).id;
}
