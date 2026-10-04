import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { CARDS } from "@plotgo/game";
import type { PlotSnapshot } from "@plotgo/shared";
import { useFitPreview, useMove, usePlace } from "../api/hooks";
import { useUiStore } from "../state/ui";
import { CATEGORY_ART } from "../utils";
import { HexDrawer } from "./HexDrawer";
import { VisitCityDrawer } from "./VisitCityDrawer";
import hexLayout from "../../public/map/hexes.json";

/** Active map variant (day/night x seasons). New variants drop into public/map/variants/. */
type MapVariant = "spring-day";
const MAP_VARIANTS: Record<MapVariant, string> = { "spring-day": "/map/variants/spring-day.png" };

const MAP_W = 1672;
const MAP_H = 941;

type HexGeom = {
  id: string;
  cx: number;
  cy: number;
  refX?: number;
  refY?: number;
  paintedA?: number;
  paintedB?: number;
  points: number[][];
};

const HEX_GEOM: HexGeom[] = (hexLayout as { hexes: HexGeom[] }).hexes;

/**
 * The interactive shape of each parcel — flat-top hexagon fitted to the
 * PAINTED plot (refX/refY/paintedA/paintedB measured from the art), NOT the
 * uniform grid `points`. This keeps the invisible click surface, the
 * highlight glow and the HUD locks all aligned with what the player sees.
 */
function fittedPoints(h: HexGeom): number[][] {
  const cx = h.refX ?? h.cx;
  const cy = h.refY ?? h.cy;
  const a = (h.paintedA ?? 73) * 0.96;
  const b = (h.paintedB ?? 47) * 0.96;
  return [
    [cx - a, cy],
    [cx - a / 2, cy - b],
    [cx + a / 2, cy - b],
    [cx + a, cy],
    [cx + a / 2, cy + b],
    [cx - a / 2, cy + b],
  ];
}

const HEX_SHAPE = new Map(HEX_GEOM.map((h) => [h.id, fittedPoints(h)]));
const HEX_CENTER = new Map(HEX_GEOM.map((h) => [h.id, { x: h.refX ?? h.cx, y: h.refY ?? h.cy }]));
const HEX_EXTENT = new Map(HEX_GEOM.map((h) => [h.id, { a: (h.paintedA ?? 73) * 0.96, b: (h.paintedB ?? 47) * 0.96 }]));

