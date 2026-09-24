import { BUILDING_LIST, CARDS, type CardSpec, type Lineage } from "./buildings.ts";

export type Orientation = 0 | 90 | 180 | 270;
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

export type PlacementCard = {
  id: string;
  type: string;
  x: number;
  y: number;
  stage: 1 | 2 | 3;
  orientation?: Orientation;
  placedAt?: number;
  operationalUntil?: number;
};

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

type SynergyRule = {
  id: number;
  left: PlacementFamily | "cash_kiosk" | "savings_stand" | "regional_bank" | "private_bank" | "securities_exchange" | "financial_data_center" | "financial_exchange_tower" | "institutional_trading_center" | "sovereign_fund_tower" | "financial_empire_headquarters";
  right: SynergyRule["left"];
  linkType: "direct" | "support";
  primary: keyof PlacementEffect;
  primaryBps: number;
  secondary: keyof PlacementEffect;
  secondaryBps: number;
  maxLinks: number;
  radius: number;
  minLevel: number;
  huntSpawnBps?: number;
  huntQualityBps?: number;
  riskReliefBps?: number;
};

const pct = (value: number) => Math.round(value * 10_000);

const SYNERGY_RULES: readonly SynergyRule[] = [
  { id: 1, left: "brokerage", right: "exchange", linkType: "direct", primary: "activityBps", primaryBps: pct(0.08), secondary: "capacityBps", secondaryBps: pct(0.05), maxLinks: 2, radius: 0, minLevel: 1, huntSpawnBps: 500 },
  { id: 2, left: "exchange", right: "market_maker", linkType: "direct", primary: "activityBps", primaryBps: pct(0.10), secondary: "capacityBps", secondaryBps: pct(0.08), maxLinks: 2, radius: 0, minLevel: 21, huntSpawnBps: 800 },
  { id: 3, left: "exchange", right: "research", linkType: "support", primary: "capacityBps", primaryBps: pct(0.10), secondary: "operatingBps", secondaryBps: pct(0.04), maxLinks: 2, radius: 2, minLevel: 11, huntQualityBps: 300 },
  { id: 4, left: "brokerage", right: "research", linkType: "support", primary: "customerBps", primaryBps: pct(0.05), secondary: "activityBps", secondaryBps: pct(0.04), maxLinks: 2, radius: 2, minLevel: 11, huntSpawnBps: 600 },
  { id: 5, left: "fund", right: "research", linkType: "support", primary: "operatingBps", primaryBps: pct(0.08), secondary: "activityBps", secondaryBps: pct(0.05), maxLinks: 2, radius: 2, minLevel: 11, huntQualityBps: 500 },
  { id: 6, left: "fund", right: "treasury", linkType: "support", primary: "operatingBps", primaryBps: pct(0.07), secondary: "riskReliefBps", secondaryBps: pct(0.06), maxLinks: 2, radius: 2, minLevel: 11 },
  { id: 7, left: "fund", right: "wealth", linkType: "direct", primary: "activityBps", primaryBps: pct(0.07), secondary: "customerBps", secondaryBps: pct(0.05), maxLinks: 2, radius: 0, minLevel: 21, huntSpawnBps: 400 },
  { id: 8, left: "banking", right: "treasury", linkType: "support", primary: "capacityBps", primaryBps: pct(0.09), secondary: "operatingBps", secondaryBps: pct(0.05), maxLinks: 2, radius: 2, minLevel: 1, riskReliefBps: pct(0.07) },
  { id: 9, left: "banking", right: "insurance", linkType: "direct", primary: "customerBps", primaryBps: pct(0.06), secondary: "operatingBps", secondaryBps: pct(0.04), maxLinks: 2, radius: 0, minLevel: 1, riskReliefBps: pct(0.05) },
  { id: 10, left: "banking", right: "wealth", linkType: "direct", primary: "customerBps", primaryBps: pct(0.07), secondary: "operatingBps", secondaryBps: pct(0.04), maxLinks: 2, radius: 0, minLevel: 21, huntSpawnBps: 400 },
  { id: 11, left: "banking", right: "financial_services", linkType: "support", primary: "customerBps", primaryBps: pct(0.04), secondary: "operatingBps", secondaryBps: pct(0.04), maxLinks: 2, radius: 2, minLevel: 1 },
  { id: 12, left: "insurance", right: "treasury", linkType: "support", primary: "operatingBps", primaryBps: pct(0.07), secondary: "riskReliefBps", secondaryBps: pct(0.04), maxLinks: 2, radius: 2, minLevel: 11 },
  { id: 13, left: "insurance", right: "wealth", linkType: "direct", primary: "customerBps", primaryBps: pct(0.04), secondary: "operatingBps", secondaryBps: pct(0.04), maxLinks: 1, radius: 0, minLevel: 21 },
  { id: 14, left: "investment_banking", right: "treasury", linkType: "support", primary: "customerBps", primaryBps: pct(0.07), secondary: "operatingBps", secondaryBps: pct(0.05), maxLinks: 2, radius: 2, minLevel: 31, huntSpawnBps: 500 },
  { id: 15, left: "investment_banking", right: "research", linkType: "support", primary: "operatingBps", primaryBps: pct(0.06), secondary: "activityBps", secondaryBps: pct(0.05), maxLinks: 2, radius: 2, minLevel: 31, huntQualityBps: 500 },
  { id: 16, left: "investment_banking", right: "exchange", linkType: "direct", primary: "activityBps", primaryBps: pct(0.06), secondary: "capacityBps", secondaryBps: pct(0.07), maxLinks: 2, radius: 0, minLevel: 31, huntSpawnBps: 600 },
  { id: 17, left: "investment_banking", right: "wealth", linkType: "direct", primary: "customerBps", primaryBps: pct(0.05), secondary: "customerBps", secondaryBps: pct(0.04), maxLinks: 1, radius: 0, minLevel: 31 },
  { id: 18, left: "market_maker", right: "treasury", linkType: "support", primary: "riskReliefBps", primaryBps: pct(0.08), secondary: "operatingBps", secondaryBps: pct(0.05), maxLinks: 2, radius: 2, minLevel: 21, huntQualityBps: 400 },
  { id: 19, left: "market_maker", right: "research", linkType: "support", primary: "operatingBps", primaryBps: pct(0.07), secondary: "capacityBps", secondaryBps: pct(0.05), maxLinks: 2, radius: 2, minLevel: 21, huntQualityBps: 400 },
  { id: 20, left: "financial_services", right: "wealth", linkType: "direct", primary: "customerBps", primaryBps: pct(0.05), secondary: "operatingBps", secondaryBps: pct(0.04), maxLinks: 2, radius: 0, minLevel: 11 },
  { id: 21, left: "financial_services", right: "fund", linkType: "support", primary: "customerBps", primaryBps: pct(0.04), secondary: "activityBps", secondaryBps: pct(0.03), maxLinks: 2, radius: 2, minLevel: 11, huntSpawnBps: 300 },
  { id: 22, left: "research", right: "treasury", linkType: "support", primary: "operatingBps", primaryBps: pct(0.04), secondary: "riskReliefBps", secondaryBps: pct(0.04), maxLinks: 2, radius: 2, minLevel: 21 },
  { id: 23, left: "regional_bank", right: "investment_banking", linkType: "direct", primary: "customerBps", primaryBps: pct(0.06), secondary: "activityBps", secondaryBps: pct(0.05), maxLinks: 1, radius: 0, minLevel: 31, huntSpawnBps: 400 },
  { id: 24, left: "private_bank", right: "fund", linkType: "direct", primary: "customerBps", primaryBps: pct(0.08), secondary: "activityBps", secondaryBps: pct(0.06), maxLinks: 2, radius: 0, minLevel: 31, huntSpawnBps: 500 },
  { id: 25, left: "securities_exchange", right: "financial_data_center", linkType: "support", primary: "capacityBps", primaryBps: pct(0.12), secondary: "operatingBps", secondaryBps: pct(0.05), maxLinks: 1, radius: 2, minLevel: 31, huntQualityBps: 500, },
  { id: 26, left: "financial_exchange_tower", right: "institutional_trading_center", linkType: "direct", primary: "activityBps", primaryBps: pct(0.09), secondary: "capacityBps", secondaryBps: pct(0.06), maxLinks: 1, radius: 0, minLevel: 41, huntSpawnBps: 600 },
  { id: 27, left: "sovereign_fund_tower", right: "research", linkType: "support", primary: "operatingBps", primaryBps: pct(0.08), secondary: "riskReliefBps", secondaryBps: pct(0.05), maxLinks: 1, radius: 2, minLevel: 46, huntQualityBps: 500 },
  { id: 28, left: "financial_empire_headquarters", right: "financial_services", linkType: "support", primary: "operatingBps", primaryBps: pct(0.04), secondary: "customerBps", secondaryBps: pct(0.04), maxLinks: 1, radius: 2, minLevel: 46, huntSpawnBps: 300 },
  { id: 29, left: "financial_empire_headquarters", right: "treasury", linkType: "support", primary: "operatingBps", primaryBps: pct(0.05), secondary: "riskReliefBps", secondaryBps: pct(0.04), maxLinks: 1, radius: 2, minLevel: 46 },
  { id: 30, left: "financial_empire_headquarters", right: "research", linkType: "support", primary: "operatingBps", primaryBps: pct(0.05), secondary: "eventProgressBps", secondaryBps: pct(0.04), maxLinks: 1, radius: 2, minLevel: 46, huntQualityBps: 300 },
  { id: 31, left: "cash_kiosk", right: "savings_stand", linkType: "direct", primary: "customerBps", primaryBps: pct(0.03), secondary: "customerBps", secondaryBps: pct(0.03), maxLinks: 1, radius: 0, minLevel: 1 },
];

