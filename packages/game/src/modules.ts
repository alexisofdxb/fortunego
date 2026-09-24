import { BUILDING_LIST, CARDS, resolveType, type Era } from "./buildings.ts";
import { marketStageForEmpireLevel, marketStageIndex, type HuntDifficulty, type MarketStage } from "./market_phase3.ts";
import { CANONICAL_MODULE_CATALOG, MODULE_CATALOG_BY_ID, type CanonicalModuleCatalogEntry } from "./module_catalog.ts";

export type ModuleRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type ModuleCategory = "Universal" | "Customer" | "Operations" | "Risk" | "Liquidity" | "Treasury" | "Market" | "Research" | "Credit" | "Wealth" | "Service" | "Institutional" | "Event";
export type ModuleRewardKind = "module" | "parts";
export type ModuleEffectType = "customer_acquisition" | "retention" | "capacity" | "activity_efficiency" | "operating_cost" | "service_quality" | "risk_delta" | "event_resilience";
export type ModuleRiskCategory = "operational" | "market" | "liquidity" | "credit" | "reputation" | "concentration" | "composite";
export type ModuleCustomerSegment = "generalConsumers" | "retailInvestors" | "activeTraders" | "smallBusinesses" | "corporateClients" | "highNetWorth" | "institutional";

export type ModuleEffect = {
  type: ModuleEffectType;
  value: number;
  segment?: ModuleCustomerSegment;
  riskCategory?: ModuleRiskCategory;
  stackingGroup: string;
  priority: number;
  conditionText?: string;
  sourceModuleId: string;
};

export type ModuleDefinition = CanonicalModuleCatalogEntry & {
  configVersion: string;
  effects: readonly ModuleEffect[];
  conditions: readonly { text: string }[];
  active: boolean;
};

export type ModuleRuntimeContext = {
  buildingLevel?: number;
  empireStage?: MarketStage;
  reputation?: number;
  serviceQuality?: number;
  risk: Partial<Record<ModuleRiskCategory, number>>;
  reserveRatio?: number;
  utilization?: number;
  marketState?: string;
  activeEvents?: readonly string[];
  customerSegments?: Partial<Record<ModuleCustomerSegment, number>>;
};

export type ModuleEffectVector = {
  customerAcquisitionBps: number;
  retentionBps: number;
  capacityBps: number;
  activityEfficiencyBps: number;
  operatingCostReductionBps: number;
  serviceQualityPoints: number;
  riskDeltas: Record<ModuleRiskCategory, number>;
  eventResilienceBps: number;
  appliedModules: string[];
  traces: { moduleId: string; effectType: ModuleEffectType; rawValue: number; effectiveValue: number; conditionMet: boolean }[];
};

export type BuildingModuleProfile = {
  buildingId: string;
  buildingRarity: "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary" | "Mythic";
  maxModuleSlots: number;
  slotUnlockLevels: readonly number[];
  allowedCategories: readonly ModuleCategory[];
  maxModuleRarity: ModuleRarity;
  legendaryLimit: 1;
};

