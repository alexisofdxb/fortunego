/** Shared world hex grid. Each founder occupies one region; visiting is travel to that cell. */

export const WORLD_MAX_RING = 5;
export const WORLD_HEX_SIZE = 32;

export type WorldCell = {
  id: string;
  q: number;
  r: number;
  ring: number;
  label: string;
  x: number;
  y: number;
};

const AXIAL_DIRS: readonly [number, number][] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

export function worldHexPixel(q: number, r: number, size = WORLD_HEX_SIZE): { x: number; y: number } {
  return {
    x: size * (1.5 * q),
    y: size * (Math.sqrt(3) * (r + q / 2)),
  };
}

export function worldHexCorners(cx: number, cy: number, size = WORLD_HEX_SIZE): number[][] {
  const pts: number[][] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i);
    pts.push([cx + size * Math.cos(angle), cy + size * Math.sin(angle)]);
  }
  return pts;
}

function cellsInSpiral(maxRing: number): WorldCell[] {
  const cells: WorldCell[] = [];
  const push = (q: number, r: number, ring: number, index: number) => {
    const { x, y } = worldHexPixel(q, r);
    cells.push({
      id: `${q}:${r}`,
      q,
      r,
      ring,
      label: `${String.fromCharCode(65 + ring)}${String(index + 1).padStart(2, "0")}`,
      x,
      y,
    });
  };
  push(0, 0, 0, 0);
  for (let ring = 1; ring <= maxRing; ring++) {
    let q = AXIAL_DIRS[4]![0] * ring;
    let r = AXIAL_DIRS[4]![1] * ring;
    let index = 0;
    for (let dir = 0; dir < 6; dir++) {
      const [dq, dr] = AXIAL_DIRS[dir]!;
      for (let step = 0; step < ring; step++) {
        push(q, r, ring, index);
        index += 1;
        q += dq;
        r += dr;
      }
    }
  }
  return cells;
}

export const WORLD_CELLS: readonly WorldCell[] = cellsInSpiral(WORLD_MAX_RING);

const BY_ID = new Map(WORLD_CELLS.map((cell) => [cell.id, cell]));

export function worldCell(id: string): WorldCell | undefined {
  return BY_ID.get(id);
}

export const WORLD_VIEW = (() => {
  const xs = WORLD_CELLS.map((cell) => cell.x);
  const ys = WORLD_CELLS.map((cell) => cell.y);
  const pad = WORLD_HEX_SIZE * 2;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const maxX = Math.max(...xs) + pad;
  const maxY = Math.max(...ys) + pad;
  return { minX, minY, width: maxX - minX, height: maxY - minY };
})();