const FAMILY_BY_LINEAGE: Partial<Record<Lineage, PlacementFamily>> = {
  bank: "banking", lend: "banking", broker: "brokerage", trade: "exchange", exchange: "exchange",
  fund: "fund", insure: "insurance", research: "research", digital: "financial_services",
  treasury: "treasury", vault: "treasury", wealth: "wealth", ib: "investment_banking",
};

export function buildingFamily(type: string): PlacementFamily {
  if (type === "market_maker" || type === "institutional_trading_center") return "market_maker";
  return FAMILY_BY_LINEAGE[CARDS[type]?.lineage] ?? "financial_services";
}

function specOf(type: string): CardSpec {
  const spec = CARDS[type];
  if (!spec) throw new Error(`Unknown building ${type}`);
  return spec;
}

export function orientedFootprint(type: string, orientation: Orientation = 0): [number, number] {
  const footprint = specOf(type).footprint;
  return orientation === 90 || orientation === 270 ? [footprint[1], footprint[0]] : footprint;
}

function cells(card: PlacementCard): [number, number][] {
  const [width, height] = orientedFootprint(card.type, card.orientation ?? 0);
  return Array.from({ length: width * height }, (_, index) => [card.x + index % width, card.y + Math.floor(index / width)] as [number, number]);
}

