// ---------------------------------------------------------------------------
// Land & placement model — Financial_Empire_Balancing_Model_v0.2.
// Hex attributes and placement modifiers from v02/hex_balance.json (keyed by
// mapLabel ↔ hex_layout.json id), category affinities from v02/affinities.json,
// bounds from v02/assumptions.json, acquisition schedule from v02/land_prices.json.
// ---------------------------------------------------------------------------

import hexBalance from "./v02/hex_balance.json";
import landPrices from "./v02/land_prices.json";
import affinities from "./v02/affinities.json";
import assumptions from "./v02/assumptions.json";
import { maxHexesForLevel } from "./progression.ts";

export type HexGrade = "Entry" | "Growth" | "Premium" | "Prime" | "Trophy";

export type HexAttribute = {
  parcelId: string;
  /** hex_layout.json hex id (canonical map label as string, "1".."35"). */
  hexId: string;
  ring: string;
  zone: string;
  commerce: number;
  footfall: number;
  road: number;
  prestige: number;
  capital: number;
  data: number;
  security: number;
  amenity: number;
  adjacency: number;
  lvi: number;
  grade: HexGrade;
  acquisitionMod: number;
  premiumMixMod: number;
  efficiencyMod: number;
  riskMod: number;
  /** Trophy rare gate (v0.2): empire level required to acquire this parcel. */
  rareRequiredLevel: number;
};

type V02HexBalance = Omit<HexAttribute, "hexId"> & { mapLabel: number };

type V02Affinity = {
  category: string;
  acquisitionSens: number;
  premiumSens: number;
  efficiencySens: number;
  riskSens: number;
};

type V02LandPrice = {
  order: number;
  parcelId: string;
  mapLabel: number;
  grade: HexGrade;
  method: "Starter Grant" | "Frontier Deed" | "Cash Purchase";
  requiredLevel: number;
  expectedNetAtUnlock: number;
  targetDays: number;
  locationMult: number;
  cost: number;
  effectiveDays: number;
};

export type LandPrice = {
  order: number;
  parcelId: string;
  /** hex_layout.json hex id. */
  hexId: string;
  method: "Starter Grant" | "Frontier Deed" | "Cash Purchase";
  requiredLevel: number;
  /** Cash cost (0 for grants/deeds). */
  cost: number;
  expectedNetAtUnlock: number;
  targetDays: number;
  grade: HexGrade;
};

const BALANCE_ROWS = (hexBalance as V02HexBalance[]).map((row) => {
  const { mapLabel, ...rest } = row;
  return { ...rest, hexId: String(mapLabel) } as HexAttribute;
});

const BALANCE_BY_HEX_ID = new Map(BALANCE_ROWS.map((row) => [row.hexId, row]));
const BALANCE_BY_PARCEL = new Map(BALANCE_ROWS.map((row) => [row.parcelId, row]));

const PRICE_ROWS = landPrices as V02LandPrice[];
const PRICE_BY_PARCEL = new Map(PRICE_ROWS.map((row) => [row.parcelId, row]));
const PRICE_BY_ORDER = [...PRICE_ROWS].sort((a, b) => a.order - b.order);

const AFFINITY_BY_CATEGORY = new Map((affinities as V02Affinity[]).map((row) => [row.category, row]));

export const PLACEMENT_FIT_MIN: number = assumptions["Min placement multiplier"];
export const PLACEMENT_FIT_MAX: number = assumptions["Max placement multiplier"];

// --- Hex attributes --------------------------------------------------------

/** Full v0.2 attribute row for a hex id ("1".."35"); undefined for unknown ids. */
export function hexAttribute(hexId: string): HexAttribute | undefined {
  return BALANCE_BY_HEX_ID.get(String(hexId));
}

export function parcelForHex(hexId: string): string | undefined {
  return BALANCE_BY_HEX_ID.get(String(hexId))?.parcelId;
}

export function hexForParcel(parcelId: string): string | undefined {
  return BALANCE_BY_PARCEL.get(parcelId)?.hexId;
}

/** LVI → grade thresholds (v0.2): Entry <55, Growth 55, Premium 65, Prime 75, Trophy 85. */
export function gradeFor(lvi: number): HexGrade {
  if (lvi >= 85) return "Trophy";
  if (lvi >= 75) return "Prime";
  if (lvi >= 65) return "Premium";
  if (lvi >= 55) return "Growth";
  return "Entry";
}

// --- Placement fit ----------------------------------------------------------

