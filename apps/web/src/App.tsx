import { useEffect } from "react";
import { usePlot } from "./api/hooks";
import { useUiStore } from "./state/ui";
import { Header } from "./components/Header";
import { OnboardingGuide } from "./components/OnboardingGuide";
import { Toast } from "./components/Toast";
import { HexBoard } from "./components/HexBoard";
import { Hand } from "./components/Hand";
import { InspectSheet } from "./components/InspectSheet";
import { Dock } from "./components/Dock";
import { CARDS } from "@plotgo/game";

export default function App() {
  // Keep UI scale fixed while playing: block the Ctrl+wheel zoom gesture app-wide.
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);

  const { data: plot } = usePlot();
  const placeMode = useUiStore((s) => s.placeMode);
  const moveMode = useUiStore((s) => s.moveMode);

  if (!plot) {
    return (
      <div id="app" className="loading">
        <div className="panel">
          <p>Opening your Founder Plot…</p>
        </div>
      </div>
    );
  }

  return (
    <div id="app">
      <Header plot={plot} />
      <OnboardingGuide plot={plot} />
      <Toast />
      <HexBoard plot={plot} />
      <p className="place-hint" id="place-hint">
        {placeMode
          ? `Place ${CARDS[placeMode.type]?.name ?? placeMode.type} — click a highlighted parcel, or tap ✕ to cancel`
          : moveMode
            ? (() => {
                const moving = plot.cards.find((c) => c.id === moveMode.cardId);
                return `Move ${CARDS[moving?.type ?? ""]?.name ?? "building"} — click a target parcel, or tap ✕ to cancel`;
              })()
            : "Pick a card below, then click one of your parcels · frontier parcels can be acquired · click a hex for info"}
      </p>
      {placeMode || moveMode ? (
        <button type="button" className="mode-cancel" onClick={() => useUiStore.getState().cancelBoardModes()}>
          ✕ Cancel
        </button>
      ) : null}
      <Hand plot={plot} />
      <InspectSheet plot={plot} />
      <Dock plot={plot} />
    </div>
  );
}