export function edgeDistance(a: PlacementCard, b: PlacementCard): number {
  const [aw, ah] = orientedFootprint(a.type, a.orientation ?? 0);
  const [bw, bh] = orientedFootprint(b.type, b.orientation ?? 0);
  const dx = a.x + aw <= b.x ? b.x - (a.x + aw) : b.x + bw <= a.x ? a.x - (b.x + bw) : 0;
  const dy = a.y + ah <= b.y ? b.y - (a.y + ah) : b.y + bh <= a.y ? a.y - (b.y + bh) : 0;
  return dx + dy;
}

export function directAdjacent(a: PlacementCard, b: PlacementCard): boolean {
  const [aw, ah] = orientedFootprint(a.type, a.orientation ?? 0);
  const [bw, bh] = orientedFootprint(b.type, b.orientation ?? 0);
  const horizontal = (a.x + aw === b.x || b.x + bw === a.x) && a.y < b.y + bh && a.y + ah > b.y;
  const vertical = (a.y + ah === b.y || b.y + bh === a.y) && a.x < b.x + bw && a.x + aw > b.x;
  return horizontal || vertical;
}

export function fitsPlacement(cards: PlacementCard[], type: string, x: number, y: number, orientation: Orientation = 0, ignoreId?: string, boardSize = 12): boolean {
  const [width, height] = orientedFootprint(type, orientation);
  if (x < 0 || y < 0 || x + width > boardSize || y + height > boardSize) return false;
  const occupied = new Set<string>();
  for (const card of cards) {
    if (card.id !== ignoreId) for (const [cx, cy] of cells(card)) occupied.add(`${cx}:${cy}`);
  }
  for (let dy = 0; dy < height; dy++) for (let dx = 0; dx < width; dx++) if (occupied.has(`${x + dx}:${y + dy}`)) return false;
  return true;
}

