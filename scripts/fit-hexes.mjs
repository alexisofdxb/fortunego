// Refines hex geometry by direct 2D fitting: for each hex, coordinate-descent
// on (cx, cy, a, b) maximizing the fraction of the hexagon's interior that is
// plot-colored. Starting from the current hexes.json seeds (inside the painted
// plots), the local optimum lands on the true painted boundary — adjacent
// plots share the palette, so the cream outline between them stops the growth.
//
//   node scripts/fit-hexes.mjs [map.png]

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

// Tolerant plot classifier: uniform olive interior + its darker border gradient,
// but NOT grass (bright/green hue) and NOT cream outlines (low sat, bright).
const plotClass = new Uint8Array(W * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const [h, s, v] = hsv(png.data[i], png.data[i + 1], png.data[i + 2]);
    const plot = h >= 25 && h <= 80 && s >= 0.15 && s <= 0.7 && v >= 0.12 && v <= 0.66;
    plotClass[y * W + x] = plot ? 1 : 0;
  }
}

/** Ray from center at angle -> intersection distance with the hexagon edge. */
function hexRadiusAt(theta, a, b) {
  // Flat-top hexagon vertices at angles 0,60,...,300 degrees.
  let best = Infinity;
  const dx = Math.cos(theta), dy = Math.sin(theta);
  const vtx = [];
  for (let k = 0; k < 6; k++) {
    const ang = (Math.PI / 3) * k;
    vtx.push([a * Math.cos(ang), b * Math.sin(ang)]);
  }
  for (let k = 0; k < 6; k++) {
    const [x1, y1] = vtx[k], [x2, y2] = vtx[(k + 1) % 6];
    const ex = x2 - x1, ey = y2 - y1;
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) < 1e-9) continue;
    const t = (x1 * ey - y1 * ex) / denom;
    const u = (x1 * dy - y1 * dx) / denom * -1;
    if (t > 0 && u >= -1e-9 && u <= 1 + 1e-9 && t < best) best = t;
  }
  return best;
}

function plotAt(x, y) {
  const xi = Math.round(x), yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= W || yi >= H) return 0;
  return plotClass[yi * W + xi];
}

/**
 * Interior plot fraction + edge alignment: the hexagon boundary should run
 * along the cream outline — just inside is plot, just outside is not.
 * The edge term stops the shrink-into-interior failure mode.
 */
function hexScore(cx, cy, a, b) {
  const step = 7;
  let inside = 0, plot = 0;
  for (let y = Math.max(0, cy - b); y <= Math.min(H - 1, cy + b); y += step) {
    const dy = Math.abs(y - cy) / b;
    if (dy >= 1) continue;
    const halfW = a * (1 - dy);
    for (let x = Math.max(0, cx - halfW); x <= Math.min(W - 1, cx + halfW); x += step) {
      inside++;
      if (plotClass[y * W + Math.round(x)]) plot++;
    }
  }
  if (inside < 20) return -1;
  const interiorFrac = plot / inside;

  let edge = 0, edgeN = 0;
  for (let k = 0; k < 48; k++) {
    const theta = (Math.PI * 2 * k) / 48;
    const r = hexRadiusAt(theta, a, b);
    if (!isFinite(r)) continue;
    const ux = Math.cos(theta), uy = Math.sin(theta);
    const inPt = plotAt(cx + ux * r * 0.88, cy + uy * r * 0.88);
    const outPt = plotAt(cx + ux * r * 1.14, cy + uy * r * 1.14);
    edgeN++;
    if (inPt === 1 && outPt === 0) edge++;
  }
  const edgeScore = edgeN ? edge / edgeN : 0;
  return 0.45 * interiorFrac + 0.55 * edgeScore - a * b * 0.00001;
}

function fitOne(seed) {
  let { cx, cy, a, b } = seed;
  const sx = seed.cx, sy = seed.cy;
  let step = 8;
  for (let round = 0; round < 9; round++) {
    const candidates = [
      [cx + step, cy, a, b], [cx - step, cy, a, b],
      [cx, cy + step, a, b], [cx, cy - step, a, b],
      [cx, cy, a + step, b], [cx, cy, Math.max(60, a - step), b],
      [cx, cy, a, b + step], [cx, cy, a, Math.max(38, b - step)],
    ];
    let bestScore = hexScore(cx, cy, a, b);
    let best = null;
    for (const c of candidates) {
      if (Math.abs(c[0] - sx) > 75 || Math.abs(c[1] - sy) > 75) continue;
      if (c[2] > 135 || c[3] > 95) continue;
      const s = hexScore(c[0], c[1], c[2], c[3]);
      if (s > bestScore + 1e-6) {
        bestScore = s;
        best = c;
      }
    }
    if (best) {
      [cx, cy, a, b] = best;
    } else {
      step /= 2;
      if (step < 1) break;
    }
  }
  return { cx, cy, a, b, score: hexScore(cx, cy, a, b) };
}

const layout = JSON.parse(readFileSync(LAYOUT, "utf8"));
let low = [];
for (const hex of layout.hexes) {
  const seed = {
    cx: hex.refX ?? hex.cx,
    cy: hex.refY ?? hex.cy,
    a: hex.paintedA ?? 95,
    b: hex.paintedB ?? 60,
  };
  const fit = fitOne(seed);
  hex.refX = Math.round(fit.cx);
  hex.refY = Math.round(fit.cy);
  hex.paintedA = Math.round(fit.a);
  hex.paintedB = Math.round(fit.b);
  if (fit.score < 0.55) low.push(`${hex.id}:${fit.score.toFixed(2)}`);
}
writeFileSync(LAYOUT, JSON.stringify(layout, null, 1));
console.log(`fitted 35 hexes; low-confidence fits (<0.55): ${low.join(" ") || "none"}`);

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
for (const h of layout.hexes) drawHex(h.refX, h.refY, h.paintedA, h.paintedB);
writeFileSync(".tmp-xlsx/fit-overlay.png", PNG.sync.write(out));
console.log("wrote .tmp-xlsx/fit-overlay.png");
