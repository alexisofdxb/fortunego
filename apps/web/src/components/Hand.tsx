import { ERA_LABEL } from "@plotgo/game";
import type { PlotSnapshot } from "@plotgo/shared";
import { useUiStore } from "../state/ui";
import { cashLabel } from "../utils";

function onboardingTargetFor(id: string): string {
  if (id === "cash_kiosk") return "build-cash-kiosk";
  if (id === "trading_booth") return "build-trading-booth";
  if (id === "savings_stand") return "build-savings-stand";
  return "";
}

export function Hand({ plot }: { plot: PlotSnapshot }) {
  const placeMode = useUiStore((s) => s.placeMode);
  const setPlaceMode = useUiStore((s) => s.setPlaceMode);
  const setMoveMode = useUiStore((s) => s.setMoveMode);
  const hand = plot.catalog;
  return (
    <section className="hand">
      <div className="hand-track">
        {hand.map((card) =>
          card.unlocked ? (
            <button
              type="button"
              key={card.id}
              data-drag-type={card.id}
              data-onboarding-target={onboardingTargetFor(card.id)}
              title={card.name}
              className={`play-card${placeMode?.type === card.id ? " selected" : ""}`}
              onClick={() => {
                setMoveMode(null);
                setPlaceMode(placeMode?.type === card.id ? null : { type: card.id });
              }}
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
          ) : (
            <button className="play-card back" type="button" disabled key={card.id} title="Locked">
              <svg viewBox="0 0 40 40" aria-hidden="true">
                <rect x="7" y="6" width="16" height="22" rx="2" fill="none" stroke="currentColor" />
                <rect x="14" y="11" width="16" height="22" rx="2" fill="none" stroke="currentColor" />
              </svg>
            </button>
          ),
        )}
      </div>
    </section>
  );
}