const SPECIAL_COORDS: Record<Exclude<SpecialTileType, "standard">, [number, number][]> = {
  growth: [[1, 1], [4, 4], [7, 7], [10, 10]],
  market: [[1, 10], [4, 7], [7, 4], [10, 1]],
  treasury: [[2, 5], [5, 2], [8, 9], [11, 6]],
  research: [[2, 2], [5, 8], [8, 5], [11, 11]],
  event: [[2, 9], [5, 5], [8, 2], [11, 8]],
  premium: [[3, 3], [3, 8], [6, 6], [9, 9]],
};

export function specialTileAt(x: number, y: number): SpecialTileType {
  for (const [type, points] of Object.entries(SPECIAL_COORDS) as [Exclude<SpecialTileType, "standard">, [number, number][]][]) if (points.some(([px, py]) => px === x && py === y)) return type;
  return "standard";
}

function eligibleForTile(type: SpecialTileType, family: PlacementFamily): boolean {
  if (type === "growth") return ["banking", "brokerage", "financial_services", "wealth"].includes(family);
  if (type === "market") return ["brokerage", "exchange", "market_maker"].includes(family);
  if (type === "treasury") return ["banking", "fund", "treasury", "insurance"].includes(family);
  if (type === "research") return ["research", "fund", "brokerage"].includes(family);
  return true;
}

function specialForCard(card: PlacementCard) {
  const covered = cells(card).map(([x, y]) => specialTileAt(x, y));
  const family = buildingFamily(card.type);
  const eligible = covered.filter((tile) => tile !== "standard" && eligibleForTile(tile, family));
  return { covered, eligible, coverageBps: Math.round(eligible.length * 10_000 / Math.max(1, covered.length)) };
}

function levelOf(cards: PlacementCard[]): number {
  return Math.max(1, Math.min(50, cards.reduce((sum, card) => sum + 1 + card.stage - 1, 0)));
}

function matchSpecific(card: PlacementCard, selector: SynergyRule["left"]): boolean {
  const family = buildingFamily(card.type);
  if (selector === family) return true;
  if (selector === "cash_kiosk" || selector === "savings_stand") return card.type === selector;
  if (selector === "regional_bank") return ["regional_bank", "intl_bank"].includes(card.type);
  if (selector === "private_bank") return card.type === "private_bank";
  if (selector === "securities_exchange") return card.type === "securities_exchange";
  if (selector === "financial_data_center") return card.type === "data_center";
  if (selector === "financial_exchange_tower") return card.type === "exchange_tower";
  if (selector === "institutional_trading_center") return card.type === "inst_trading";
  if (selector === "sovereign_fund_tower") return card.type === "sovereign_fund";
  if (selector === "financial_empire_headquarters") return card.type === "empire_hq";
  return false;
}

function emptyEffect(): PlacementEffect {
  return { activityBps: 0, capacityBps: 0, customerBps: 0, operatingBps: 0, riskReliefBps: 0, riskIncreaseBps: 0, huntSpawnBps: 0, huntQualityBps: 0, eventProgressBps: 0, reputationBps: 0 };
}

function add(effect: PlacementEffect, key: keyof PlacementEffect, value: number) {
  effect[key] += value;
}

function connected(cards: PlacementCard[], radius: number): boolean {
  if (cards.length <= 1) return cards.length === 1;
  const reached = new Set([cards[0]!.id]);
  while (true) {
    const before = reached.size;
    for (const a of cards) if (reached.has(a.id)) for (const b of cards) if (!reached.has(b.id) && edgeDistance(a, b) <= radius) reached.add(b.id);
    if (reached.size === before) break;
  }
  return reached.size === cards.length;
}