const BUILDING_RARITY_BY_ERA: Record<Era, BuildingModuleProfile["buildingRarity"]> = {
  humble: "Common", starter: "Uncommon", growing: "Rare", established: "Epic", elite: "Legendary", tycoon: "Mythic",
};
const SLOT_RULES_BY_ERA: Record<Era, readonly number[]> = {
  humble: [3], starter: [3, 6], growing: [3, 7], established: [3, 6, 9], elite: [3, 6, 9], tycoon: [3, 6, 9, 11],
};
const FAMILY_CATEGORIES: Record<string, readonly ModuleCategory[]> = {
  "Cash Services": ["Universal", "Customer", "Operations", "Treasury"],
  Trading: ["Universal", "Market", "Operations", "Risk"],
  Banking: ["Universal", "Customer", "Liquidity", "Credit", "Risk", "Service"],
  Brokerage: ["Universal", "Market", "Customer", "Research", "Operations"],
  Research: ["Universal", "Research", "Operations", "Event", "Service"],
  Lending: ["Universal", "Customer", "Credit", "Risk", "Service"],
  FX: ["Universal", "Market", "Operations", "Liquidity", "Risk"],
  Insurance: ["Universal", "Customer", "Risk", "Service", "Operations"],
  Advisory: ["Universal", "Customer", "Research", "Wealth", "Service"],
  Treasury: ["Universal", "Liquidity", "Risk", "Operations"],
  "Asset Management": ["Universal", "Market", "Research", "Risk", "Institutional"],
  "Multi-Service": ["Universal", "Customer", "Operations", "Risk", "Service"],
  Wealth: ["Universal", "Wealth", "Customer", "Service", "Risk"],
  Fintech: ["Universal", "Operations", "Customer", "Research", "Event"],
  Data: ["Universal", "Research", "Operations", "Event"],
  "Market Making": ["Universal", "Market", "Liquidity", "Risk", "Operations"],
  "Private Banking": ["Universal", "Wealth", "Customer", "Liquidity", "Service"],
  Exchange: ["Universal", "Market", "Operations", "Liquidity", "Risk"],
  "Investment Banking": ["Universal", "Institutional", "Research", "Risk", "Customer"],
};
const FAMILY_OVERRIDES: Record<string, string> = {
  cash_kiosk: "Cash Services", trading_booth: "Trading", savings_stand: "Banking", mini_brokerage: "Brokerage", market_info: "Research",
  micro_loan: "Lending", fx_stand: "FX", insurance_desk: "Insurance", advice_booth: "Advisory", cash_locker: "Treasury",
  services_hub: "Multi-Service", small_fund: "Asset Management", advisory_firm: "Advisory", asset_office: "Asset Management",
  research_center: "Research", digital_hub: "Fintech", private_vault: "Treasury", data_center: "Data", market_maker: "Market Making",
  private_bank: "Private Banking", securities_exchange: "Exchange", investment_bank: "Investment Banking", global_brokerage: "Brokerage",
  major_am: "Asset Management", global_wealth: "Wealth", exchange_tower: "Exchange", intl_bank: "Banking", global_ib: "Investment Banking",
  sovereign_fund: "Asset Management", world_exchange: "Exchange", empire_hq: "Multi-Service",
};
function familyForType(type: string): string {
  const id = resolveType(type);
  const spec = CARDS[id];
  if (!spec) throw new Error(`Unknown building ${type}`);
  return FAMILY_OVERRIDES[id] ?? ({ bank: "Banking", trade: "Trading", broker: "Brokerage", fund: "Asset Management", research: "Research", lend: "Lending", insure: "Insurance", vault: "Treasury", wealth: "Wealth", treasury: "Treasury", digital: "Fintech", exchange: "Exchange", ib: "Investment Banking", empire: "Multi-Service" } as Record<string, string>)[spec.lineage] ?? "Multi-Service";
}
export function moduleBuildingFamily(type: string): string { return familyForType(type); }
export function canonicalModuleCatalog(): readonly CanonicalModuleCatalogEntry[] { return CANONICAL_MODULE_CATALOG; }

const MAX_LEVEL_BY_ERA: Record<Era, number> = { humble: 6, starter: 7, growing: 8, established: 9, elite: 10, tycoon: 11 };
const RARITY_RANK: Record<ModuleRarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
const RARITY_ORDER: readonly ModuleRarity[] = ["common", "uncommon", "rare", "epic", "legendary"];
export const MODULE_PART_VALUES: Record<ModuleRarity, number> = { common: 5, uncommon: 12, rare: 30, epic: 80, legendary: 200 };
export function moduleRarityRank(rarity: ModuleRarity): number { return RARITY_RANK[rarity]; }

const MAX_RARITY_BY_BUILDING_RARITY: Record<BuildingModuleProfile["buildingRarity"], ModuleRarity> = {
  Common: "common",
  Uncommon: "uncommon",
  Rare: "rare",
  Epic: "epic",
  Legendary: "legendary",
  Mythic: "legendary",
};

