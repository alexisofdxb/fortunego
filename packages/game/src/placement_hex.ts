// ---------------------------------------------------------------------------
// Hex placement engine — REPLACES the square engine (former placement.ts).
// Same exported name (resolvePlacement) and the same PlacementResolution
// shape, so the settlement economy consumes it unchanged.
//
// Semantics (hex-only):
//   links         — lineage pairs from the legacy SYNERGIES table (formerly in
//                   settle_phase2.ts) that sit on adjacent hexes (hex distance 1)
//   effects       — link bonusBps → operatingBps, link riskReliefBps →
//                   riskReliefBps, with the square engine's rank weighting
//                   (factor 1 / 0.75 / 0.5 / 0.25, ≤4 links per card,
//                   maxLinks per rule); congestion penalties and district
//                   bonuses fold into effects exactly like the square version
//   districts     — connected components of occupied hexes with size ≥ 3
//   penalties     — congestion from occupied-neighbor pressure (≥4 neighbors →
//                   customer_congestion, ≥6 → transaction_congestion, same bps
//                   magnitudes as the square engine)
//   special tiles — none (empty arrays)
// ---------------------------------------------------------------------------

import { BUILDING_LIST, CARDS, type Lineage } from "./buildings.ts";
import { HEX_UNLOCK_BY_STAGE, hexDistance, hexNeighbors, unlockedHexIds, type HexStage } from "./hex.ts";
import { marketStageForEmpireLevel } from "./market_phase3.ts";
import type { PlacedCard } from "./index.ts";

export type PlacementFamily =
  | "banking"
  | "brokerage"
  | "exchange"
  | "fund"
  | "insurance"
  | "research"
  | "treasury"
  | "wealth"
  | "market_maker"
  | "investment_banking"
  | "financial_services";

export type PlacementEffect = {
  activityBps: number;
  capacityBps: number;
  customerBps: number;
  operatingBps: number;
  riskReliefBps: number;
  riskIncreaseBps: number;
  huntSpawnBps: number;
  huntQualityBps: number;
  eventProgressBps: number;
  reputationBps: number;
};

export type PlacementLink = {
  id: number;
  rule: string;
  a: string;
  b: string;
  linkType: "direct" | "support";
  distance: number;
  factor: number;
  bonusBps: number;
};

export type PlacementPenalty = {
  kind: "duplicate_family" | "duplicate_building" | "customer_congestion" | "transaction_congestion" | "liquidity_concentration" | "prestige_crowding";
  cardIds: string[];
  bps: number;
  message: string;
};

export type DistrictBonus = {
  id: string;
  name: string;
  activityBps: number;
  capacityBps: number;
  customerBps: number;
  operatingBps: number;
  riskReliefBps: number;
  reputationBps: number;
};

export type SpecialTileType = "standard" | "growth" | "market" | "treasury" | "research" | "event" | "premium";

export type PlacementResolution = {
  effects: PlacementEffect;
  links: PlacementLink[];
  directLinks: number;
  supportLinks: number;
  penalties: PlacementPenalty[];
  districts: DistrictBonus[];
  specialTiles: { cardId: string; tiles: SpecialTileType[]; coverageBps: number }[];
  score: {
    synergyCoverage: number;
    infrastructureCoverage: number;
    congestionHealth: number;
    spaceEfficiency: number;
    diversification: number;
    placementScore: number;
  };
};

// --- Synergy rules (legacy settle_phase2.ts SYNERGIES table, hex-adapted) ---

type SynergyRule = {
  id: number;
  rule: string;
  left: { lineage: Lineage; ids?: string[] };
  right: { lineage: Lineage; ids?: string[] };
  bonusBps: number;
  riskReliefBps: number;
};

export const PLACEMENT_SYNERGIES: readonly SynergyRule[] = [
  { id: 1, rule: "exchange+market_maker", left: { lineage: "exchange" }, right: { lineage: "trade", ids: ["market_maker"] }, bonusBps: 1_400, riskReliefBps: 180 },
  { id: 2, rule: "broker+exchange", left: { lineage: "broker" }, right: { lineage: "exchange" }, bonusBps: 900, riskReliefBps: 80 },
  { id: 3, rule: "fund+research_center", left: { lineage: "fund" }, right: { lineage: "research", ids: ["research_center"] }, bonusBps: 800, riskReliefBps: 100 },
  { id: 4, rule: "bank+insure", left: { lineage: "bank" }, right: { lineage: "insure" }, bonusBps: 700, riskReliefBps: 300 },
  { id: 5, rule: "vault+treasury", left: { lineage: "vault" }, right: { lineage: "treasury" }, bonusBps: 700, riskReliefBps: 220 },
  { id: 6, rule: "data_center+exchange", left: { lineage: "research", ids: ["data_center"] }, right: { lineage: "exchange" }, bonusBps: 600, riskReliefBps: 80 },
  { id: 7, rule: "wealth_office+private_bank", left: { lineage: "wealth", ids: ["wealth_office"] }, right: { lineage: "wealth", ids: ["private_bank"] }, bonusBps: 900, riskReliefBps: 120 },
  { id: 8, rule: "ib+corp_treasury", left: { lineage: "ib" }, right: { lineage: "treasury", ids: ["corp_treasury"] }, bonusBps: 800, riskReliefBps: 120 },
  // Tutorial pair carried over from the square engine (rule id 31): keeps the
  // onboarding_first_synergy milestone (onboarding.service checks this exact
  // rule string) firing for the Cash Kiosk + Savings Stand adjacency.
  { id: 9, rule: "cash_kiosk+savings_stand", left: { lineage: "bank", ids: ["cash_kiosk"] }, right: { lineage: "bank", ids: ["savings_stand"] }, bonusBps: 600, riskReliefBps: 0 },
];

