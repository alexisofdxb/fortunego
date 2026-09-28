// ---------------------------------------------------------------------------
// Hex board geometry — the canonical 35-hex layout is hex_layout.json (trimmed
// copy of apps/web/public/map/hexes.json). Pure functions only; consumed by
// the hex placement engine, the API validation, and (later) the web board.
// ---------------------------------------------------------------------------

import layout from "./hex_layout.json";

export type HexDef = {
  id: string;
  row: number;
  col: number;
  cx: number;
  cy: number;
};

export type HexStage = "humble" | "starter" | "growing" | "established" | "elite" | "tycoon";

export const HEXES: readonly HexDef[] = layout.hexes;
export const HEX_COUNT = HEXES.length;

const BY_ID = new Map<string, HexDef>(HEXES.map((hex) => [hex.id, hex]));

/** Concentric center-out order: distance from the layout centroid, tie-broken by id. */
const CENTROID = HEXES.reduce(
  (acc, hex) => ({ cx: acc.cx + hex.cx / HEXES.length, cy: acc.cy + hex.cy / HEXES.length }),
  { cx: 0, cy: 0 },
);

export const RING_ORDER: readonly string[] = Object.freeze(
  [...HEXES]
    .sort((a, b) => {
      const da = Math.hypot(a.cx - CENTROID.cx, a.cy - CENTROID.cy);
      const db = Math.hypot(b.cx - CENTROID.cx, b.cy - CENTROID.cy);
      return da - db || a.id.localeCompare(b.id);
    })
    .map((hex) => hex.id),
);

/** Ring index per hex id (0 = center hex, 34 = outermost). */
export const HEX_RING: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(RING_ORDER.map((id, index) => [id, index])),
);

/** Unlocked hex counts by empire stage (plan: single source of truth, retunable). */
export const HEX_UNLOCK_BY_STAGE: Readonly<Record<HexStage, number>> = Object.freeze({
  humble: 6,
  starter: 11,
  growing: 17,
  established: 23,
  elite: 29,
  tycoon: 35,
});

export const HEX_STAGES: readonly HexStage[] = ["humble", "starter", "growing", "established", "elite", "tycoon"];

export function hexById(id: string): HexDef | undefined {
  return BY_ID.get(id);
}

export function isHexId(id: string): boolean {
  return BY_ID.has(id);
}

/** First N hexes of the ring order unlocked at a stage. */
export function unlockedHexIds(stage: HexStage): readonly string[] {
  const count = HEX_UNLOCK_BY_STAGE[stage];
  return count == null ? [] : RING_ORDER.slice(0, count);
}

/** The stage at which a hex becomes unlocked (for "expand your territory" errors). */
export function stageUnlockingHex(id: string): HexStage | null {
  if (!BY_ID.has(id)) return null;
  for (const stage of HEX_STAGES) if (HEX_RING[id]! < HEX_UNLOCK_BY_STAGE[stage]) return stage;
  return null;
}

// --- Adjacency -------------------------------------------------------------
// The layout stores hexes as bands of rows with alternating col offsets, so a
// neighbor offset table is fragile. Instead, adjacency is derived once from
// pixel geometry: two hexes are neighbors iff their center distance is below
// 0.75 × the maximum same-band (same row) center spacing. Computed once and
// symmetric by construction (max observed degree: 6).

function buildAdjacency(): Readonly<Record<string, readonly string[]>> {
  // Pixel-derived layouts can be irregular (AI art): use k-nearest capped at 6
  // with a distance sanity bound, symmetrized by union of both directions.
  let maxSameBandSpacing = 0;
  for (let i = 0; i < HEXES.length; i++) {
    for (let j = i + 1; j < HEXES.length; j++) {
      const a = HEXES[i]!;
      const b = HEXES[j]!;
      if (a.row !== b.row) continue;
      const spacing = Math.hypot(a.cx - b.cx, a.cy - b.cy);
      if (spacing > 0 && spacing < 300) maxSameBandSpacing = Math.max(maxSameBandSpacing, spacing);
    }
  }
  // Distance alone cannot split neighbors from next-nearest (dense irregular
  // packing): select neighbors ANGULARLY -- true hex neighbors each occupy
  // their own ~60-degree sector around a hex. Take candidates within a sanity
  // radius, walk them sorted by angle, and keep one per >=40-degree sector.
  const bound = Math.max(maxSameBandSpacing * 1.15, 150);
  const pick = new Map<string, Set<string>>(HEXES.map((hex) => [hex.id, new Set()]));
  for (const hex of HEXES) {
    const candidates = HEXES
      .filter((other) => other.id !== hex.id)
      .map((other) => ({ id: other.id, d: Math.hypot(hex.cx - other.cx, hex.cy - other.cy), a: Math.atan2(other.cy - hex.cy, other.cx - hex.cx) }))
      .filter((entry) => entry.d < bound)
      .sort((p, q) => p.d - q.d);
    const chosenAngles: number[] = [];
    for (const entry of candidates) {
      if (pick.get(hex.id)!.size >= 6) break;
      const tooClose = chosenAngles.some((a) => {
        let diff = Math.abs(a - entry.a) % (Math.PI * 2);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        return diff < (40 * Math.PI) / 180;
      });
      if (!tooClose) {
        chosenAngles.push(entry.a);
        pick.get(hex.id)!.add(entry.id);
      }
    }
  }
  // Symmetrize (union), then prune any overflow past 6 by longest edge.
  const neighbors = new Map<string, Set<string>>(HEXES.map((hex) => [hex.id, new Set()]));
  for (const hex of HEXES) for (const id of pick.get(hex.id)!) {
    neighbors.get(hex.id)!.add(id);
    neighbors.get(id)!.add(hex.id);
  }
  for (const hex of HEXES) {
    const list = neighbors.get(hex.id)!;
    if (list.size > 6) {
      const dist = (id: string) => Math.hypot((BY_ID.get(id) as { cx: number; cy: number }).cx - hex.cx, (BY_ID.get(id) as { cx: number; cy: number }).cy - hex.cy);
      const sorted = [...list].sort((a, b) => dist(b) - dist(a));
      for (const drop of sorted.slice(0, list.size - 6)) {
        list.delete(drop);
        neighbors.get(drop)!.delete(hex.id);
      }
    }
  }
  return Object.freeze(
    Object.fromEntries([...neighbors.entries()].map(([id, set]) => [id, Object.freeze([...set].sort())])),
  );
}

const ADJACENCY = buildAdjacency();

/** The (≤6) hexes adjacent to `id`; empty array for unknown ids. */
export function hexNeighbors(id: string): readonly string[] {
  return ADJACENCY[id] ?? [];
}

/** Shortest path length between two hexes over the adjacency graph (BFS). */
export function hexDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!ADJACENCY[a] || !ADJACENCY[b]) return Number.POSITIVE_INFINITY;
  const seen = new Set<string>([a]);
  let frontier = [a];
  let distance = 0;
  while (frontier.length) {
    distance += 1;
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbor of ADJACENCY[id]!) {
        if (neighbor === b) return distance;
        if (!seen.has(neighbor)) {
          seen.add(neighbor);
          next.push(neighbor);
        }
      }
    }
    frontier = next;
  }
  return Number.POSITIVE_INFINITY;
}
