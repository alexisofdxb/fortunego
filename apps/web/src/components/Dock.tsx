import type { ComponentType, ReactNode } from "react";
import {
  Briefcase,
  CalendarDays,
  Crosshair,
  Landmark,
  LibraryBig,
  ListChecks,
  Mail,
  MoonStar,
  Sailboat,
  Trophy,
  X,
} from "lucide-react";
import type { PlotSnapshot } from "@plotgo/shared";
import { useNotifications } from "../api/hooks";
import { useUiStore } from "../state/ui";
import { HuntStrip } from "./HuntStrip";
import { ObjectivesPanel } from "./ObjectivesPanel";
import { DistrictPanel } from "./DistrictPanel";
import { EventsPanel } from "./EventsPanel";
import { PortfolioPanel } from "./PortfolioPanel";
import { VisitView } from "./VisitView";
import { PerformancePanel } from "./PerformancePanel";
import { OfflineBanner } from "./OfflineBanner";
import { ReceiptBanner } from "./ReceiptBanner";
import { InboxList } from "./NotificationBell";
import { CatalogOverlay } from "./Catalog";

type DockItem = {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number | string; strokeWidth?: number | string }>;
  badge?: string | number;
  body: (plot: PlotSnapshot) => ReactNode;
};

/** Bottom icon dock — every panel lives behind an icon that drops a sheet open. */
export function Dock({ plot }: { plot: PlotSnapshot }) {
  const openSections = useUiStore((s) => s.openSections);
  const toggle = useUiStore((s) => s.toggleSection);
  const notifications = useNotifications();
  const unread = notifications.data?.unread ?? 0;

  const objectivesOpen = plot.objectives?.lanes.filter((lane) => lane.status !== "complete").length ?? 0;

  const items: DockItem[] = [
    {
      id: "catalog",
      label: "Catalog",
      icon: LibraryBig,
      body: () => null, // rendered as a full-screen overlay below
    },
    {
      id: "hunts",
      label: "Market Hunts",
      icon: Crosshair,
      badge: plot.huntOffers?.length || undefined,
      body: (p: PlotSnapshot) => <HuntStrip plot={p} />,
    },
    {
      id: "objectives",
      label: "Objectives",
      icon: ListChecks,
      badge: objectivesOpen || undefined,
      body: (p: PlotSnapshot) => <ObjectivesPanel plot={p} />,
    },
    {
      id: "district",
      label: "District",
      icon: Landmark,
      body: (p: PlotSnapshot) => (
        <>
          <DistrictPanel plot={p} />
          <ReceiptBanner plot={p} />
        </>
      ),
    },
    {
      id: "events",
      label: "Events",
      icon: CalendarDays,
      body: (p: PlotSnapshot) => <EventsPanel plot={p} />,
    },
    {
      id: "portfolio",
      label: "Portfolio",
      icon: Briefcase,
      body: (p: PlotSnapshot) => <PortfolioPanel plot={p} />,
    },
    {
      id: "visits",
      label: "Visits",
      icon: Sailboat,
      body: (p: PlotSnapshot) => <VisitView plot={p} />,
    },
    {
      id: "performance",
      label: "Performance",
      icon: Trophy,
      body: (p: PlotSnapshot) => <PerformancePanel plot={p} />,
    },
    {
      id: "mail",
      label: "Inbox",
      icon: Mail,
      badge: unread || undefined,
      body: () => <InboxList />,
    },
    ...(plot.offlineSummary
      ? [
          {
            id: "offline",
            label: "Away report",
            icon: MoonStar,
            body: (p: PlotSnapshot) => <OfflineBanner plot={p} />,
          } satisfies DockItem,
        ]
      : []),
  ].filter((item) => item.id !== "offline" || plot.offlineSummary);

  const active = items.find((item) => openSections[`dock-${item.id}`]) ?? null;

  return (
    <>
      <nav className="dock" aria-label="Game panels">
        {items.map((item) => {
          const Icon = item.icon;
          const open = !!openSections[`dock-${item.id}`];
          return (
            <button
              key={item.id}
              type="button"
              className={`dock-btn${open ? " active" : ""}`}
              title={item.label}
              aria-label={item.label}
              aria-expanded={open}
              onClick={() => toggle(`dock-${item.id}`)}
            >
              <Icon size={20} strokeWidth={1.8} />
              {item.badge != null && item.badge !== "" ? (
                <span className="dock-badge">{typeof item.badge === "number" && item.badge > 99 ? "99+" : item.badge}</span>
              ) : null}
            </button>
          );
        })}
      </nav>
      {active ? (
        active.id === "catalog" ? (
          <CatalogOverlay plot={plot} onClose={() => toggle("dock-catalog")} />
        ) : (
          <>
            <div className="dock-backdrop" onClick={() => toggle(`dock-${active.id}`)} />
            <section className="dock-sheet" role="dialog" aria-label={active.label}>
              <header className="dock-sheet-head">
                <b>{active.label}</b>
                <button className="modal-x" type="button" aria-label="Close" onClick={() => toggle(`dock-${active.id}`)}>
                  <X size={18} />
                </button>
              </header>
              <div className="dock-sheet-body">{active.body(plot)}</div>
            </section>
          </>
        )
      ) : null}
    </>
  );
}
