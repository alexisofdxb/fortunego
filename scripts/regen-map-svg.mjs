// Regenerates public/map/map.svg from the traced polygons in hexes.json.
// Prefer `node scripts/trace-hexes.mjs --write`, which updates both files.
// Run:
//   node scripts/regen-map-svg.mjs

import { readFileSync, writeFileSync } from "node:fs";

const LAYOUT_PATH = "apps/web/public/map/hexes.json";
const SVG_PATH = "apps/web/public/map/map.svg";

const layout = JSON.parse(readFileSync(LAYOUT_PATH, "utf8"));
const W = layout.width ?? 1672;
const H = layout.height ?? 941;

function pathD(h) {
  if (Array.isArray(h.points) && h.points.length >= 3) {
    const [first, ...rest] = h.points;
    return `M${first[0]} ${first[1]} ` + rest.map((p) => `L${p[0]} ${p[1]}`).join(" ") + " Z";
  }
  const cx = h.refX ?? h.cx;
  const cy = h.refY ?? h.cy;
  const A = (h.paintedA ?? 92) * 0.96;
  const B = (h.paintedB ?? 58) * 0.96;
  return `M${cx + A} ${cy} L${cx + A / 2} ${cy + B} L${cx - A / 2} ${cy + B} L${cx - A} ${cy} L${cx - A / 2} ${cy - B} L${cx + A / 2} ${cy - B} Z`;
}

const groups = layout.hexes
  .map(
    (h) => `  <g id="hex-${h.id}" class="hex" data-hex="${h.id}">
    <path d="${pathD(h)}"/>
  </g>`,
  )
  .join("\n");

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
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
console.log(`regenerated ${layout.hexes.length} hexes in ${SVG_PATH}`);