export const PLACEMENT_SYNERGY_RULE_COUNT = PLACEMENT_SYNERGIES.length;

// The square engine capped a card at 4 links with rank weighting 1/.75/.5/.25.
const LINK_FACTORS = [1, 0.75, 0.5, 0.25] as const;
const MAX_LINKS_PER_CARD = 4;

const FAMILY_BY_LINEAGE: Partial<Record<Lineage, PlacementFamily>> = {
  bank: "banking", lend: "banking", broker: "brokerage", trade: "exchange", exchange: "exchange",
  fund: "fund", insure: "insurance", research: "research", digital: "financial_services",
  treasury: "treasury", vault: "treasury", wealth: "wealth", ib: "investment_banking",
};

export function buildingFamily(type: string): PlacementFamily {
  if (type === "market_maker" || type === "institutional_trading_center") return "market_maker";
  return FAMILY_BY_LINEAGE[CARDS[type]?.lineage] ?? "financial_services";
}

function specOf(type: string) {
  const spec = CARDS[type];
  if (!spec) throw new Error(`Unknown building ${type}`);
  return spec;
}

function matches(card: PlacedCard, side: SynergyRule["left"]): boolean {
  const spec = specOf(card.type);
  return spec.lineage === side.lineage && (!side.ids || side.ids.includes(card.type));
}

function emptyEffect(): PlacementEffect {
  return { activityBps: 0, capacityBps: 0, customerBps: 0, operatingBps: 0, riskReliefBps: 0, riskIncreaseBps: 0, huntSpawnBps: 0, huntQualityBps: 0, eventProgressBps: 0, reputationBps: 0 };
}

/** Empire level derived from the board itself (same formula as empireLevel()). */
function levelOf(cards: readonly PlacedCard[]): number {
  return Math.max(1, Math.min(50, cards.reduce((sum, card) => sum + 1 + card.stage - 1, 0)));
}

function unlockedCountFor(cards: readonly PlacedCard[]): number {
  const stage = marketStageForEmpireLevel(levelOf(cards)) as HexStage;
  return HEX_UNLOCK_BY_STAGE[stage] ?? HEX_UNLOCK_BY_STAGE.humble;
}

