// Trace the 35 numbered hexes in referencemap.png into polygons.
// Tight brown match + 1px erode, connected components, then match each blob
// to the numbered-map identity via expected centers (the layout cx/cy seeds
// sit off the painted parcels and were stealing neighbors).
//
//   node scripts/trace-hexes.mjs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = join(root, "referencemap.png");
const ART = join(root, "apps/web/public/map/variants/spring-day.png");
const LAYOUT = join(root, "apps/web/public/map/hexes.json");
const SVG_PATH = join(root, "apps/web/public/map/map.svg");
const OUT_DIR = join(root, ".tmp-xlsx");
const GAME_W = 1672;
const GAME_H = 941;

const refPng = PNG.sync.read(readFileSync(REF));
const W = refPng.width;
const H = refPng.height;
const n = W * H;
const layout = JSON.parse(readFileSync(LAYOUT, "utf8"));

function isHexBrown(r, g, b) {
  const dr = r - 71, dg = g - 53, db = b - 43;
  return dr * dr + dg * dg + db * db < 28 * 28;
}

const raw = new Uint8Array(n);
for (let i = 0; i < n; i++) {
  const o = i * 4;
  raw[i] = isHexBrown(refPng.data[o], refPng.data[o + 1], refPng.data[o + 2]) ? 1 : 0;
}

function erode(src) {
  const dst = new Uint8Array(n);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (src[i] && src[i - 1] && src[i + 1] && src[i - W] && src[i + W]) dst[i] = 1;
    }
  }
  return dst;
}

const mask = erode(raw);

const labels = new Int32Array(n).fill(-1);
const comps = [];
for (let i = 0; i < n; i++) {
  if (!mask[i] || labels[i] !== -1) continue;
  const cid = comps.length;
  let area = 0, sx = 0, sy = 0, minX = W, minY = H, maxX = 0, maxY = 0;
  const stack = [i];
  labels[i] = cid;
  while (stack.length) {
    const p = stack.pop();
    const x = p % W, y = (p - x) / W;
    area++; sx += x; sy += y;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    for (const q of [p - 1, p + 1, p - W, p + W]) {
      if (q < 0 || q >= n) continue;
      if (mask[q] && labels[q] === -1) {
        labels[q] = cid;
        stack.push(q);
      }
    }
  }
  comps.push({ cid, area, cx: sx / area, cy: sy / area, minX, minY, maxX, maxY });
}

const blobs = comps.filter((c) => c.area >= 4000).sort((a, b) => b.area - a.area);
console.log(`large blobs: ${blobs.length}`);
for (const b of blobs) {
  console.log(`  cid=${b.cid} area=${b.area} c=(${b.cx.toFixed(1)},${b.cy.toFixed(1)}) box=${b.maxX - b.minX + 1}x${b.maxY - b.minY + 1}`);
}

// Numbered-map centers (from a prior seed-flood pass + the labeled reference).
// Used only to bind a blob to a hex id; the polygon itself comes from the blob.
const EXPECTED = {
  1: [903, 191],
  2: [1461, 198],
  3: [526, 240],
  4: [781, 245],
  5: [1370, 215],
  6: [1464, 308],
  7: [649, 307],
  8: [903, 312],
  9: [1163, 324],
  10: [516, 370],
  11: [770, 365],
  12: [1031, 383],
  13: [1297, 393],
  14: [642, 439],
  15: [378, 435],
  16: [900, 400],
  17: [1163, 454],
  18: [241, 494],
  19: [509, 502],
  20: [1029, 518],
  21: [1290, 500],
  22: [372, 561],
  23: [1430, 586],
  24: [237, 619],
  25: [503, 627],
  26: [1026, 648],
  27: [1297, 650],
  28: [368, 686],
  29: [634, 691],
  30: [894, 707],
  31: [501, 751],
  32: [764, 762],
  33: [1291, 773],
  34: [1024, 771],
  35: [1156, 831],
};

const unused = blobs.map((_, i) => i);
const byId = {};
for (const id of Object.keys(EXPECTED)) {
  const [ex, ey] = EXPECTED[id];
  let best = -1, bestD = Infinity;
  for (const i of unused) {
    const b = blobs[i];
    const d = (b.cx - ex) ** 2 + (b.cy - ey) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  if (best < 0) continue;
  const dist = Math.sqrt(bestD);
  if (dist > 90) {
    console.warn(`hex ${id}: nearest blob ${dist.toFixed(1)}px away, skipped`);
    continue;
  }
  unused.splice(unused.indexOf(best), 1);
  byId[id] = { ...blobs[best], dist };
}

console.log("\nassignment:");
for (let id = 1; id <= 35; id++) {
  const b = byId[String(id)];
  if (!b) console.log(`  #${id} MISSING`);
  else console.log(`  #${id} dist=${b.dist.toFixed(1)} c=(${b.cx.toFixed(1)},${b.cy.toFixed(1)}) area=${b.area}`);
}
console.log(`unmatched blobs: ${unused.length}`);
for (const i of unused) {
  const b = blobs[i];
  console.log(`  leftover cid=${b.cid} c=(${b.cx.toFixed(1)},${b.cy.toFixed(1)}) area=${b.area}`);
}

// Grow each assigned region back onto the original brown mask (recover outline).
const grown = new Int32Array(n).fill(-1);
for (const [id, b] of Object.entries(byId)) {
  for (let y = b.minY; y <= b.maxY; y++) {
    for (let x = b.minX; x <= b.maxX; x++) {
      const i = y * W + x;
      if (labels[i] === b.cid) grown[i] = Number(id);
    }
  }
}
for (let pass = 0; pass < 3; pass++) {
  const next = Int32Array.from(grown);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (grown[i] !== -1 || !raw[i]) continue;
      const hit = [grown[i - 1], grown[i + 1], grown[i - W], grown[i + W]].find((v) => v !== -1);
      if (hit != null) next[i] = hit;
    }
  }
  grown.set(next);
}