function districtBonuses(cards: PlacementCard[]): DistrictBonus[] {
  const rules = [
    { id: "retail_finance", name: "Retail Finance District", families: ["banking", "financial_services", "insurance"] as PlacementFamily[], min: 4, share: 0.5, radius: 3, bonus: { customerBps: 600, reputationBps: 400 } },
    { id: "trading", name: "Trading District", families: ["brokerage", "exchange", "research"] as PlacementFamily[], min: 4, share: 0.5, radius: 3, bonus: { activityBps: 700, capacityBps: 500 } },
    { id: "investment", name: "Investment District", families: ["fund", "research", "treasury"] as PlacementFamily[], min: 4, share: 0.5, radius: 3, bonus: { activityBps: 600, operatingBps: 500 } },
    { id: "wealth", name: "Wealth District", families: ["wealth", "banking", "fund"] as PlacementFamily[], min: 4, share: 0.5, radius: 3, bonus: { customerBps: 700, reputationBps: 300 } },
    { id: "liquidity", name: "Liquidity District", families: ["exchange", "market_maker", "treasury"] as PlacementFamily[], min: 4, share: 0.5, radius: 3, bonus: { activityBps: 800, riskReliefBps: 400 } },
    { id: "institutional", name: "Institutional District", families: ["investment_banking", "research", "treasury"] as PlacementFamily[], min: 4, share: 0.5, radius: 4, bonus: { activityBps: 700, capacityBps: 500 } },
  ];
  const result: DistrictBonus[] = [];
  for (const rule of rules) {
    const matched = cards.filter((card) => rule.families.includes(buildingFamily(card.type)));
    const counts = new Map<PlacementFamily, number>();
    for (const card of matched) counts.set(buildingFamily(card.type), (counts.get(buildingFamily(card.type)) ?? 0) + 1);
    const largest = Math.max(...counts.values(), 0);
    if (matched.length >= rule.min && largest / matched.length <= rule.share && connected(matched, rule.radius)) result.push({ id: rule.id, name: rule.name, activityBps: 0, capacityBps: 0, customerBps: 0, operatingBps: 0, riskReliefBps: 0, reputationBps: 0, ...rule.bonus });
  }
  const families = new Set(cards.map((card) => buildingFamily(card.type)));
  if (families.size >= 5 && cards.length >= 6) result.push({ id: "diversified", name: "Diversified Financial Center", activityBps: 0, capacityBps: 0, customerBps: 0, operatingBps: 500, riskReliefBps: 0, reputationBps: 400 });
  const elite = cards.filter((card) => ["elite", "tycoon"].includes(specOf(card.type).era));
  if (families.size >= 6 && elite.length >= 2 && cards.length >= 8) result.push({ id: "global_capital", name: "Global Capital District", activityBps: 600, capacityBps: 500, customerBps: 0, operatingBps: 0, riskReliefBps: 0, reputationBps: 400 });
  return result;
}

