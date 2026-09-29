// Measures painted hex plot extents from the map art via 1D density profiles.
//
// The hand-marked refX/refY (painted centers from the reference map) are the
// seeds. For each hex we scan a horizontal column-profile and vertical
// row-profile of the plot-pixel density in a band around the seed: the plot
// forms a high plateau, the cream outline between plots forms a valley.
// Plateau edges give per-hex half-extents (paintedA/paintedB); the plateau
// midpoint lightly corrects the center. Aggregation over a band makes this
// robust to tree sprites and plot texture holes.
//
//   node scripts/measure-hexes.mjs [map.png]

import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

const MAP = process.argv[2] ?? "apps/web/public/map/variants/spring-day.png";
const LAYOUT = "apps/web/public/map/hexes.json";

const png = PNG.sync.read(readFileSync(MAP));
const W = png.width;
const H = png.height;

function hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

function isPlot(x, y) {
  if (x < 0 || y < 0 || x >= W || y >= H) return false;
  const i = (y * W + x) * 4;
  const [h, s, v] = hsv(png.data[i], png.data[i + 1], png.data[i + 2]);
  return h >= 40 && h <= 75 && s >= 0.28 && s <= 0.6 && v >= 0.18 && v <= 0.55;
}

// Integral image of the mask.
const integral = new Float64Array((W + 1) * (H + 1));
for (let y = 1; y <= H; y++) {
  let rowSum = 0;
  for (let x = 1; x <= W; x++) {
    if (isPlot(x - 1, y - 1)) rowSum++;
    integral[y * (W + 1) + x] = integral[(y - 1) * (W + 1) + x] + rowSum;
  }
}
function density(x0, y0, x1, y1) {
  const cx0 = Math.max(0, Math.min(Math.round(x0), W));
  const cx1 = Math.max(0, Math.min(Math.round(x1), W));
  const cy0 = Math.max(0, Math.min(Math.round(y0), H));
  const cy1 = Math.max(0, Math.min(Math.round(y1), H));
  return integral[cy1 * (W + 1) + cx1] - integral[cy0 * (W + 1) + cx1] - integral[cy1 * (W + 1) + cx0] + integral[cy0 * (W + 1) + cx0];
}

/**
 * Find the high-density plateau containing/near `seed` along an axis.
 * `fixed` is the cross-axis center; band is the cross-axis half-width.
 * Returns { start, end, peak } in pixel coords along the scan axis.
 */
function plateau(seed, fixed, band, axis, hardMin, softMin) {
  const profile = [];
  for (let t = -140; t <= 140; t++) {
    const x = axis === "x" ? seed + t : fixed;
    const y = axis === "x" ? fixed : seed + t;
    const count =
      axis === "x"
        ? density(x - 1, fixed - band, x + 1, fixed + band)
        : density(fixed - band, y - 1, fixed + band, y + 1);
    profile.push({ t, count });
  }
  // Peak near the seed.
  let peak = profile[0];
  for (const p of profile) if (p.count > peak.count) peak = p;
  if (peak.count < hardMin) return null;
  // Expand from the peak while counts stay meaningful.
  let i0 = peak.t;
  while (i0 > -140 && (profile[i0 + 140].count >= softMin || profile[i0 + 139].count >= softMin)) i0--;
  let i1 = peak.t;
  while (i1 < 140 && (profile[i1 + 140].count >= softMin || profile[i1 + 141].count >= softMin)) i1++;
  return { start: seed + i0, end: seed + i1, peak: peak.t, peakCount: peak.count };
}

const layout = JSON.parse(readFileSync(LAYOUT, "utf8"));
const results = [];
let failures = [];

for (const hex of layout.hexes) {
  const sx = hex.refX ?? hex.cx;
  const sy = hex.refY ?? hex.cy;
  const col = plateau(sx, sy, 55, "x", 60, 25);
  const row = plateau(sy, sx, 85, "y", 60, 25);
  if (!col || !row) {
    failures.push(hex.id);
    results.push({ id: hex.id, cx: sx, cy: sy, a: null, b: null });
    continue;
  }
  // Lightly correct the center toward the plateau midpoint (bounded).
  let cx = (col.start + col.end) / 2;
  let cy = (row.start + row.end) / 2;
  cx = sx + Math.max(-30, Math.min(30, cx - sx));
  cy = sy + Math.max(-30, Math.min(30, cy - sy));
  results.push({ id: hex.id, cx, cy, a: (col.end - col.start) / 2, b: (row.end - row.start) / 2 });
}

// Median extents for fallback / sanity clamp.
const as = results.filter((r) => r.a).map((r) => r.a).sort((x, y) => x - y);
const bs = results.filter((r) => r.b).map((r) => r.b).sort((x, y) => x - y);
const medA = as[Math.floor(as.length / 2)] ?? 88;
const medB = bs[Math.floor(bs.length / 2)] ?? 56;

for (const r of results) {
  const hex = layout.hexes.find((h) => h.id === r.id);
  hex.refX = Math.round(r.cx);
  hex.refY = Math.round(r.cy);
  const a = r.a ?? medA;
  const b = r.b ?? medB;
  // Clamp outliers toward the median — one merged plateau shouldn't balloon.
  hex.paintedA = Math.round(Math.min(Math.max(a, medA * 0.8), medA * 1.25));
  hex.paintedB = Math.round(Math.min(Math.max(b, medB * 0.8), medB * 1.25));
}
writeFileSync(LAYOUT, JSON.stringify(layout, null, 1));
console.log(`measured ${35 - failures.length}/35; failures: ${failures.join(",") || "none"}`);
console.log(`median extents a=${medA} b=${medB}`);

// Verification overlay.
const out = PNG.sync.read(readFileSync(MAP));
function setPx(x, y) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  out.data[i] = 255; out.data[i + 1] = 40; out.data[i + 2] = 200; out.data[i + 3] = 255;
}
function drawHex(cx, cy, a, b) {
  const pts = [];
  for (let k = 0; k < 6; k++) {
    const ang = (Math.PI / 3) * k;
    pts.push([cx + a * Math.cos(ang), cy + b * Math.sin(ang)]);
  }
  for (let k = 0; k < 6; k++) {
    const [x1, y1] = pts[k], [x2, y2] = pts[(k + 1) % 6];
    const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1)) * 2;
    for (let s = 0; s <= steps; s++) {
      setPx(Math.round(x1 + ((x2 - x1) * s) / steps), Math.round(y1 + ((y2 - y1) * s) / steps));
      setPx(Math.round(x1 + ((x2 - x1) * s) / steps) + 1, Math.round(y1 + ((y2 - y1) * s) / steps));
    }
  }
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) setPx(Math.round(cx) + dx, Math.round(cy) + dy);
}
for (const h of layout.hexes) drawHex(h.refX, h.refY, h.paintedA * 0.97, h.paintedB * 0.97);
writeFileSync(".tmp-xlsx/measure-overlay.png", PNG.sync.write(out));
console.log("wrote .tmp-xlsx/measure-overlay.png");