export function buildingModuleProfile(type: string): BuildingModuleProfile {
  const spec = CARDS[resolveType(type)];
  if (!spec) throw new Error(`Unknown building ${type}`);
  const buildingRarity = BUILDING_RARITY_BY_ERA[spec.era];
  return { buildingId: spec.id, buildingRarity, maxModuleSlots: SLOT_RULES_BY_ERA[spec.era].length, slotUnlockLevels: SLOT_RULES_BY_ERA[spec.era], allowedCategories: FAMILY_CATEGORIES[familyForType(spec.id)] ?? ["Universal"], maxModuleRarity: MAX_RARITY_BY_BUILDING_RARITY[buildingRarity], legendaryLimit: 1 };
}
export function runtimeUpgradeLevel(type: string, stage: number): number {
  const spec = CARDS[resolveType(type)];
  if (!spec) throw new Error(`Unknown building ${type}`);
  if (stage <= 1) return 1;
  if (stage === 2) return 3;
  return MAX_LEVEL_BY_ERA[spec.era];
}
export function moduleSlotsForBuilding(type: string, upgradeLevel: number): number { return buildingModuleProfile(type).slotUnlockLevels.filter((level) => upgradeLevel >= level).length; }
export function moduleSlotsForRuntimeStage(type: string, stage: number): number { return moduleSlotsForBuilding(type, runtimeUpgradeLevel(type, stage)); }
export function moduleCategoryAllowed(type: string, category: ModuleCategory): boolean { return buildingModuleProfile(type).allowedCategories.includes(category); }
export function moduleRarityAllowed(type: string, rarity: ModuleRarity): boolean {
  return moduleRarityRank(rarity) <= moduleRarityRank(buildingModuleProfile(type).maxModuleRarity);
}

const STAGE_GATE_INDEX: Record<string, number> = { Humble: 0, Starter: 1, Growing: 2, Established: 3, Elite: 4, Tycoon: 5 };
function stageGateAllowed(moduleId: string, stage: MarketStage): boolean {
  const entry = MODULE_CATALOG_BY_ID.get(moduleId);
  return Boolean(entry && marketStageIndex(stage) >= (STAGE_GATE_INDEX[entry.stageGate] ?? Number.MAX_SAFE_INTEGER));
}
export function moduleStageAllowed(type: string, moduleId: string): boolean {
  const spec = CARDS[resolveType(type)];
  const entry = MODULE_CATALOG_BY_ID.get(moduleId);
  if (!spec || !entry) return false;
  const buildingStage = spec.era.charAt(0).toUpperCase() + spec.era.slice(1);
  return (STAGE_GATE_INDEX[buildingStage] ?? 0) >= (STAGE_GATE_INDEX[entry.stageGate] ?? Number.MAX_SAFE_INTEGER);
}
export function moduleStageAllowedAtEmpireLevel(moduleId: string, empireLevel: number): boolean {
  return stageGateAllowed(moduleId, marketStageForEmpireLevel(empireLevel));
}
export function moduleEquippable(type: string, moduleId: string, empireLevel?: number): boolean {
  const entry = MODULE_CATALOG_BY_ID.get(moduleId);
  if (!entry) return false;
  const stageAllowed = empireLevel == null ? moduleStageAllowed(type, moduleId) : moduleStageAllowedAtEmpireLevel(moduleId, empireLevel);
  return moduleCompatible(type, entry) && moduleCategoryAllowed(type, entry.category as ModuleCategory) && moduleRarityAllowed(type, entry.rarity.toLowerCase() as ModuleRarity) && stageAllowed;
}