function penaltiesFor(cards: PlacementCard[]): PlacementPenalty[] {
  const penalties: PlacementPenalty[] = [];
  const stage = levelOf(cards);
  if (stage >= 21) {
    for (const card of cards) {
      const local = cards.filter((other) => other.id !== card.id && buildingFamily(other.type) === buildingFamily(card.type) && edgeDistance(card, other) <= 3);
      if (local.length >= 3) penalties.push({ kind: "duplicate_family", cardIds: [card.id, ...local.map((item) => item.id)], bps: Math.min(1_600, (local.length - 2) * 400), message: `${buildingFamily(card.type)} density is reducing local efficiency.` });
    }
  }
  for (const card of cards) {
    const local = cards.filter((other) => other.id !== card.id && other.type === card.type && edgeDistance(card, other) <= 3);
    if (stage >= 11 && local.length >= 2) penalties.push({ kind: "duplicate_building", cardIds: [card.id, ...local.map((item) => item.id)], bps: Math.min(2_000, (local.length - 1) * 500), message: `${specOf(card.type).name} duplication is reducing revenue efficiency.` });
    const customers = cards.filter((other) => other.id !== card.id && specOf(other.type).customersBase > 0 && edgeDistance(card, other) <= 2);
    if (stage >= 11 && customers.length >= 4 && !["financial_services", "research"].includes(buildingFamily(card.type))) penalties.push({ kind: "customer_congestion", cardIds: [card.id, ...customers.map((item) => item.id)], bps: Math.min(1_200, (customers.length - 3) * 300), message: "Customer-facing buildings are congested." });
  }
  const trading = cards.filter((card) => ["brokerage", "exchange", "market_maker"].includes(buildingFamily(card.type)));
  const support = cards.filter((card) => ["research", "financial_services", "treasury"].includes(buildingFamily(card.type)));
  if (stage >= 21 && trading.length > support.length * 2) penalties.push({ kind: "transaction_congestion", cardIds: trading.map((card) => card.id), bps: Math.min(2_000, (trading.length - support.length * 2) * 500), message: "Trading capacity exceeds available infrastructure." });
  const liquidity = cards.filter((card) => ["banking", "fund", "exchange", "market_maker"].includes(buildingFamily(card.type)));
  const reserves = cards.filter((card) => buildingFamily(card.type) === "treasury");
  if (stage >= 21 && liquidity.length >= 3 && reserves.length === 0) penalties.push({ kind: "liquidity_concentration", cardIds: liquidity.map((card) => card.id), bps: Math.min(1_600, (liquidity.length - 2) * 400), message: "Liquidity concentration needs Treasury or Vault support." });
  const landmarks = cards.filter((card) => orientedFootprint(card.type, card.orientation ?? 0).join("x") === "4x4");
  for (let i = 0; i < landmarks.length; i++) for (let j = i + 1; j < landmarks.length; j++) if (directAdjacent(landmarks[i]!, landmarks[j]!)) penalties.push({ kind: "prestige_crowding", cardIds: [landmarks[i]!.id, landmarks[j]!.id], bps: 400, message: "Large landmarks need a spacing corridor." });
  return penalties;
}

