import { usePlot } from "./api/hooks";
import { useUiStore } from "./state/ui";
import { Header } from "./components/Header";
import { OfflineBanner } from "./components/OfflineBanner";
import { OnboardingGuide } from "./components/OnboardingGuide";
import { HuntStrip } from "./components/HuntStrip";
import { PortfolioPanel } from "./components/PortfolioPanel";
import { VisitView } from "./components/VisitView";
import { PerformancePanel } from "./components/PerformancePanel";
import { DistrictPanel } from "./components/DistrictPanel";
import { ReceiptBanner } from "./components/ReceiptBanner";
import { EventsPanel } from "./components/EventsPanel";
import { Toast } from "./components/Toast";
import { BoardStage } from "./components/BoardStage";
import { Hand } from "./components/Hand";
import { InspectSheet } from "./components/InspectSheet";
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
      <OfflineBanner plot={plot} />
      <OnboardingGuide plot={plot} />
      <HuntStrip plot={plot} />
      <PortfolioPanel plot={plot} />
      <VisitView plot={plot} />
      <PerformancePanel plot={plot} />
      <DistrictPanel plot={plot} />
      <EventsPanel plot={plot} />
      <ReceiptBanner plot={plot} />
      <Toast />
      <BoardStage plot={plot} />
      <p className="place-hint" id="place-hint">
        {drag
          ? drag.kind === "move"
            ? `Move ${CARDS[drag.type]?.name ?? drag.type}`
            : `Drop ${CARDS[drag.type]?.name ?? drag.type} on the board`
          : "Drag the map to pan · tap a building · hold to move"}
      </p>
      <Hand plot={plot} />
      <InspectSheet plot={plot} />
    </div>
  );
}
