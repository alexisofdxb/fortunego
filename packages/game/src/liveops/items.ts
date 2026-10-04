import catalog from "./items.json";

export type LiveopsItemCategory = "Crafting" | "Permit" | "Ticket" | "Boost" | "Collectible" | "Cosmetic" | "Key";
export type LiveopsItemRarity = "Common" | "Rare" | "Epic" | "Legendary" | "Variable";

export type LiveopsItem = {
  id: string;
  name: string;
  category: LiveopsItemCategory;
  rarity: LiveopsItemRarity;
  icon: string;
  stackable: boolean;
  tradable: boolean;
  notes: string;
};

export const LIVEOPS_ITEMS: readonly LiveopsItem[] = catalog as LiveopsItem[];

const BY_ID = new Map(LIVEOPS_ITEMS.map((item) => [item.id, item]));

export function liveopsItem(id: string): LiveopsItem | undefined {
  return BY_ID.get(id);
}

export function requireLiveopsItem(id: string): LiveopsItem {
  const item = BY_ID.get(id);
  if (!item) throw new Error(`Unknown liveops item ${id}`);
  return item;
}

/** Duplicate module salvage → Module Shards (workbook Pity & Duplicates). */
export const DUPLICATE_SHARD_YIELD: Record<"common" | "rare" | "epic" | "legendary", number> = {
  common: 5,
  rare: 20,
  epic: 80,
  legendary: 250,
};