export function resolvePlacement(cards: PlacementCard[]): PlacementResolution {
  const effects = emptyEffect();
  const links: PlacementLink[] = [];
  const level = levelOf(cards);
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
    const a = cards[i]!, b = cards[j]!;
    const distance = edgeDistance(a, b);
    for (const rule of SYNERGY_RULES) {
      if (level < rule.minLevel) continue;
      const matches = (matchSpecific(a, rule.left) && matchSpecific(b, rule.right)) || (matchSpecific(a, rule.right) && matchSpecific(b, rule.left));
      if (!matches) continue;
      const valid = rule.linkType === "direct" ? directAdjacent(a, b) : distance <= rule.radius;
      if (valid) links.push({ id: rule.id, rule: `${rule.left}+${rule.right}`, a: a.id, b: b.id, linkType: rule.linkType, distance, factor: 1, bonusBps: rule.primaryBps + rule.secondaryBps });
    }
  }
  const counts = new Map<string, number>();
  const ruleCounts = new Map<string, number>();
  links.sort((a, b) => b.bonusBps - a.bonusBps || a.id - b.id);
  const selected: PlacementLink[] = [];
  for (const link of links) {
    const rule = SYNERGY_RULES.find((candidate) => candidate.id === link.id)!;
    if ((counts.get(link.a) ?? 0) >= 4 || (counts.get(link.b) ?? 0) >= 4) continue;
    if ((ruleCounts.get(`${link.a}:${link.id}`) ?? 0) >= rule.maxLinks || (ruleCounts.get(`${link.b}:${link.id}`) ?? 0) >= rule.maxLinks) continue;
    const rank = Math.max(counts.get(link.a) ?? 0, counts.get(link.b) ?? 0);
    link.factor = [1, 0.75, 0.5, 0.25][Math.min(3, rank)]!;
    selected.push(link);
    counts.set(link.a, (counts.get(link.a) ?? 0) + 1); counts.set(link.b, (counts.get(link.b) ?? 0) + 1);
    ruleCounts.set(`${link.a}:${link.id}`, (ruleCounts.get(`${link.a}:${link.id}`) ?? 0) + 1); ruleCounts.set(`${link.b}:${link.id}`, (ruleCounts.get(`${link.b}:${link.id}`) ?? 0) + 1);
    add(effects, rule.primary, Math.round(rule.primaryBps * link.factor));
    add(effects, rule.secondary, Math.round(rule.secondaryBps * link.factor));
    if (rule.huntSpawnBps) effects.huntSpawnBps += Math.round(rule.huntSpawnBps * link.factor);
    if (rule.huntQualityBps) effects.huntQualityBps += Math.round(rule.huntQualityBps * link.factor);
    if (rule.riskReliefBps) effects.riskReliefBps += Math.round(rule.riskReliefBps * link.factor);
  }
  const penalties = penaltiesFor(cards);
  for (const penalty of penalties) {
    if (penalty.kind === "liquidity_concentration") effects.riskIncreaseBps += penalty.bps;
    else effects.operatingBps -= penalty.bps;
  }
  const districts = districtBonuses(cards);
  for (const district of districts) for (const key of ["activityBps", "capacityBps", "customerBps", "operatingBps", "riskReliefBps", "reputationBps"] as const) effects[key] += district[key];
  const specialTiles = cards.map((card) => {
    const special = specialForCard(card);
    // The workbook caps the combined special-tile contribution at 5% per building.
    // Split the eligible coverage allowance across the tiles before applying effects.
    const specialBps = Math.min(500, Math.floor(500 / Math.max(1, special.eligible.length)), Math.round(special.coverageBps * 0.02));
    for (const tile of special.eligible) {
      if (tile === "growth") effects.customerBps += specialBps;
      if (tile === "market") effects.activityBps += specialBps;
      if (tile === "treasury") effects.riskReliefBps += specialBps;
      if (tile === "research") effects.huntQualityBps += specialBps;
      if (tile === "event") effects.eventProgressBps += specialBps;
      if (tile === "premium") effects.operatingBps += specialBps;
    }
    return { cardId: card.id, tiles: special.eligible, coverageBps: special.coverageBps };
  });
  const eligibleBuildings = cards.filter((card) => selected.some((link) => link.a === card.id || link.b === card.id));
  const supportCovered = cards.filter((card) => selected.some((link) => link.linkType === "support" && (link.a === card.id || link.b === card.id)));
  const occupied = new Set(cards.flatMap(cells)).size;
  const congestionBps = penalties.reduce((sum, penalty) => sum + (penalty.kind === "liquidity_concentration" ? 0 : penalty.bps), 0);
  const families = new Set(cards.map((card) => buildingFamily(card.type)));
  const score = {
    synergyCoverage: Math.min(100, eligibleBuildings.length / Math.max(1, cards.length) / 0.9 * 100),
    infrastructureCoverage: Math.min(100, supportCovered.length / Math.max(1, cards.filter((card) => specOf(card.type).customersBase >= 50).length) / 0.95 * 100),
    congestionHealth: Math.max(0, 100 - congestionBps / 20),
    spaceEfficiency: Math.min(100, occupied / 144 * 100),
    diversification: Math.min(100, families.size / (level < 11 ? 3 : level < 21 ? 4 : level < 31 ? 5 : 6) * 100),
    placementScore: 0,
  };
  score.placementScore = Number((score.synergyCoverage * 0.35 + score.infrastructureCoverage * 0.25 + score.congestionHealth * 0.2 + score.spaceEfficiency * 0.1 + score.diversification * 0.1).toFixed(2));
  return { effects, links: selected, directLinks: selected.filter((link) => link.linkType === "direct").length, supportLinks: selected.filter((link) => link.linkType === "support").length, penalties, districts, specialTiles, score };
}

export const PLACEMENT_SYNERGY_RULE_COUNT = SYNERGY_RULES.length;
export const PLACEMENT_SPECIAL_TILE_COUNTS = { standard: 120, growth: 4, market: 4, treasury: 4, research: 4, event: 4, premium: 4 } as const;
export const PLACEMENT_BUILDING_COUNT = BUILDING_LIST.length;