/** Connected components of occupied hexes (via hex adjacency) with size ≥ 3. */
function districtBonuses(cards: readonly PlacedCard[]): DistrictBonus[] {
  const occupied = new Set(cards.map((card) => card.hexId));
  const seen = new Set<string>();
  const components: string[][] = [];
  for (const card of cards) {
    if (seen.has(card.hexId)) continue;
    const component: string[] = [];
    const queue = [card.hexId];
    seen.add(card.hexId);
    while (queue.length) {
      const id = queue.pop()!;
      component.push(id);
      for (const neighbor of hexNeighbors(id)) {
        if (occupied.has(neighbor) && !seen.has(neighbor)) {
          seen.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    components.push(component);
  }
  return components
    .filter((component) => component.length >= 3)
    .map((component, index) => ({
      id: `district_${index + 1}`,
      name: `District ${index + 1}`,
      activityBps: 0,
      capacityBps: 0,
      customerBps: 0,
      operatingBps: 400,
      riskReliefBps: 0,
      reputationBps: 200,
    }));
}

function penaltiesFor(cards: readonly PlacedCard[]): PlacementPenalty[] {
  const penalties: PlacementPenalty[] = [];
  const occupiedByHex = new Map(cards.map((card) => [card.hexId, card]));
  for (const card of cards) {
    const neighbors = hexNeighbors(card.hexId).filter((id) => occupiedByHex.has(id));
    if (neighbors.length >= 6) {
      penalties.push({
        kind: "transaction_congestion",
        cardIds: [card.id, ...neighbors.map((id) => occupiedByHex.get(id)!.id)],
        bps: Math.min(2_000, (neighbors.length - 5) * 500),
        message: "Transaction load exceeds the local hex infrastructure.",
      });
    } else if (neighbors.length >= 4) {
      penalties.push({
        kind: "customer_congestion",
        cardIds: [card.id, ...neighbors.map((id) => occupiedByHex.get(id)!.id)],
        bps: Math.min(1_200, (neighbors.length - 3) * 300),
        message: "Customer-facing buildings are congested.",
      });
    }
  }
  return penalties;
}

export function resolvePlacement(cards: readonly PlacedCard[]): PlacementResolution {
  const effects = emptyEffect();

  // --- Links: legacy SYNERGIES pairs sitting on adjacent hexes -------------
  const candidates: PlacementLink[] = [];
  let adjacentPairs = 0;
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const a = cards[i]!;
      const b = cards[j]!;
      const distance = hexDistance(a.hexId, b.hexId);
      if (distance !== 1) continue;
      adjacentPairs += 1;
      for (const rule of PLACEMENT_SYNERGIES) {
        const matchesRule = (matches(a, rule.left) && matches(b, rule.right)) || (matches(a, rule.right) && matches(b, rule.left));
        if (matchesRule) {
          candidates.push({ id: rule.id, rule: rule.rule, a: a.id, b: b.id, linkType: "direct", distance, factor: 1, bonusBps: rule.bonusBps + rule.riskReliefBps });
        }
      }
    }
  }
  // Square-engine selection weighting: strongest first, ≤4 links per card,
  // each rule contributes at most one link per card of the pair.
  candidates.sort((a, b) => b.bonusBps - a.bonusBps || a.id - b.id);
  const counts = new Map<string, number>();
  const ruleCounts = new Map<string, number>();
  const links: PlacementLink[] = [];
  for (const link of candidates) {
    if ((counts.get(link.a) ?? 0) >= MAX_LINKS_PER_CARD || (counts.get(link.b) ?? 0) >= MAX_LINKS_PER_CARD) continue;
    if ((ruleCounts.get(`${link.a}:${link.id}`) ?? 0) >= 1 || (ruleCounts.get(`${link.b}:${link.id}`) ?? 0) >= 1) continue;
    const rank = Math.max(counts.get(link.a) ?? 0, counts.get(link.b) ?? 0);
    const factor = LINK_FACTORS[Math.min(3, rank)]!;
    link.factor = factor;
    const rule = PLACEMENT_SYNERGIES.find((candidate) => candidate.id === link.id)!;
    links.push(link);
    counts.set(link.a, (counts.get(link.a) ?? 0) + 1);
    counts.set(link.b, (counts.get(link.b) ?? 0) + 1);
    ruleCounts.set(`${link.a}:${link.id}`, (ruleCounts.get(`${link.a}:${link.id}`) ?? 0) + 1);
    ruleCounts.set(`${link.b}:${link.id}`, (ruleCounts.get(`${link.b}:${link.id}`) ?? 0) + 1);
    effects.operatingBps += Math.round(rule.bonusBps * factor);
    effects.riskReliefBps += Math.round(rule.riskReliefBps * factor);
  }

  // --- Penalties & districts (folded into effects like the square engine) ---
  const penalties = penaltiesFor(cards);
  for (const penalty of penalties) effects.operatingBps -= penalty.bps;
  const districts = districtBonuses(cards);
  for (const district of districts) {
    effects.operatingBps += district.operatingBps;
    effects.reputationBps += district.reputationBps;
  }

  const specialTiles: PlacementResolution["specialTiles"] = cards.map((card) => ({ cardId: card.id, tiles: [], coverageBps: 0 }));
  const unlocked = Math.max(1, unlockedCountFor(cards));
  const occupied = cards.length;
  const fill = occupied / unlocked;
  const congestionBps = penalties.reduce((sum, penalty) => sum + penalty.bps, 0);
  const lineages = new Set(cards.map((card) => specOf(card.type).lineage));
  const score = {
    synergyCoverage: adjacentPairs > 0 ? (links.length / adjacentPairs) * 100 : 0,
    infrastructureCoverage: 1,
    congestionHealth: Math.max(0, 100 - congestionBps / 20),
    spaceEfficiency: (occupied / unlocked) * 100,
    diversification: (lineages.size / 5) * 100,
    placementScore: 0,
  };
  score.placementScore = Math.min(100, links.length * 12 + fill * 40);
  return {
    effects,
    links,
    directLinks: links.length,
    supportLinks: 0,
    penalties,
    districts,
    specialTiles,
    score: { ...score, placementScore: Number(score.placementScore.toFixed(2)) },
  };
}

export const PLACEMENT_BUILDING_COUNT = BUILDING_LIST.length;
