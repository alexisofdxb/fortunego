// Regenerates the invisible interaction hexes in public/map/map.svg so they
// sit on the painted parcel centers (refX/refY in hexes.json) instead of the
// uniform math grid (cx/cy). The painted plots are wider than the grid hexes,
// so the half-extents are scaled up accordingly. Run:
//   node scripts/regen-map-svg.mjs
// Tweak A/B below if the highlight edges need to grow/shrink against the art.

import { readFileSync, writeFileSync } from "node:fs";

const LAYOUT_PATH = "apps/web/public/map/hexes.json";
const SVG_PATH = "apps/web/public/map/map.svg";

// Fallback half-extents only — measured per-hex values (paintedA/paintedB,
// produced by scripts/measure-hexes.mjs) are used when present.
const FALLBACK_A = 92;
const FALLBACK_B = 58;

const layout = JSON.parse(readFileSync(LAYOUT_PATH, "utf8"));
let svg = readFileSync(SVG_PATH, "utf8");

let touched = 0;
for (const h of layout.hexes) {
  const cx = h.refX ?? h.cx;
  const cy = h.refY ?? h.cy;
  const A = h.paintedA ?? FALLBACK_A;
  const B = h.paintedB ?? FALLBACK_B;
  const d = [
    `M${cx - A} ${cy}`,
    `L${cx - A / 2} ${cy - B}`,
    `L${cx + A / 2} ${cy - B}`,
    `L${cx + A} ${cy}`,
    `L${cx + A / 2} ${cy + B}`,
    `L${cx - A / 2} ${cy + B}`,
    "Z",
  ].join(" ");
  const re = new RegExp(`(<g id="hex-${h.id}"[^>]*>)[\\s\\S]*?(<\\/g>)`);
  if (!re.test(svg)) {
    console.warn(`hex-${h.id}: group not found, skipped`);
    continue;
  }
  svg = svg.replace(
    re,
    (_m, open) =>
      `${open}\n    <path d="${d}"/>\n    <text x="${cx}" y="${cy + 8}">${h.id}</text>\n    <use class="lock" href="#lock" x="${cx + 16}" y="${cy - 24}" width="24" height="28"/>\n  </g>`,
  );
  touched += 1;
}

writeFileSync(SVG_PATH, svg);
console.log(`regenerated ${touched}/${layout.hexes.length} hexes in ${SVG_PATH}`);
