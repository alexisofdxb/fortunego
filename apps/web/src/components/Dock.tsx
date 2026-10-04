import type { ComponentType, ReactNode } from "react";
import {
  Briefcase,
  CalendarDays,
  Crosshair,
  Globe,
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
import { EventsOverlay } from "./EventsOverlay";
import { WorldOverlay } from "./WorldOverlay";
import { audio } from "../audio";

type DockItem = {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number | string; strokeWidth?: number | string }>;
  badge?: string | number;
  /** Parked features stay in this list but are not shown in the dock. */
  hidden?: boolean;
  body: (plot: PlotSnapshot) => ReactNode;
};

function huntTicketCount(plot: PlotSnapshot): number {
  return plot.liveops?.inventory.find((item) => item.itemId === "market_hunt_ticket")?.quantity ?? 0;
}

function huntTicketNote(plot: PlotSnapshot): string {
  const tickets = huntTicketCount(plot);
  if (tickets <= 0) return "";
  return ` · ${tickets} hunt ticket${tickets === 1 ? "" : "s"}`;
}

function huntBanner(plot: PlotSnapshot): { title: string; sub: string } {
  const all = plot.hunts ?? (plot.hunt ? [plot.hunt] : []);
  const ready = all.find((hunt) => hunt.started && hunt.ready && !hunt.claimed);
  if (ready) return { title: ready.title, sub: "Claim your reward · +20 XP" };
  const active = all.find((hunt) => hunt.started && !hunt.claimed);
  if (active) {
    return {
      title: active.title,
      sub: `${active.progress.current}/${active.progress.target} in progress`,
    };
  }
  const offers = plot.huntOffers ?? all.filter((hunt) => !hunt.started);
  const tickets = huntTicketNote(plot);
  if (offers.length === 1) return { title: offers[0]!.title, sub: `Offer ready — tap to start · +20 XP${tickets}` };
  if (offers.length > 1) return { title: "Market Hunt", sub: `${offers.length} offers ready · +20 XP${tickets}` };
  if (tickets) return { title: "Market Hunt", sub: `${huntTicketCount(plot)} hunt ticket${huntTicketCount(plot) === 1 ? "" : "s"} in the bag` };
  return { title: "Market Hunt", sub: "No hunts right now" };
}

function objectiveBanner(plot: PlotSnapshot): { title: string; sub: string } {
  const lane = plot.objectives?.lanes.find((item) => item.status !== "complete");
  if (lane) return { title: lane.title, sub: "Complete now · +25 XP" };
  return { title: "Objectives", sub: "All complete today" };
}

function fmtBadge(value: string | number | undefined) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return value > 99 ? "99+" : String(value);
  return value;
}

