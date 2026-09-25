import type { Player } from "@prisma/client";

export type AppEnv = {
  Variables: {
    player: Player;
  };
};

export function newId(): string {
  return crypto.randomUUID();
}

/** BigInt -> Number for the wire (all game math fits in a double). */
export function num(value: bigint | number | null | undefined): number {
  return value == null ? 0 : Number(value);
}

export function parseNumberMap(value: unknown): Record<string, number> {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value ?? "{}") : value ?? {};
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).map(([key, item]) => [key, Number(item) || 0]));
  } catch {
    return {};
  }
}

export function parseDays(value: unknown): string[] {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value ?? "[]") : value ?? [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
