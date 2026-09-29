import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CARDS, lineageColor } from "@plotgo/game";
import type { PlotSnapshot } from "@plotgo/shared";
import { useAcquireLand, useFitPreview, useMove, usePlace } from "../api/hooks";
import { useUiStore } from "../state/ui";
import { cashLabel, CATEGORY_ART, GRADE_CLASS } from "../utils";
import { HexDrawer } from "./HexDrawer";
import hexLayout from "../../public/map/hexes.json";

/** Active map variant (day/night x seasons). New variants drop into public/map/variants/. */
type MapVariant = "spring-day";
const MAP_VARIANTS: Record<MapVariant, string> = { "spring-day": "/map/variants/spring-day.png" };

/** Traced map geometry (matches public/map/map.svg viewBox). */
const MAP_W = 1536;
const MAP_H = 864;

let mapLayerPromise: Promise<string> | null = null;

/** Fetch the traced hex layer once per session; returns the inner SVG markup. */
function loadMapLayer(): Promise<string> {
  if (!mapLayerPromise) {
    mapLayerPromise = fetch("/map/map.svg")
      .then((res) => {
        if (!res.ok) throw new Error(`map.svg failed: ${res.status}`);
        return res.text();
      })
      .then((text) => {
        const doc = new DOMParser().parseFromString(text, "image/svg+xml");
        const serializer = new XMLSerializer();
        return [...doc.documentElement.children].map((el) => serializer.serializeToString(el)).join("");
      });
  }
  return mapLayerPromise;
}

/**
 * Visual center of each painted parcel. The uniform grid (cx/cy) is what the
 * SVG interaction layer uses, but the painted plots drift from it by up to
 * ~130px — refX/refY are the hand-marked painted centers from the reference
 * map, so all visible overlays (grade dots, tags, locks) anchor to those.
 */
const REF_CENTER = new Map(
  (hexLayout as unknown as { hexes: { id: string; cx: number; cy: number; refX?: number; refY?: number }[] }).hexes.map((h) => [
    h.id,
    { x: h.refX ?? h.cx, y: h.refY ?? h.cy },
  ]),
);

function centerOf(hex: { hexId: string; cx: number; cy: number }): { x: number; y: number } {
  const ref = REF_CENTER.get(hex.hexId);
  return { x: ((ref?.x ?? hex.cx) / MAP_W) * 100, y: ((ref?.y ?? hex.cy) / MAP_H) * 100 };
}

function fitLabel(multiplier: number): string {
  if (multiplier >= 1.2) return "Excellent fit";
  if (multiplier >= 1.05) return "Good fit";
  if (multiplier >= 0.95) return "Neutral fit";
  if (multiplier >= 0.8) return "Poor fit";
  return "Bad fit";
}

