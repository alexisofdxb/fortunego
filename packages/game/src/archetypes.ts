import { CARDS, resolveType, type CardSpec } from "./buildings.ts";
import type { PlacedCard } from "./index.ts";

export type EmpireArchetype = "trading" | "investment" | "banking" | "tokenized_stock";

export const EMPIRE_ARCHETYPES: readonly { id: EmpireArchetype; name: string; description: string }[] = [
  { id: "trading", name: "Trading Empire", description: "Rewards market activity, but a banking-heavy board suppresses the theme." },
  { id: "investment", name: "Investment Empire", description: "Rewards portfolio and research infrastructure, but a trading-floor-heavy board suppresses the theme." },
  { id: "banking", name: "Banking Empire", description: "Rewards banking margin and lowers default risk, but a dominant exchange suppresses the theme." },
  { id: "tokenized_stock", name: "Tokenized-Stock Empire", description: "Rewards brokerage, stock and data infrastructure; the full bonus arrives with Phase 4 positions." },
];

export type ArchetypeEffects = {
  activityBps: number;
  operatingBps: number;
  riskReliefBps: number;
  listedNotionalBps: number;
};

export type ArchetypeResolution = {
  archetype: EmpireArchetype | null;
  dominantShare: number;
  suppressed: boolean;
  reason: string | null;
  effects: ArchetypeEffects;
};

const emptyEffects = (): ArchetypeEffects => ({ activityBps: 0, operatingBps: 0, riskReliefBps: 0, listedNotionalBps: 0 });
const specOf = (card: PlacedCard) => CARDS[resolveType(card.type)];

export function resolveArchetype(cards: readonly PlacedCard[], archetype: EmpireArchetype | null, hasPortfolio = false): ArchetypeResolution {
  if (!archetype || cards.length === 0) return { archetype, dominantShare: 0, suppressed: false, reason: null, effects: emptyEffects() };
  // One building per hex: a card's board share is its placed-hex share.
  const tagged = (predicate: (spec: CardSpec) => boolean) => cards.filter((card) => { const spec = specOf(card); return spec ? predicate(spec) : false; }).length;
  const totalHexes = Math.max(1, cards.length);
  const tradeShare = tagged((spec) => spec.lineage === "trade" || spec.lineage === "exchange") / totalHexes;
  const bankingShare = tagged((spec) => ["bank", "lend", "insure", "vault"].includes(spec.lineage)) / totalHexes;
  const investmentShare = tagged((spec) => ["fund", "research", "wealth", "treasury"].includes(spec.lineage)) / totalHexes;
  const exchange4x4 = cards.some((card) => { const spec = specOf(card); return spec?.lineage === "exchange" && spec.footprint[0] * spec.footprint[1] >= 16; });
  const effects = emptyEffects();
  let dominantShare = 0;
  let suppressed = false;
  let reason: string | null = null;
  if (archetype === "trading") {
    dominantShare = tradeShare;
    suppressed = bankingShare > 0.4;
    if (!suppressed && tradeShare < 0.4) { suppressed = true; reason = "Trading tags occupy less than 40% of the board."; }
    else if (suppressed) reason = "Banking tags occupy more than 40% of the board.";
    else effects.activityBps = 1_000;
  } else if (archetype === "investment") {
    dominantShare = investmentShare;
    suppressed = tradeShare > 0.4;
    if (!suppressed && investmentShare < 0.4) { suppressed = true; reason = "Investment tags occupy less than 40% of the board."; }
    else if (suppressed) reason = "Trading-floor or exchange tags occupy more than 40% of the board.";
    else effects.operatingBps = 1_000;
  } else if (archetype === "banking") {
    dominantShare = bankingShare;
    suppressed = exchange4x4;
    if (!suppressed && bankingShare < 0.4) { suppressed = true; reason = "Banking tags occupy less than 40% of the board."; }
    else if (suppressed) reason = "A 4×4 Stock Exchange suppresses the Banking theme.";
    else { effects.operatingBps = 1_000; effects.riskReliefBps = 1_000; }
  } else {
    dominantShare = tagged((spec) => ["broker", "exchange", "digital", "research"].includes(spec.lineage)) / totalHexes;
    if (dominantShare < 0.4) { suppressed = true; reason = "Brokerage, stock, or data tags occupy less than 40% of the board."; }
    else { effects.listedNotionalBps = hasPortfolio ? 1_000 : 400; effects.operatingBps = effects.listedNotionalBps; }
  }
  return { archetype, dominantShare: Number(dominantShare.toFixed(3)), suppressed, reason, effects: suppressed ? emptyEffects() : effects };
}