/**
 * v0.2 placement fit multiplier for a building category on a hex:
 *   clamp( Min, Max, 1 + acqSens×(acquisitionMod−1) + premiumSens×(premiumMixMod−1)
 *                    + effSens×(efficiencyMod−1) + riskSens×(riskMod−1) )
 * using the category's affinities row. Workbook example: Cash Kiosk (Retail
 * Finance) on D05 → 1.00232. Unknown category/hex → 1.
 */
export function placementFitMultiplier(category: string, hexId: string): number {
  const affinity = AFFINITY_BY_CATEGORY.get(category);
  const attr = hexAttribute(hexId);
  if (!affinity || !attr) return 1;
  const raw = 1
    + affinity.acquisitionSens * (attr.acquisitionMod - 1)
    + affinity.premiumSens * (attr.premiumMixMod - 1)
    + affinity.efficiencySens * (attr.efficiencyMod - 1)
    + affinity.riskSens * (attr.riskMod - 1);
  // 5dp: reproduces the workbook's displayed fit exactly (kiosk on D05 → 1.00232).
  const rounded = Math.round(raw * 100_000) / 100_000;
  return Math.min(PLACEMENT_FIT_MAX, Math.max(PLACEMENT_FIT_MIN, rounded));
}

// --- Land acquisition -------------------------------------------------------

/** Parcel price/schedule row (v02/land_prices.json). */
export function landPrice(parcelId: string): LandPrice | undefined {
  const row = PRICE_BY_PARCEL.get(parcelId);
  const attr = BALANCE_BY_PARCEL.get(parcelId);
  if (!row) return undefined;
  return {
    order: row.order,
    parcelId: row.parcelId,
    hexId: attr?.hexId ?? String(row.mapLabel),
    method: row.method,
    requiredLevel: row.requiredLevel,
    cost: row.cost,
    expectedNetAtUnlock: row.expectedNetAtUnlock,
    targetDays: row.targetDays,
    grade: row.grade,
  };
}

/** The 35 parcels in canonical acquisition order (order 1..35). */
export const LAND_ACQUISITION_ORDER: readonly string[] = Object.freeze(PRICE_BY_ORDER.map((row) => row.parcelId));

/** Hex id of the order-1 starter parcel (D05). The first acquisition must be this hex. */
export const STARTER_HEX_ID: string = String(PRICE_BY_ORDER[0]!.mapLabel);

/**
 * Unowned hexes the player may claim at `level`. After the starter grant,
 * requiredLevel (and capacity, checked in canAcquire) is the lock — the
 * painted map does not force a hop through a higher-level parcel to reach
 * a deed you already qualify for (e.g. D03 at Lv 3 vs C08 at Lv 4).
 */
export function frontierHexIds(ownedIds: Iterable<string>, level = 1): string[] {
  const owned = new Set([...ownedIds].map(String));
  if (owned.size === 0) return [];
  const frontier: string[] = [];
  for (const attr of BALANCE_ROWS) {
    if (owned.has(attr.hexId)) continue;
    const price = PRICE_BY_PARCEL.get(attr.parcelId);
    const required = Math.max(price?.requiredLevel ?? 1, attr.rareRequiredLevel);
    if (level >= required) frontier.push(attr.hexId);
  }
  return frontier.sort((a, b) => Number(a) - Number(b));
}

export type AcquireCheck = { ok: boolean; reason: string | null };

/**
 * v0.2 acquisition rules for `hexId` at `level` with `ownedCount` owned hexes:
 *  - capacity: maxHexesForLevel(level) ≥ ownedCount + 1
 *  - level: max(landPrice.requiredLevel, hexBalance rareRequiredLevel) ≤ level
 *  - starter: the very first acquisition (ownedCount === 0) must be the
 *    order-1 starter parcel (D05)
 *  - after the starter grant, any parcel whose requiredLevel is met is
 *    claimable (capacity still applies). Adjacency is not required: the
 *    painted district puts same-ring deeds on opposite sides of the map.
 */
export function canAcquire(level: number, ownedCount: number, ownedIds: Iterable<string>, hexId: string): AcquireCheck {
  const attr = hexAttribute(hexId);
  if (!attr) return { ok: false, reason: "unknown_hex" };
  if (maxHexesForLevel(level) < ownedCount + 1) return { ok: false, reason: "capacity" };
  const price = PRICE_BY_PARCEL.get(attr.parcelId);
  const requiredLevel = Math.max(price?.requiredLevel ?? 1, attr.rareRequiredLevel);
  if (level < requiredLevel) return { ok: false, reason: "level" };
  if (ownedCount === 0) {
    return hexId === STARTER_HEX_ID
      ? { ok: true, reason: null }
      : { ok: false, reason: "starter_parcel" };
  }
  return { ok: true, reason: null };
}