function normalize(value: string): string { return value.toLowerCase().replace(/[×x]/g, "x").replace(/[^a-z0-9%+\-. ]/g, " ").replace(/\s+/g, " ").trim(); }
function familiesOf(entry: Pick<CanonicalModuleCatalogEntry, "families">): string[] { return entry.families.split(",").map((family) => family.trim()).filter(Boolean); }
function segmentForText(text: string): ModuleCustomerSegment | undefined {
  const value = normalize(text);
  if (value.includes("small business") || value.includes("sme")) return "smallBusinesses";
  if (value.includes("retail investor")) return "retailInvestors";
  if (value.includes("active trader")) return "activeTraders";
  if (value.includes("corporate") || value.includes("institutional client")) return "corporateClients";
  if (value.includes("hnw") || value.includes("high net worth")) return "highNetWorth";
  if (value.includes("general consumer")) return "generalConsumers";
  return undefined;
}
function riskForText(text: string): ModuleRiskCategory | undefined {
  const value = normalize(text);
  if (value.includes("operational")) return "operational";
  if (value.includes("market")) return "market";
  if (value.includes("liquidity")) return "liquidity";
  if (value.includes("credit")) return "credit";
  if (value.includes("reputation")) return "reputation";
  if (value.includes("concentration")) return "concentration";
  if (value.includes("composite") || value.includes("combined")) return "composite";
  return undefined;
}
function typeForText(text: string): ModuleEffectType | null {
  const value = normalize(text);
  if (value.includes("event magnitude")) return "event_resilience";
  if (value.includes("retention")) return "retention";
  if (value.includes("acquisition")) return "customer_acquisition";
  if (value.includes("capacity")) return "capacity";
  if (value.includes("activity") || value.includes("trading volume") || value.includes("lending activity")) return "activity_efficiency";
  if (value.includes("operating cost")) return "operating_cost";
  if (value.includes("service quality")) return "service_quality";
  if (riskForText(value)) return "risk_delta";
  return null;
}
function parseEffectPhrase(entry: CanonicalModuleCatalogEntry, phrase: string): ModuleEffect | null {
  const raw = phrase.trim();
  if (!raw) return null;
  const pieces = raw.split(":");
  const conditionText = pieces.length > 1 && /if|when|state|reserve|reputation|utilization|segment|risk/i.test(pieces[0]!) ? pieces.slice(0, -1).join(":").trim() : undefined;
  const text = pieces.length > 1 && conditionText ? pieces[pieces.length - 1]!.trim() : raw;
  const type = typeForText(text);
  if (!type) return null;
  const target = normalize(text);
  let value = 0;
  const multiplier = target.match(/x\s*([0-9]+(?:\.[0-9]+)?)/);
  const percent = target.match(/([+-][0-9]+(?:\.[0-9]+)?)%/);
  const points = target.match(/([+-][0-9]+(?:\.[0-9]+)?)\s*(?:service quality|risk|operational|market|liquidity|credit|reputation|concentration|capacity)/);
  if (multiplier) value = Math.round((Number(multiplier[1]) - 1) * 10_000);
  else if (percent) value = Math.round(Number(percent[1]) * 100);
  else if (points) value = Math.round(Number(points[1]));
  else return null;
  if (type === "event_resilience") value = Math.abs(value);
  if (type === "operating_cost") value = -value;
  return { type, value, segment: type === "customer_acquisition" || type === "retention" ? segmentForText(text) : undefined, riskCategory: type === "risk_delta" ? riskForText(text) : undefined, stackingGroup: entry.stackingGroup || entry.category.toLowerCase(), priority: 100, conditionText, sourceModuleId: entry.id };
}
function parseModuleDefinition(entry: CanonicalModuleCatalogEntry): ModuleDefinition {
  const effects = [entry.primaryPower, entry.secondaryPower].flatMap((phrase) => phrase ? [parseEffectPhrase(entry, phrase)].filter((effect): effect is ModuleEffect => Boolean(effect)) : []);
  return { ...entry, configVersion: "catalog-v1.0", effects, conditions: entry.condition ? [{ text: entry.condition }] : [], active: true };
}
const DEFINITION_CACHE = new Map<string, ModuleDefinition>();
export function moduleDefinition(moduleId: string): ModuleDefinition | null {
  const entry = MODULE_CATALOG_BY_ID.get(moduleId);
  if (!entry) return null;
  const cached = DEFINITION_CACHE.get(moduleId);
  if (cached) return cached;
  const definition = parseModuleDefinition(entry);
  DEFINITION_CACHE.set(moduleId, definition);
  return definition;
}

