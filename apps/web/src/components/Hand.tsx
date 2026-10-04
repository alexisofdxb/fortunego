import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { CARDS, ERA_LABEL } from "@plotgo/game";
import type { PlotSnapshot } from "@plotgo/shared";
import { usePlace } from "../api/hooks";
import { useUiStore } from "../state/ui";
import { cashLabel, hexIdFromEl, nearestHexFromPoint } from "../utils";
import { tutorialRunning } from "./Tutorial";
import { audio } from "../audio";

type CatalogCard = PlotSnapshot["catalog"][number];

const DRAG_THRESHOLD = 8;
let suppressNextClick = false;

/**
 * Drag a card from the hand onto the board: once the pointer moves past a
 * small threshold a drag starts (gold arc + floating ghost, rendered by
 * DragLayer), and releasing over a valid owned parcel places the building.
 * A quick tap without movement falls through to the normal click flow.
 */
function beginCardDrag(
  e: ReactPointerEvent<HTMLButtonElement>,
  type: string,
  plot: PlotSnapshot,
  placeMutate: (args: { hexId: string; type: string }) => void,
): void {
  if (e.button !== 0) return;
  const startX = e.clientX;
  const startY = e.clientY;
  const rect = e.currentTarget.getBoundingClientRect();
  const ox = rect.left + rect.width / 2;
  const oy = rect.top + rect.height / 2;
  let started = false;

  const onMove = (ev: PointerEvent) => {
    if (!started && Math.hypot(ev.clientX - startX, ev.clientY - startY) > DRAG_THRESHOLD) {
      started = true;
      audio.play("card_pickup");
      useUiStore.getState().startDrag(type, ox, oy);
    }
    if (started) useUiStore.getState().updateDrag(ev.clientX, ev.clientY);
  };

  const onUp = (ev: PointerEvent) => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    if (!started) return;
    suppressNextClick = true;
    setTimeout(() => {
      suppressNextClick = false;
    }, 80);
    const state = useUiStore.getState();
    const hexId =
      hexIdFromEl(document.elementFromPoint(ev.clientX, ev.clientY)) ??
      nearestHexFromPoint(ev.clientX, ev.clientY);
    state.endDrag();
    const hex = hexId ? plot.hexBoard.hexes.find((h) => h.hexId === hexId) : undefined;
    const free = hex && hex.owned && !plot.cards.some((c) => c.hexId === hex.hexId);
    if (free) {
      placeMutate({ hexId: hex.hexId, type });
      state.setToast("");
    } else if (hex) {
      audio.play("hex_locked");
      if (!hex.owned) state.setToast("Acquire this parcel first");
    }
    state.cancelBoardModes();
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

function onboardingTargetFor(id: string): string {
  if (id === "cash_kiosk") return "build-cash-kiosk";
  if (id === "trading_booth") return "build-trading-booth";
  if (id === "savings_stand") return "build-savings-stand";
  return "";
}

const TIP_W = 300;
const TIP_GAP = 14;

function tipStyle(rect: DOMRect): CSSProperties {
  const placeRight = rect.right + TIP_GAP + TIP_W <= window.innerWidth - 8;
  const left = placeRight ? rect.right + TIP_GAP : rect.left - TIP_GAP - TIP_W;
  return {
    left: Math.max(8, Math.min(left, window.innerWidth - TIP_W - 8)),
    bottom: Math.max(12, window.innerHeight - rect.bottom),
    width: TIP_W,
  };
}

/** Side inspect panel for a hovered hand card — sits left or right of the
 *  card so it stays on screen, portaled so the hand scroller cannot clip it. */
function HandCardTip({ card, rect }: { card: CatalogCard; rect: DOMRect }) {
  const spec = CARDS[card.id];
  const era = (ERA_LABEL as Record<string, string>)[card.era] ?? card.era;
  const slots = card.moduleProfile?.maxModuleSlots ?? 0;
  return createPortal(
    <aside className="hand-tip" role="tooltip" style={tipStyle(rect)}>
      <div className="hand-tip-head">
        <span className="hand-tip-thumb" aria-hidden>
          <em>{era}</em>
          <b>{card.name}</b>
        </span>
        <div>
          <h3>{card.name}</h3>
          <small>
            {era}
            {spec?.category ? ` · ${spec.category}` : ""}
          </small>
        </div>
      </div>
      {card.description || card.blurb ? <p className="hand-tip-desc">{card.description || card.blurb}</p> : null}
      <ul>
        {spec?.baseNetPerDay != null ? <li>Expected {cashLabel(Math.round(spec.baseNetPerDay * 100))} / day</li> : null}
        <li>Place cost {cashLabel(card.placeCostMinor)}</li>
        <li>
          Footprint {card.footprint[0]}×{card.footprint[1]}
        </li>
        {spec?.primarySegment ? <li>Customers: {spec.primarySegment}</li> : null}
        {slots > 0 ? <li>{slots} module slots</li> : null}
        <li>Can be upgraded</li>
      </ul>
      <div className="hand-tip-tags">
        <span>{era}</span>
        {spec?.category ? <span>{spec.category}</span> : null}
        {spec?.primarySegment ? <span>{spec.primarySegment}</span> : null}
      </div>
    </aside>,
    document.body,
  );
}

/** Bottom hand — unlocked buildings that are not yet on the board.
 *  Placed and locked buildings live in Catalog. */
export function Hand({ plot }: { plot: PlotSnapshot }) {
  const placeMode = useUiStore((s) => s.placeMode);
  const drag = useUiStore((s) => s.drag);
  const setPlaceMode = useUiStore((s) => s.setPlaceMode);
  const setMoveMode = useUiStore((s) => s.setMoveMode);
  const place = usePlace();
  const [hover, setHover] = useState<{ id: string; rect: DOMRect } | null>(null);
  const placedTypes = new Set(plot.cards.map((card) => card.type));
  // Progressive disclosure: while the tutorial runs, only the card it teaches
  // is buildable. Everything else appears once the tutorial completes.
  const inTutorial = tutorialRunning(plot);
  const hand = plot.catalog.filter(
    (c) => c.unlocked && !placedTypes.has(c.id) && (!inTutorial || c.id === "cash_kiosk"),
  );
  const hovered = hover ? hand.find((c) => c.id === hover.id) : null;
  const fan = (i: number): string =>
    hand.length > 1
      ? `${Math.max(-6, Math.min(6, (i / (hand.length - 1) - 0.5) * 12))}deg`
      : "0deg";

  const showTip = (id: string, el: HTMLElement) => {
    const measure = () => setHover({ id, rect: el.getBoundingClientRect() });
    measure();
    requestAnimationFrame(measure);
  };

  return (
    <section className="hand">
      <div className="hand-track">
        {hand.map((card, i) => (
          <button
            type="button"
            key={card.id}
            data-onboarding-target={onboardingTargetFor(card.id)}
            style={{ "--tilt": fan(i) } as CSSProperties}
            className={`play-card${placeMode?.type === card.id ? " selected" : ""}`}
            onClick={() => {
              if (suppressNextClick) return; // a drag just ended — swallow the synthetic click
              setMoveMode(null);
              setPlaceMode(placeMode?.type === card.id ? null : { type: card.id });
            }}
            onPointerDown={(e) => beginCardDrag(e, card.id, plot, place.mutate)}
            onPointerEnter={(e) => showTip(card.id, e.currentTarget)}
            onPointerLeave={() => setHover((prev) => (prev?.id === card.id ? null : prev))}
          >
            <i></i>
            <i></i>
            <i></i>
            <i></i>
            <span className="play-era">{(ERA_LABEL as Record<string, string>)[card.era] ?? card.era}</span>
            <span className="play-name">{card.name}</span>
            <span className="play-meta">
              {card.footprint[0]}×{card.footprint[1]} · {cashLabel(card.placeCostMinor)}
            </span>
          </button>
        ))}
      </div>
      {hovered && hover && !drag ? <HandCardTip card={hovered} rect={hover.rect} /> : null}
    </section>
  );
}
