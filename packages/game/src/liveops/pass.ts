import { CASH_SCALE } from "../constants.ts";
import { isoWeek } from "../market_phase3.ts";
import { weekMondayUtcMs } from "../event_calendar.ts";

export const LIVEOPS_PASS_LEVELS = 30;
export const LIVEOPS_PASS_DAYS = 28;

export type LiveopsPassReward = {
  kind: "cash" | "item";
  label: string;
  cashMinor?: number;
  itemId?: string;
  quantity?: number;
};

export type LiveopsPassLevel = {
  level: number;
  xpReq: number;
  cumulativeXp: number;
  free: LiveopsPassReward;
  premium: LiveopsPassReward;
  major: boolean;
};

const cash = (dollars: number): LiveopsPassReward => ({
  kind: "cash",
  label: `$${dollars.toLocaleString()} Cash`,
  cashMinor: dollars * CASH_SCALE,
});

const item = (itemId: string, quantity: number, label: string): LiveopsPassReward => ({
  kind: "item",
  itemId,
  quantity,
  label,
});

const FREE_CYCLE: LiveopsPassReward[] = [
  cash(500),
  item("module_shard", 8, "Module Shards"),
  item("market_hunt_ticket", 1, "Market Hunt Ticket"),
  item("efficiency_voucher", 1, "Daily Case boost"),
  item("maturation_booster", 1, "Boost"),
];

const PREMIUM_CYCLE: LiveopsPassReward[] = [
  item("event_key", 1, "Event Key"),
  item("precision_component", 1, "Rare Material"),
  item("city_cosmetic_token", 1, "Premium Cosmetic"),
  item("opportunity_reroll", 1, "Opportunity Reroll"),
  item("executive_key", 1, "Executive Case"),
];

export const LIVEOPS_PASS_TRACK: readonly LiveopsPassLevel[] = Array.from({ length: LIVEOPS_PASS_LEVELS }, (_, index) => {
  const level = index + 1;
  const xpReq = 100 + index * 10;
  const cumulativeXp = ((2 * 100 + (level - 1) * 10) * level) / 2;
  return {
    level,
    xpReq,
    cumulativeXp,
    free: FREE_CYCLE[index % FREE_CYCLE.length]!,
    premium: PREMIUM_CYCLE[index % PREMIUM_CYCLE.length]!,
    major: level % 5 === 0,
  };
});

export function liveopsPassLevelForXp(xp: number): number {
  let reached = 0;
  for (const row of LIVEOPS_PASS_TRACK) {
    if (xp >= row.cumulativeXp) reached = row.level;
    else break;
  }
  return reached;
}

export type LiveopsSeason = {
  id: string;
  year: number;
  index: number;
  startsAt: number;
  endsAt: number;
};

/** 28-day season aligned to ISO weeks 1–4, 5–8, … */
export function liveopsSeasonAt(now = Date.now()): LiveopsSeason {
  const label = isoWeek(new Date(now));
  const [yearText, weekText] = label.split("-W");
  const year = Number(yearText);
  const week = Number(weekText);
  const index = Math.floor((Math.max(1, week) - 1) / 4) + 1;
  const startWeek = (index - 1) * 4 + 1;
  const startsAt = weekMondayUtcMs(`${year}-W${String(startWeek).padStart(2, "0")}`);
  return {
    id: `${year}-S${String(index).padStart(2, "0")}`,
    year,
    index,
    startsAt,
    endsAt: startsAt + LIVEOPS_PASS_DAYS * 86_400_000,
  };
}

export function liveopsBracket(empireLevel: number): string {
  if (empireLevel < 5) return "Lv 1–4";
  if (empireLevel < 9) return "Lv 5–8";
  if (empireLevel < 13) return "Lv 9–12";
  if (empireLevel < 17) return "Lv 13–16";
  if (empireLevel < 21) return "Lv 17–20";
  return "Lv 21–24";
}