function conditionSatisfied(text: string, ctx: ModuleRuntimeContext): boolean {
  const value = normalize(text);
  const read = (pattern: RegExp) => { const match = value.match(pattern); return match ? Number(match[1]) : null; };
  const service = read(/service quality >=([0-9.]+)/) ?? read(/service quality <=([0-9.]+)/);
  if (service != null && value.includes(">=") && (ctx.serviceQuality ?? 0) < service) return false;
  if (service != null && value.includes("<=") && (ctx.serviceQuality ?? 0) > service) return false;
  const reputation = read(/reputation >=([0-9.]+)/) ?? read(/reputation <=([0-9.]+)/);
  if (reputation != null && value.includes(">=") && (ctx.reputation ?? 0) < reputation) return false;
  const reserve = read(/reserve ratio >=([0-9.]+)%/);
  if (reserve != null && (ctx.reserveRatio ?? 0) < reserve / 100) return false;
  const riskMatch = value.match(/(operational|market|liquidity|credit|reputation|concentration|composite) risk (<=|>=)([0-9.]+)/);
  if (riskMatch) {
    const current = Number(ctx.risk[riskMatch[1] as ModuleRiskCategory] ?? 100);
    if (riskMatch[2] === "<=" && current > Number(riskMatch[3])) return false;
    if (riskMatch[2] === ">=" && current < Number(riskMatch[3])) return false;
  }
  if (value.includes("market state") && value.includes("crisis") && value.includes("!=") && (ctx.marketState ?? "Neutral").toLowerCase() === "crisis") return false;
  if (value.includes("market state") && (value.includes("bull") || value.includes("expansion")) && !(["bull", "expansion"].includes((ctx.marketState ?? "").toLowerCase()))) return false;
  if (value.includes("ipo week") && !(ctx.activeEvents ?? []).some((event) => event.toLowerCase().includes("ipo"))) return false;
  if (value.includes("volatility spike") && !(ctx.activeEvents ?? []).some((event) => event.toLowerCase().includes("volatility"))) return false;
  if (value.includes("3+ customer segments")) {
    const count = Object.values(ctx.customerSegments ?? {}).filter((item) => Number(item) >= 10).length;
    if (count < 3) return false;
  }
  if (value.includes("one segment share") || value.includes("no segment")) {
    const max = Math.max(0, ...Object.values(ctx.customerSegments ?? {}).map(Number));
    if (max > 70) return false;
  }
  return true;
}
function emptyEffectVector(): ModuleEffectVector {
  return { customerAcquisitionBps: 0, retentionBps: 0, capacityBps: 0, activityEfficiencyBps: 0, operatingCostReductionBps: 0, serviceQualityPoints: 0, riskDeltas: { operational: 0, market: 0, liquidity: 0, credit: 0, reputation: 0, concentration: 0, composite: 0 }, eventResilienceBps: 0, appliedModules: [], traces: [] };
}
function applyVectorValue(vector: ModuleEffectVector, effect: ModuleEffect, value: number) {
  if (effect.type === "customer_acquisition") vector.customerAcquisitionBps += value;
  else if (effect.type === "retention") vector.retentionBps += value;
  else if (effect.type === "capacity") vector.capacityBps += value;
  else if (effect.type === "activity_efficiency") vector.activityEfficiencyBps += value;
  else if (effect.type === "operating_cost") vector.operatingCostReductionBps += value;
  else if (effect.type === "service_quality") vector.serviceQualityPoints += value;
  else if (effect.type === "event_resilience") vector.eventResilienceBps += value;
  else if (effect.type === "risk_delta") vector.riskDeltas[effect.riskCategory ?? "composite"] += value;
}
function clampVector(vector: ModuleEffectVector) {
  vector.customerAcquisitionBps = Math.max(-25_000, Math.min(25_000, vector.customerAcquisitionBps));
  vector.retentionBps = Math.max(-15_000, Math.min(15_000, vector.retentionBps));
  vector.capacityBps = Math.max(-20_000, Math.min(20_000, vector.capacityBps));
  vector.activityEfficiencyBps = Math.max(-15_000, Math.min(15_000, vector.activityEfficiencyBps));
  vector.operatingCostReductionBps = Math.max(-12_000, Math.min(12_000, vector.operatingCostReductionBps));
  vector.serviceQualityPoints = Math.max(-10, Math.min(10, vector.serviceQualityPoints));
  vector.eventResilienceBps = Math.max(0, Math.min(20_000, vector.eventResilienceBps));
  for (const key of Object.keys(vector.riskDeltas) as ModuleRiskCategory[]) vector.riskDeltas[key] = Math.max(-15, Math.min(15, vector.riskDeltas[key]));
}
export function resolveModuleEffects(type: string, moduleIds: readonly string[], ctx: ModuleRuntimeContext = { risk: {} }): ModuleEffectVector {
  const vector = emptyEffectVector();
  const groups = new Map<string, ModuleEffect[]>();
  for (const moduleId of moduleIds) {
    const definition = moduleDefinition(moduleId);
    if (!definition || !definition.active || !moduleEquippable(type, moduleId) || (ctx.empireStage && !stageGateAllowed(moduleId, ctx.empireStage))) continue;
    let applied = false;
    for (const effect of definition.effects) {
      const met = (!effect.conditionText || conditionSatisfied(effect.conditionText, ctx)) && definition.conditions.every((condition) => conditionSatisfied(condition.text, ctx));
      vector.traces.push({ moduleId, effectType: effect.type, rawValue: effect.value, effectiveValue: met ? effect.value : 0, conditionMet: met });
      if (!met) continue;
      const key = `${effect.stackingGroup}:${effect.type}:${effect.segment ?? ""}:${effect.riskCategory ?? ""}`;
      const group = groups.get(key) ?? [];
      group.push(effect);
      groups.set(key, group);
      applied = true;
    }
    if (applied) vector.appliedModules.push(moduleId);
  }
  for (const effects of groups.values()) {
    effects.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    [1, 0.6, 0.3].forEach((weight, index) => { const effect = effects[index]; if (effect) applyVectorValue(vector, effect, effect.value * weight); });
  }
  clampVector(vector);
  return vector;
}

