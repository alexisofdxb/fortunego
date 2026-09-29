import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { ERA_LABEL } from "@plotgo/game";
import type { PlotSnapshot } from "@plotgo/shared";
import { usePlace } from "../api/hooks";
import { useUiStore } from "../state/ui";
import { cashLabel } from "../utils";

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
    const hexEl = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.(".hex");
    const hexId = hexEl?.id?.startsWith("hex-") ? hexEl.id.slice(4) : null;
    state.endDrag();
    const hex = hexId ? plot.hexBoard.hexes.find((h) => h.hexId === hexId) : undefined;
    const free = hex && hex.owned && !plot.cards.some((c) => c.hexId === hex.hexId);
    if (free) {
      placeMutate({ hexId: hex.hexId, type });
      state.setToast("");
    } else if (hex && !hex.owned) {
      state.setToast("Acquire this parcel first");
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

/** Bottom hand — only unlocked buildings, fanned like a card hand.
 *  Everything (incl. locked & placed) lives behind the Catalog deck button. */
export function Hand({ plot }: { plot: PlotSnapshot }) {
  const placeMode = useUiStore((s) => s.placeMode);
  const setPlaceMode = useUiStore((s) => s.setPlaceMode);
  const setMoveMode = useUiStore((s) => s.setMoveMode);
  const toggleSection = useUiStore((s) => s.toggleSection);
  const place = usePlace();
  const hand = plot.catalog.filter((c) => c.unlocked);
  const fan = (i: number): string =>
    hand.length > 1
      ? `${Math.max(-6, Math.min(6, (i / (hand.length - 1) - 0.5) * 12))}deg`
      : "0deg";
  return (
    <section className="hand">
      <div className="hand-track">
        {hand.map((card, i) => (
          <button
            type="button"
            key={card.id}
            data-onboarding-target={onboardingTargetFor(card.id)}
            title={card.name}
            style={{ "--tilt": fan(i) } as CSSProperties}
            className={`play-card${placeMode?.type === card.id ? " selected" : ""}`}
            onClick={() => {
              if (suppressNextClick) return; // a drag just ended — swallow the synthetic click
              setMoveMode(null);
              setPlaceMode(placeMode?.type === card.id ? null : { type: card.id });
            }}
            onPointerDown={(e) => beginCardDrag(e, card.id, plot, place.mutate)}
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
        <button
          type="button"
          className="catalog-deck"
          title="Catalog — all buildings & modules"
          onClick={() => toggleSection("dock-catalog")}
        >
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <rect x="7" y="6" width="16" height="22" rx="2" fill="none" stroke="currentColor" />
            <rect x="14" y="11" width="16" height="22" rx="2" fill="none" stroke="currentColor" />
          </svg>
          <span>Catalog</span>
        </button>
      </div>
    </section>
  );
}