export function HexBoard({ plot }: { plot: PlotSnapshot }) {
  const [mapVariant] = useState<MapVariant>("spring-day");
  const backdropSrc = MAP_VARIANTS[mapVariant];
  const [layer, setLayer] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const placeMode = useUiStore((s) => s.placeMode);
  const moveMode = useUiStore((s) => s.moveMode);
  const setInspectId = useUiStore((s) => s.setInspectId);
  const setToast = useUiStore((s) => s.setToast);
  const cancelBoardModes = useUiStore((s) => s.cancelBoardModes);
  const place = usePlace();
  const move = useMove();
  const acquire = useAcquireLand();

  /** Parcel selected for the right-side info drawer. */
  const [drawerHex, setDrawerHex] = useState<string | null>(null);
  /** Owned empty hex currently hovered while placing (drives the fit preview). */
  const [hoverHex, setHoverHex] = useState<string | null>(null);

  const hexBoard = plot.hexBoard;
  const occupied = useMemo(() => new Map(plot.cards.map((card) => [card.hexId, card])), [plot.cards]);
  const hexAt = useMemo(() => new Map(hexBoard.hexes.map((hex) => [hex.hexId, hex])), [hexBoard.hexes]);
  const levelLocked = useCallback(
    (hex: { requiredLevel: number }) => hex.requiredLevel > hexBoard.empireLevel,
    [hexBoard.empireLevel],
  );

  const fitArgs = placeMode && hoverHex ? { hexId: hoverHex, type: placeMode.type } : null;
  const fit = useFitPreview(fitArgs);

  useEffect(() => {
    let alive = true;
    loadMapLayer()
      .then((markup) => alive && setLayer(markup))
      .catch((error) => setToast(error instanceof Error ? error.message : String(error)));
    return () => {
      alive = false;
    };
  }, [setToast]);

  // Reflect snapshot + interaction state onto the traced hex layer.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !layer) return;
    const inPlace = Boolean(placeMode);
    const inMove = Boolean(moveMode);
    for (const hex of hexBoard.hexes) {
      const node = svg.querySelector<SVGGElement>(`#hex-${hex.hexId}`);
      if (!node) continue;
      const classes = ["hex"];
      classes.push(levelLocked(hex) ? "locked-by-level" : "land-open");
      if ((inPlace || inMove) && hex.owned && !occupied.has(hex.hexId)) {
        classes.push(inPlace ? "hex-valid" : "hex-target");
      }
      node.setAttribute("class", classes.join(" "));
    }
  }, [layer, hexBoard, occupied, placeMode, moveMode, levelLocked]);

  // ESC cancels place/move mode.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      cancelBoardModes();
      setDrawerHex(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelBoardModes]);

  const onHexClick = useCallback(
    (hexId: string) => {
      const hex = hexAt.get(hexId);
      if (!hex) return;
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
      setDrawerHex(hexId); // plain click: open the parcel info drawer
    },
    [hexAt, occupied, placeMode, moveMode, place, move, setToast, cancelBoardModes],
  );

  const onSvgClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const hex = (e.target as Element).closest?.(".hex");
      if (hex && hex.id) onHexClick(hex.id);
    },
    [onHexClick],
  );

  // Hover tracking drives the fit preview while placing.
  const onSvgOver = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!placeMode) return;
      const hex = (e.target as Element).closest?.(".hex");
      const hexId = hex?.id;
      const target = hexId ? hexAt.get(hexId) : undefined;
      setHoverHex(target?.owned && !occupied.has(hexId!) ? hexId! : null);
    },
    [placeMode, hexAt, occupied],
  );

  const onSvgLeave = useCallback(() => setHoverHex(null), []);

  const hoverBoardHex = hoverHex ? hexAt.get(hoverHex) : undefined;

  return (
    <main className="board-wrap hexboard" id="board-view" data-onboarding-target="board">
      <div className="hex-viewport" ref={viewportRef}>
        <div className="hex-frame">
          <img src={backdropSrc} alt="" draggable={false} />
          {layer ? (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${MAP_W} ${MAP_H}`}
              preserveAspectRatio="none"
              onClick={onSvgClick}
              onMouseOver={onSvgOver}
              onMouseLeave={onSvgLeave}
              dangerouslySetInnerHTML={{ __html: layer }}
            />
          ) : null}

          {/* Land markers: grade badge + price under unowned parcels. */}
          {hexBoard.hexes.map((hex) => {
            if (hex.owned) return null;
            const gradeClass = GRADE_CLASS[hex.grade ?? ""] ?? "grade-entry";
            const locked = levelLocked(hex);
            const pos = centerOf(hex);
            return (
              <div
                key={hex.hexId}
                className={`hex-marker ${gradeClass}${hex.frontier ? " frontier" : ""}${locked ? " locked" : ""}`}
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              >
                <i className="land-badge" />
                {hex.frontier ? (
                  <span className="land-tag">
                    {locked ? `🔒 Lv ${hex.requiredLevel}` : hex.priceMinor <= 0 ? "DEED" : cashLabel(hex.priceMinor)}
                  </span>
                ) : null}
              </div>
            );
          })}

          {/* Placed buildings: medal + name + stage pips on the painted parcel center. */}
          {plot.cards.map((card) => {
            const spec = CARDS[card.type];
            const pos = centerOf({ hexId: card.hexId, cx: 0, cy: 0 });
            return (
              <div key={card.id} className="hex-chip" style={{ left: `${pos.x}%`, top: `${pos.y}%` }}>
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

          {/* Lock badges: closed on locked parcels, open on the acquirable frontier. */}
          {hexBoard.hexes.map((hex) => {
            if (hex.owned) return null;
            const locked = levelLocked(hex);
            const open = hex.frontier && !locked;
            const pos = centerOf(hex);
            return (
              <span
                key={`lock-${hex.hexId}`}
                className={`hex-lock${open ? " open" : ""}${hex.frontier ? " frontier" : ""}`}
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                aria-hidden="true"
              >
                {open ? "🔓" : "🔒"}
              </span>
            );
          })}

        </div>
      </div>
      {drawerHex ? <HexDrawer board={hexBoard} hexId={drawerHex} onClose={() => setDrawerHex(null)} /> : null}
    </main>
  );
}