export function moduleCompatible(type: string, entry: Pick<CanonicalModuleCatalogEntry, "families">): boolean {
  const family = familyForType(type);
  return familiesOf(entry).some((candidate) => candidate === "All" || candidate === family || (candidate === "All customer-facing" && ["Cash Services", "Banking", "Lending", "Brokerage", "Insurance", "Advisory", "Wealth", "Private Banking", "Multi-Service"].includes(family)));
}

export type HuntModuleRewardRule = { moduleRollChance: number; moduleShare: number; rarityOdds: Record<ModuleRarity, number> };
export const HUNT_MODULE_REWARD_RULES: Record<HuntDifficulty, HuntModuleRewardRule> = {
  easy: { moduleRollChance: 0.05, moduleShare: 0.70, rarityOdds: { common: 0.85, uncommon: 0.15, rare: 0, epic: 0, legendary: 0 } },
  standard: { moduleRollChance: 0.10, moduleShare: 0.70, rarityOdds: { common: 0.65, uncommon: 0.30, rare: 0.05, epic: 0, legendary: 0 } },
  hard: { moduleRollChance: 0.18, moduleShare: 0.70, rarityOdds: { common: 0.35, uncommon: 0.45, rare: 0.18, epic: 0.02, legendary: 0 } },
  elite: { moduleRollChance: 0.28, moduleShare: 0.70, rarityOdds: { common: 0.15, uncommon: 0.35, rare: 0.40, epic: 0.09, legendary: 0.01 } },
  jackpot: { moduleRollChance: 0.45, moduleShare: 0.70, rarityOdds: { common: 0.05, uncommon: 0.20, rare: 0.45, epic: 0.25, legendary: 0.05 } },
};
function seededUnit(seed: number, salt: number): number {
  let value = (seed ^ Math.imul(salt + 1, 0x9e3779b9)) >>> 0;
  value ^= value >>> 16; value = Math.imul(value, 0x85ebca6b) >>> 0; value ^= value >>> 13;
  return (value >>> 0) / 4_294_967_296;
}
function chooseRarity(odds: Record<ModuleRarity, number>, seed: number): ModuleRarity {
  let cursor = seededUnit(seed, 3) * Math.max(1, RARITY_ORDER.reduce((sum, rarity) => sum + odds[rarity], 0));
  for (const rarity of RARITY_ORDER) { cursor -= odds[rarity]; if (cursor <= 0) return rarity; }
  return "common";
}
function chooseCatalogModule(rarity: ModuleRarity, seed: number, compatibleFamily: string | null, eventSource?: string): CanonicalModuleCatalogEntry | null {
  const pool = CANONICAL_MODULE_CATALOG.filter((entry) => entry.rarity.toLowerCase() === rarity && (!eventSource || eventSource === "Broad" || entry.eventSource.toLowerCase().includes(eventSource.toLowerCase())));
  const familyPool = compatibleFamily ? pool.filter((entry) => familiesOf(entry).includes(compatibleFamily) || familiesOf(entry).includes("All") || (compatibleFamily === "Customers" && familiesOf(entry).includes("All customer-facing"))) : pool;
  const candidates = familyPool.length ? familyPool : pool;
  if (!candidates.length) return null;
  const weights = candidates.map((entry) => compatibleFamily && familiesOf(entry).includes(compatibleFamily) ? 3 : 1);
  let cursor = seededUnit(seed, 5) * weights.reduce((sum, weight) => sum + weight, 0);
  for (let i = 0; i < candidates.length; i++) { cursor -= weights[i]!; if (cursor <= 0) return candidates[i]!; }
  return candidates[candidates.length - 1]!;
}