/** Right-side HUD: hunt + objectives banners on top, Catalog as the big deck, then Portfolio and Messages. */
export function Dock({ plot }: { plot: PlotSnapshot }) {
  const openSections = useUiStore((s) => s.openSections);
  const toggle = useUiStore((s) => s.toggleSection);
  const notifications = useNotifications();
  const unread = notifications.data?.unread ?? 0;

  const hunt = huntBanner(plot);
  const objective = objectiveBanner(plot);
  const catalogCount = plot.catalog.filter((card) => card.unlocked).length;
  const portfolioCount = plot.portfolio.length || plot.positions.length;

  const items: DockItem[] = [
    {
      id: "world",
      label: "World",
      icon: Globe,
      body: () => null,
    },
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
      badge: plot.objectives?.lanes.filter((lane) => lane.status !== "complete").length || undefined,
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
      hidden: true, // old list UI; travel is World overlay
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
  ].filter((item) => !item.hidden && (item.id !== "offline" || plot.offlineSummary));

  const byId = new Map(items.map((item) => [item.id, item]));
  const active = items.find((item) => openSections[`dock-${item.id}`]) ?? null;
  const isOpen = (id: string) => !!openSections[`dock-${id}`];
  const open = (id: string) => {
    const willOpen = !openSections[`dock-${id}`];
    audio.play("ui_tap");
    audio.play(willOpen ? "drawer_open" : "drawer_close");
    toggle(`dock-${id}`);
  };

  const huntsItem = byId.get("hunts");
  const objectivesItem = byId.get("objectives");
  const catalogItem = byId.get("catalog");
  const portfolioItem = byId.get("portfolio");
  const mailItem = byId.get("mail");

  return (
    <>
      <nav className="hud-rail" aria-label="Game panels">
        <div className="hud-banners">
          {huntsItem ? (
            <button
              type="button"
              className={`hud-banner-wrap${isOpen("hunts") ? " active" : ""}`}
              data-tut="hunt-banner"
              aria-label={huntsItem.label}
              aria-expanded={isOpen("hunts")}
              onClick={() => open("hunts")}
            >
              <span className="hud-banner hunt">
                <span className="hud-banner-icon">
                  <Crosshair size={20} strokeWidth={2.2} />
                </span>
                <span className="hud-banner-copy">
                  <b>{hunt.title}</b>
                  <small>{hunt.sub}</small>
                </span>
              </span>
            </button>
          ) : null}
          {objectivesItem ? (
            <button
              type="button"
              className={`hud-banner-wrap${isOpen("objectives") ? " active" : ""}`}
              data-tut="objectives-banner"
              aria-label={objectivesItem.label}
              aria-expanded={isOpen("objectives")}
              onClick={() => open("objectives")}
            >
              <span className="hud-banner objectives">
                <span className="hud-banner-icon">
                  <ListChecks size={20} strokeWidth={2.2} />
                </span>
                <span className="hud-banner-copy">
                  <b>{objective.title}</b>
                  <small>{objective.sub}</small>
                </span>
              </span>
            </button>
          ) : null}
        </div>

        <div className="hud-decks">
          {portfolioItem ? (
            <button
              type="button"
              className={`hud-deck md${isOpen("portfolio") ? " active" : ""}`}
              aria-label="Portfolio"
              aria-expanded={isOpen("portfolio")}
              onClick={() => open("portfolio")}
            >
              <span className="hud-deck-art" aria-hidden>
                <Briefcase size={20} strokeWidth={1.8} />
                {portfolioCount > 0 ? <span className="hud-deck-count">{fmtBadge(portfolioCount)}</span> : null}
              </span>
              <span className="hud-deck-label">Portfolio</span>
            </button>
          ) : null}
          {mailItem ? (
            <button
              type="button"
              className={`hud-deck md${isOpen("mail") ? " active" : ""}`}
              aria-label="Messages"
              aria-expanded={isOpen("mail")}
              onClick={() => open("mail")}
            >
              <span className="hud-deck-art" aria-hidden>
                <Mail size={20} strokeWidth={1.8} />
                {unread > 0 ? <span className="hud-deck-count">{fmtBadge(unread)}</span> : null}
              </span>
              <span className="hud-deck-label">Messages</span>
            </button>
          ) : null}
          {catalogItem ? (
            <button
              type="button"
              className={`hud-deck lg${isOpen("catalog") ? " active" : ""}`}
              aria-label="Catalog"
              aria-expanded={isOpen("catalog")}
              onClick={() => open("catalog")}
            >
              <span className="hud-deck-art" aria-hidden>
                <LibraryBig size={28} strokeWidth={1.8} />
                <span className="hud-deck-count">{catalogCount}</span>
              </span>
              <span className="hud-deck-label">Catalog</span>
            </button>
          ) : null}
        </div>
      </nav>
      {active ? (
        active.id === "catalog" ? (
          <CatalogOverlay plot={plot} onClose={() => toggle("dock-catalog")} />
        ) : active.id === "events" ? (
          <EventsOverlay plot={plot} onClose={() => toggle("dock-events")} />
        ) : active.id === "world" ? (
          <WorldOverlay plot={plot} onClose={() => toggle("dock-world")} />
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