function verticesFor(_id, cx, cy, bbox) {
  // 2nd–98th percentile extents ignore thin protrusions (hex 11 grew a spike
  // toward the central towers). Grow 6% so the vector covers the cream outline.
  const xs = [];
  const ys = [];
  for (let y = bbox.minY; y <= bbox.maxY; y++) {
    for (let x = bbox.minX; x <= bbox.maxX; x++) {
      if (labels[y * W + x] !== bbox.cid) continue;
      xs.push(x);
      ys.push(y);
    }
  }
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  const at = (arr, p) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(arr.length * p)))];
  const A = ((at(xs, 0.98) - at(xs, 0.02)) / 2) * 1.06;
  const B = ((at(ys, 0.98) - at(ys, 0.02)) / 2) * 1.06;
  return [
    [Math.round(cx + A), Math.round(cy)],
    [Math.round(cx + A / 2), Math.round(cy + B)],
    [Math.round(cx - A / 2), Math.round(cy + B)],
    [Math.round(cx - A), Math.round(cy)],
    [Math.round(cx - A / 2), Math.round(cy - B)],
    [Math.round(cx + A / 2), Math.round(cy - B)],
  ];
}

const assigned = [];
for (let nId = 1; nId <= 35; nId++) {
  const id = String(nId);
  const b = byId[id];
  if (!b) continue;
  const hex = layout.hexes.find((h) => h.id === id);
  const pts = verticesFor(id, b.cx, b.cy, b);
  const a = Math.max(...pts.map((p) => Math.abs(p[0] - b.cx)));
  const bb = Math.max(...pts.map((p) => Math.abs(p[1] - b.cy)));
  assigned.push({
    id,
    cx: hex.cx,
    cy: hex.cy,
    refX: Math.round(b.cx),
    refY: Math.round(b.cy),
    points: pts,
    paintedA: Math.round(a),
    paintedB: Math.round(bb),
    area: b.area,
  });
}

mkdirSync(OUT_DIR, { recursive: true });

function drawPoly(png, pts, color) {
  const w = png.width, h = png.height;
  const set = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    png.data[i] = color[0]; png.data[i + 1] = color[1]; png.data[i + 2] = color[2]; png.data[i + 3] = 255;
  };
  for (let k = 0; k < pts.length; k++) {
    const [x1, y1] = pts[k], [x2, y2] = pts[(k + 1) % pts.length];
    const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 2));
    for (let s = 0; s <= steps; s++) {
      const x = Math.round(x1 + ((x2 - x1) * s) / steps);
      const y = Math.round(y1 + ((y2 - y1) * s) / steps);
      set(x, y); set(x + 1, y); set(x, y + 1);
    }
  }
}

const refOut = PNG.sync.read(readFileSync(REF));
const artOut = PNG.sync.read(readFileSync(ART));
for (const a of assigned) {
  drawPoly(refOut, a.points, [255, 40, 200]);
  drawPoly(artOut, a.points, [255, 40, 200]);
  const i = (a.refY * W + a.refX) * 4;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = a.refX + dx, y = a.refY + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const o = (y * W + x) * 4;
      artOut.data[o] = 255; artOut.data[o + 1] = 40; artOut.data[o + 2] = 200; artOut.data[o + 3] = 255;
      refOut.data[o] = 255; refOut.data[o + 1] = 40; refOut.data[o + 2] = 200; refOut.data[o + 3] = 255;
    }
  }
}
writeFileSync(join(OUT_DIR, "trace-ref.png"), PNG.sync.write(refOut));
writeFileSync(join(OUT_DIR, "trace-art.png"), PNG.sync.write(artOut));
writeFileSync(join(OUT_DIR, "trace-assigned.json"), JSON.stringify(assigned, null, 2));
console.log(`traced ${assigned.length}/35  overlays in ${OUT_DIR}`);

if (assigned.length === 35 && process.argv.includes("--write")) {
  const next = {
    width: GAME_W,
    height: GAME_H,
    hexes: assigned.map((a) => ({
      id: a.id,
      cx: a.cx,
      cy: a.cy,
      refX: a.refX,
      refY: a.refY,
      points: a.points,
      paintedA: a.paintedA,
      paintedB: a.paintedB,
    })),
  };
  writeFileSync(LAYOUT, JSON.stringify(next, null, 1) + "\n");

  const pathD = (pts) => {
    const [h, ...rest] = pts;
    return `M${h[0]} ${h[1]} ` + rest.map((p) => `L${p[0]} ${p[1]}`).join(" ") + " Z";
  };
  const groups = assigned
    .map(
      (a) => `  <g id="hex-${a.id}" class="hex" data-hex="${a.id}">
    <path d="${pathD(a.points)}"/>
  </g>`,
    )
    .join("\n");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GAME_W} ${GAME_H}" width="${GAME_W}" height="${GAME_H}">
  <defs>
    <style>
      .hex path { fill: rgba(0,0,0,0.001); stroke: none; pointer-events: fill; }
      .hex:hover path { fill: rgba(90, 74, 56, 0.42); stroke: #efe6d2; stroke-width: 2.5; }
    </style>
  </defs>
${groups}
</svg>
`;
  writeFileSync(SVG_PATH, svg);
  console.log(`wrote ${LAYOUT} and ${SVG_PATH}`);
}
