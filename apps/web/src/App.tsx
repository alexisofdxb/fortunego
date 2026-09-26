import { usePlot } from "./api/hooks";
import { useUiStore } from "./state/ui";
import { Header } from "./components/Header";
import { OnboardingGuide } from "./components/OnboardingGuide";
import { Toast } from "./components/Toast";
import { BoardStage } from "./components/BoardStage";
import { Hand } from "./components/Hand";
import { InspectSheet } from "./components/InspectSheet";
import { Dock } from "./components/Dock";
import { CARDS } from "@plotgo/game";

export default function App() {
  const { data: plot } = usePlot();
  const drag = useUiStore((s) => s.drag);

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
      <BoardStage plot={plot} />
      <p className="place-hint" id="place-hint">
        {drag
          ? drag.kind === "move"
            ? `Move ${CARDS[drag.type]?.name ?? drag.type}`
            : `Drop ${CARDS[drag.type]?.name ?? drag.type} on the board`
          : "Scroll or pinch to zoom · tap a building · hold to move"}
      </p>
      <Hand plot={plot} />
      <InspectSheet plot={plot} />
      <Dock plot={plot} />
    </div>
  );
}