/** Nearest parcel to a point in map coordinates, if within ~1.2 hex-radii. */
function nearestHex(x: number, y: number): string | null {
  let best: string | null = null;
  let bestScore = 1.44; // 1.2² — the whole painted plot plus a margin counts
  for (const [id, c] of HEX_CENTER) {
    const e = HEX_EXTENT.get(id) ?? { a: 70, b: 45 };
    const dx = (x - c.x) / (e.a * 1.15);
    const dy = (y - c.y) / (e.b * 1.15);
    const score = dx * dx + dy * dy;
    if (score < bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

function centerPct(hexId: string): { x: number; y: number } {
  const c = HEX_CENTER.get(hexId);
  return { x: ((c?.x ?? 0) / MAP_W) * 100, y: ((c?.y ?? 0) / MAP_H) * 100 };
}

function pathFromPoints(points: number[][]): string {
  const [first, ...rest] = points;
  if (!first) return "";
  return `M${first[0]} ${first[1]} ${rest.map((p) => `L${p[0]} ${p[1]}`).join(" ")} Z`;
}

function ParcelLock({ open }: { open: boolean }) {
  return (
    <text
      className={`hex-hud-lock${open ? " open" : ""}`}
      textAnchor="middle"
      y="-2"
      fontSize="15"
    >
      {open ? "🔓" : "🔒"}
    </text>
  );
}

export function HexBoard({ plot }: { plot: PlotSnapshot }) {
  const [mapVariant] = useState<MapVariant>("spring-day");
  const backdropSrc = MAP_VARIANTS[mapVariant];
  const viewportRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const placeMode = useUiStore((s) => s.placeMode);
  const moveMode = useUiStore((s) => s.moveMode);
  const visitMode = useUiStore((s) => s.visitMode);
  const drag = useUiStore((s) => s.drag);
  const setToast = useUiStore((s) => s.setToast);
  const setInspectId = useUiStore((s) => s.setInspectId);
  const cancelBoardModes = useUiStore((s) => s.cancelBoardModes);
  const place = usePlace();
  const move = useMove();

  const [drawerHex, setDrawerHex] = useState<string | null>(null);
  const [hoverHex, setHoverHex] = useState<string | null>(null);

  const hexBoard = plot.hexBoard;
  const cityCards = useMemo(
    () =>
      visitMode
        ? visitMode.buildings.map((building) => ({
            id: building.id,
            type: building.type,
            hexId: building.hexId,
            stage: building.stage as 1 | 2 | 3,
          }))
        : plot.cards,
    [visitMode, plot.cards],
  );
  const occupied = useMemo(() => new Map(cityCards.map((card) => [card.hexId, card])), [cityCards]);
  const hexAt = useMemo(() => new Map(hexBoard.hexes.map((hex) => [hex.hexId, hex])), [hexBoard.hexes]);
  const levelLocked = useCallback(
    (hex: { requiredLevel: number }) => hex.requiredLevel > hexBoard.empireLevel,
    [hexBoard.empireLevel],
  );

  const hovered = hoverHex ? hexAt.get(hoverHex) : undefined;
  const fitArgs =
    placeMode && hoverHex && hovered?.owned && !occupied.has(hoverHex)
      ? { hexId: hoverHex, type: placeMode.type }
      : null;
  useFitPreview(fitArgs);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      cancelBoardModes();
      setDrawerHex(null);
      setInspectId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelBoardModes, setInspectId]);

  const onHexClick = useCallback(
    (hexId: string) => {
      const hex = hexAt.get(hexId);
      if (!hex) return;
      if (visitMode) {
        setDrawerHex(hexId);
        return;
      }
      if (placeMode) {
        if (!hex.owned) {
          setToast("Acquire this parcel first");
          return;
        }
        if (occupied.has(hexId)) return;
        place.mutate({ hexId, type: placeMode.type });
        cancelBoardModes();
        return;
      }
      if (moveMode) {
        if (!hex.owned) {
          setToast("Acquire this parcel first");
          return;
        }
        if (occupied.has(hexId)) return;
        move.mutate({ cardId: moveMode.cardId, hexId });
        cancelBoardModes();
        return;
      }
      // Occupied parcels open the inspect drawer (upgrade / modules);
      // empty parcels open the parcel drawer (info / acquire).
      const building = occupied.get(hexId);
      if (building) {
        setDrawerHex(null);
        setInspectId(building.id);
        return;
      }
      setInspectId(null);
      setDrawerHex(hexId);
    },
    [hexAt, occupied, placeMode, moveMode, place, move, setToast, setInspectId, cancelBoardModes, visitMode],
  );

  const onHexEnter = useCallback(
    (hexId: string) => {
      if (!placeMode && !moveMode) return;
      setHoverHex(hexId);
    },
    [placeMode, moveMode],
  );

  // While a card is being dragged, paint the parcel under the pointer —
  // locked / occupied hexes go red before the player lets go.
  useEffect(() => {
    if (!drag) return;
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const x = ((drag.x - r.left) / r.width) * MAP_W;
    const y = ((drag.y - r.top) / r.height) * MAP_H;
    setHoverHex(nearestHex(x, y));
  }, [drag]);

  useEffect(() => {
    if (!placeMode && !moveMode && !drag) setHoverHex(null);
  }, [placeMode, moveMode, drag]);

  const onFrameMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!placeMode && !moveMode) return;
      const svg = svgRef.current;
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * MAP_W;
      const y = ((e.clientY - r.top) / r.height) * MAP_H;
      setHoverHex(nearestHex(x, y));
    },
    [placeMode, moveMode],
  );

  // Clicks anywhere on the map (not only on the exact path) route to the
  // nearest parcel — the whole painted hex is the click/drop target.
  const onFrameClick = useCallback(
    (e: React.MouseEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * MAP_W;
      const y = ((e.clientY - r.top) / r.height) * MAP_H;
      const id = nearestHex(x, y);
      if (id) onHexClick(id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onHexClick],
  );

  return (
    <main className="board-wrap hexboard" id="board-view" data-onboarding-target="board">
      <div className="hex-viewport" ref={viewportRef}>
        <div className="hex-frame" onClick={onFrameClick} onPointerMove={onFrameMove}>
          <img src={backdropSrc} alt="" draggable={false} />
          <svg ref={svgRef} viewBox={`0 0 ${MAP_W} ${MAP_H}`} preserveAspectRatio="none" onPointerLeave={() => setHoverHex(null)}>
            {HEX_GEOM.map((geom) => {
              const hex = hexAt.get(geom.id);
              if (!hex) return null;
              const mid = HEX_CENTER.get(geom.id) ?? { x: geom.cx, y: geom.cy };
              const shape = HEX_SHAPE.get(geom.id) ?? geom.points;
              const classes = ["hex"];
              if (visitMode) classes.push("land-open");
              else classes.push(levelLocked(hex) ? "locked-by-level" : "land-open");
              const targeting = !visitMode && Boolean(placeMode || moveMode);
              if (targeting) {
                const droppable = hex.owned && !occupied.has(hex.hexId);
                if (droppable) classes.push(placeMode ? "hex-valid" : "hex-target");
                else if (hoverHex === hex.hexId) classes.push("hex-blocked");
              }
              if (drawerHex === hex.hexId) classes.push("hex-selected");
              const hasBuilding = occupied.has(hex.hexId);
              const locked = levelLocked(hex);
              const open = hex.frontier && !locked;
              const parcel = hex.parcelId ?? "";
              return (
                <g
                  key={geom.id}
                  id={`hex-${geom.id}`}
                  className={classes.join(" ")}
                  data-hex={geom.id}
                  onPointerEnter={() => onHexEnter(geom.id)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onHexClick(geom.id);
                  }}
                >
                  <path d={pathFromPoints(shape)} />
                  {!hasBuilding ? (
                    <g className="hex-hud" transform={`translate(${mid.x} ${mid.y}) scale(1.85)`} pointerEvents="none">
                      {!visitMode && !hex.owned ? <ParcelLock open={open} /> : null}
                      <text className="hex-hud-tag" y={!visitMode && !hex.owned ? 18 : 4} textAnchor="middle">
                        {parcel}
                      </text>
                    </g>
                  ) : null}
                </g>
              );
            })}
          </svg>

          {cityCards.map((card) => {
            const spec = CARDS[card.type];
            const pos = centerPct(card.hexId);
            const parcel = hexAt.get(card.hexId)?.parcelId ?? card.hexId;
            return (
              <div key={card.id} className="hex-chip" style={{ left: `${pos.x}%`, top: `${pos.y}%` }}>
                <span className="hex-chip-plot">{parcel}</span>
                <span className="hex-chip-medal">{CATEGORY_ART[spec?.category ?? ""] ?? "🏢"}</span>
                <span className="hex-chip-name">{spec?.name ?? card.type}</span>
                <span className="hex-chip-pips">
                  {Array.from({ length: card.stage }, (_, i) => (
                    <i key={i} />
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {drawerHex && visitMode ? (
        <VisitCityDrawer plot={plot} hexId={drawerHex} onClose={() => setDrawerHex(null)} />
      ) : drawerHex ? (
        <HexDrawer plot={plot} hexId={drawerHex} onClose={() => setDrawerHex(null)} />
      ) : null}
    </main>
  );
}