export type ModuleReward = { kind: ModuleRewardKind; rarity: ModuleRarity; quantity: number; partsAmount: number; compatibleFamily: string | null; moduleId: string | null; moduleName: string | null };
export function rollHuntModuleReward(difficulty: HuntDifficulty, seed: number, compatibleFamily: string | null = null): ModuleReward | null {
  const rule = HUNT_MODULE_REWARD_RULES[difficulty];
  if (seededUnit(seed, 1) >= rule.moduleRollChance) return null;
  const rarity = chooseRarity(rule.rarityOdds, seed);
  const kind: ModuleRewardKind = seededUnit(seed, 2) < rule.moduleShare ? "module" : "parts";
  const entry = kind === "module" ? chooseCatalogModule(rarity, seed, compatibleFamily) : null;
  if (kind === "module" && !entry) return { kind: "parts", rarity, quantity: 0, partsAmount: MODULE_PART_VALUES[rarity], compatibleFamily, moduleId: null, moduleName: null };
  return { kind, rarity, quantity: kind === "module" ? 1 : 0, partsAmount: kind === "parts" ? MODULE_PART_VALUES[rarity] : 0, compatibleFamily, moduleId: entry?.id ?? null, moduleName: entry?.name ?? null };
}

export type EventModuleInteraction = { rewardChance: number; rewardRarity: ModuleRarity; rewardKind: ModuleRewardKind; rewardOn: "decision" | "mission"; eventSource?: string; lockFamilies: readonly string[]; lockReason: string | null };
export const EVENT_MODULE_INTERACTIONS: Record<string, EventModuleInteraction> = {
  research_breakthrough: { rewardChance: 0.12, rewardRarity: "uncommon", rewardKind: "module", rewardOn: "mission", eventSource: "Tech Rally", lockFamilies: [], lockReason: null },
  ipo_week: { rewardChance: 0.20, rewardRarity: "epic", rewardKind: "module", rewardOn: "mission", eventSource: "IPO Week", lockFamilies: [], lockReason: null },
  liquidity_crunch: { rewardChance: 0.18, rewardRarity: "rare", rewardKind: "parts", rewardOn: "decision", eventSource: "Liquidity Crunch", lockFamilies: ["banking", "treasury", "exchange", "market_maker"], lockReason: "Liquidity event: Module changes are locked on affected buildings until resolution." },
  financial_summit: { rewardChance: 0.25, rewardRarity: "epic", rewardKind: "module", rewardOn: "mission", eventSource: "M&A Boom", lockFamilies: [], lockReason: null },
  earnings_week: { rewardChance: 0.12, rewardRarity: "uncommon", rewardKind: "module", rewardOn: "mission", eventSource: "Earnings Season", lockFamilies: [], lockReason: null },
  market_correction: { rewardChance: 0.20, rewardRarity: "rare", rewardKind: "module", rewardOn: "mission", eventSource: "Market Correction", lockFamilies: ["trade", "exchange", "market_maker"], lockReason: "Market correction: affected market Modules are locked until resolution." },
  tech_rally: { rewardChance: 0.20, rewardRarity: "rare", rewardKind: "module", rewardOn: "mission", eventSource: "Tech Rally", lockFamilies: [], lockReason: null },
  system_outage: { rewardChance: 0, rewardRarity: "common", rewardKind: "parts", rewardOn: "decision", lockFamilies: ["research", "digital", "exchange"], lockReason: "Operational event: affected infrastructure Modules are locked until the outage ends." },
  market_maker_dislocation: { rewardChance: 0, rewardRarity: "common", rewardKind: "parts", rewardOn: "decision", lockFamilies: ["market_maker", "exchange", "trade"], lockReason: "Market dislocation: affected market Modules are locked until the event ends." },
  bank_run_rumor: { rewardChance: 0, rewardRarity: "common", rewardKind: "parts", rewardOn: "decision", lockFamilies: ["banking", "treasury", "lend"], lockReason: "Bank-run event: defensive Module loadouts are locked until resolution." },
};
export function eventModuleInteraction(eventId: string): EventModuleInteraction | null { return EVENT_MODULE_INTERACTIONS[eventId] ?? null; }
export function moduleLockForEvent(eventId: string, buildingFamily: string): string | null { const interaction = eventModuleInteraction(eventId); return interaction && interaction.lockFamilies.includes(buildingFamily) ? interaction.lockReason : null; }
export function rollEventModuleReward(eventId: string, seed: number, trigger: EventModuleInteraction["rewardOn"], compatibleFamily: string | null = null): ModuleReward | null {
  const interaction = eventModuleInteraction(eventId);
  if (!interaction || interaction.rewardOn !== trigger || interaction.rewardChance <= 0 || seededUnit(seed, 7) >= interaction.rewardChance) return null;
  const entry = interaction.rewardKind === "module" ? chooseCatalogModule(interaction.rewardRarity, seed, compatibleFamily, interaction.eventSource) : null;
  return entry ? { kind: "module", rarity: entry.rarity.toLowerCase() as ModuleRarity, quantity: 1, partsAmount: 0, compatibleFamily, moduleId: entry.id, moduleName: entry.name } : { kind: "parts", rarity: interaction.rewardRarity, quantity: 0, partsAmount: MODULE_PART_VALUES[interaction.rewardRarity], compatibleFamily, moduleId: null, moduleName: null };
}
export function moduleRewardLabel(reward: ModuleReward): string { return reward.kind === "module" ? reward.moduleName ? `${reward.moduleName} (${reward.rarity})` : `${reward.rarity} Module` : `${reward.partsAmount} ${reward.rarity} Module Parts`; }
export const MODULE_STAGE_RULES: Record<MarketStage, { minRarity: ModuleRarity; maxRarity: ModuleRarity }> = {
  humble: { minRarity: "common", maxRarity: "uncommon" }, starter: { minRarity: "common", maxRarity: "rare" }, growing: { minRarity: "common", maxRarity: "epic" }, established: { minRarity: "common", maxRarity: "epic" }, elite: { minRarity: "common", maxRarity: "legendary" }, tycoon: { minRarity: "common", maxRarity: "legendary" },
};
export const BUILDING_MODULE_PROFILE_COUNT = BUILDING_LIST.length;
