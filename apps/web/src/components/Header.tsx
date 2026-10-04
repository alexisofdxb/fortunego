import { useEffect, useRef, useState } from "react";
import { CalendarDays, Globe, Landmark, MoonStar, Trophy } from "lucide-react";
import { CARDS } from "@plotgo/game";
import type { PlotSnapshot } from "@plotgo/shared";
import { useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { NotificationBell } from "./NotificationBell";
import { useSessionSettle } from "../api/hooks";
import { useUiStore } from "../state/ui";
import { CATEGORY_ART, dicebearAvatarUrl } from "../utils";

function happyFace(satisfactionBps: number): string {
  if (satisfactionBps >= 7500) return "😄";
  if (satisfactionBps >= 5000) return "🙂";
  if (satisfactionBps >= 2500) return "😐";
  return "🙁";
}

const PRIVY_ENABLED = Boolean(import.meta.env.VITE_PRIVY_APP_ID);

const cap = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** Renders only in Privy mode (mounted under the provider); logs out + resets client state. */
function LogoutButton() {
  const { logout } = usePrivy();
  const queryClient = useQueryClient();
  return (
    <button
      className="logout-btn"
      title="Sign out"
      onClick={() => {
        localStorage.removeItem("plotgo.playerId");
        void queryClient.clear();
        void logout();
      }}
    >
      ⏻
    </button>
  );
}

function HeaderTools({ plot }: { plot: PlotSnapshot }) {
  const openSections = useUiStore((s) => s.openSections);
  const toggle = useUiStore((s) => s.toggleSection);
  const tools = [
    { id: "world", label: "World", icon: Globe },
    { id: "district", label: "District", icon: Landmark },
    { id: "events", label: "Events", icon: CalendarDays },
    { id: "performance", label: "Performance", icon: Trophy },
    ...(plot.offlineSummary ? [{ id: "offline", label: "Away report", icon: MoonStar }] : []),
  ];
  return (
    <div className="header-tools">
      {tools.map((tool) => {
        const Icon = tool.icon;
        const open = !!openSections[`dock-${tool.id}`];
        return (
          <button
            key={tool.id}
            type="button"
            className={`header-tool${open ? " active" : ""}`}
            title={tool.label}
            aria-label={tool.label}
            aria-expanded={open}
            onClick={() => toggle(`dock-${tool.id}`)}
          >
            <Icon size={16} strokeWidth={1.8} />
            {tool.id === "events" && (plot.liveops?.campaigns.length ?? 0) > 0 ? (
              <span className="header-tool-badge">{plot.liveops.campaigns.length}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function Header({ plot }: { plot: PlotSnapshot }) {
  const setToast = useUiStore((s) => s.setToast);
  const settle = useSessionSettle();
  const [tipsOpen, setTipsOpen] = useState(false);
  const tipsRef = useRef<HTMLDivElement>(null);
  const board = plot.hexBoard;
  const gate = board.activeGate;
  // v1.0: the candidate level outran the displayed level but a promotion gate
  // still holds it back — pulse a badge until the gate is crossed.
  const gatePending = gate !== null && board.candidateLevel > board.empireLevel;
  const xpTotal = board.empireXp + board.xpForNextLevel;
  const xpPct = xpTotal > 0 ? Math.min(100, Math.round((board.empireXp / xpTotal) * 100)) : 100;
  const prevRef = useRef({ level: board.empireLevel, capacity: board.capacityForLevel });

  // Toast once per empire-level gain that grew land capacity.
  useEffect(() => {
    const prev = prevRef.current;
    if (board.empireLevel > prev.level && board.capacityForLevel > prev.capacity) {
      setToast("Land Capacity Increased — you may acquire another parcel");
    }
    prevRef.current = { level: board.empireLevel, capacity: board.capacityForLevel };
  }, [board.empireLevel, board.capacityForLevel, setToast]);

  useEffect(() => {
    if (!tipsOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!tipsRef.current?.contains(e.target as Node)) setTipsOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [tipsOpen]);

  const satisfactionPct = Math.round(plot.attributes.satisfactionBps / 100);
  const assigned = plot.cards.map((card) => {
    const spec = CARDS[card.type];
    const parcel = plot.hexBoard.hexes.find((hex) => hex.hexId === card.hexId)?.parcelId ?? card.hexId;
    return {
      id: card.id,
      name: spec?.name ?? card.type,
      icon: CATEGORY_ART[spec?.category ?? ""] ?? "🏢",
      parcel,
    };
  });

  return (
    <header className="top">
      <div className="top-left">
        <div className="avatar-medallion small" title={`Empire Level ${board.empireLevel} · ${board.empireXp.toLocaleString()} XP · land ${board.ownedCount}/${board.capacityForLevel}`}>
          <img
            className="avatar-face"
            src={dicebearAvatarUrl(plot.playerId)}
            alt=""
            width={36}
            height={36}
          />
        </div>
        <span className="xp-hud" data-tut="xp-hud">
        <span className="level-pill">Lv {board.empireLevel}</span>
        <span
          className="xp-pill"
          title={
            board.xpForNextLevel > 0
              ? `${board.empireXp.toLocaleString()} / ${(board.empireXp + board.xpForNextLevel).toLocaleString()} XP · ${board.xpForNextLevel.toLocaleString()} to Lv ${board.empireLevel + 1}`
              : `${board.empireXp.toLocaleString()} XP · max level`
          }
        >
          {board.xpForNextLevel > 0 ? (
            <>
              <span className="xp-mini">
                <i style={{ width: `${xpPct}%` }} />
              </span>
              {board.xpForNextLevel.toLocaleString()} to Lv {board.empireLevel + 1}
            </>
          ) : (
            "Max"
          )}
        </span>
        </span>
      </div>
      <div className="customer-bar" aria-label="Customers">
        <div className="happy-wrap" ref={tipsRef}>
          <button
            type="button"
            className="happy-chip"
            aria-expanded={tipsOpen}
            title="Happiness — click for tips"
            onClick={() => setTipsOpen((open) => !open)}
          >
            <span className="happy-face">{happyFace(plot.attributes.satisfactionBps)}</span>
            <b>{satisfactionPct}%</b>
          </button>
          {tipsOpen ? (
            <div className="happy-tip" role="dialog" aria-label="Happiness tips">
              <header>
                <strong>Happiness</strong>
                <span>{satisfactionPct}%</span>
              </header>
              <p>
                Happiness is how satisfied people are with your city. It comes from reputation and the businesses you
                actually have on the board.
              </p>
              <b>How to increase Happiness:</b>
              <ol>
                <li>Place businesses on parcels you own</li>
                <li>Upgrade buildings so they serve people better</li>
                <li>Acquire better parcels</li>
                <li>Close the day to settle activity</li>
                <li>Raise reputation through synergies and good service</li>
              </ol>
              <b>Where customers are</b>
              {assigned.length > 0 ? (
                <ul className="happy-assigned">
                  {assigned.map((row) => (
                    <li key={row.id}>
                      <span>
                        {row.icon} {row.name}
                      </span>
                      <em>{row.parcel}</em>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No businesses on the board yet.</p>
              )}
            </div>
          ) : null}
        </div>
        {assigned.map((row) => (
          <span key={row.id} className="seg-chip" title={`${row.name} on ${row.parcel}`}>
            <i>{row.icon}</i>
            <b>{row.parcel}</b>
          </span>
        ))}
      </div>
      <div className="top-stats">
        <HeaderTools plot={plot} />
        {plot.session ? (
          <span className="day-chip settled" title="Settled — come back after UTC midnight for a new day">
            ✓ Settled
          </span>
        ) : (
          <button
            type="button"
            className="day-chip close-day"
            data-tut="close-day"
            disabled={settle.isPending}
            title="Close the day: settle your businesses' earnings (once per day)"
            onClick={() => settle.mutate({ verb: "walk" })}
          >
            🌙 Close Day
          </button>
        )}
        <span className="resource-chip" title="Cash balance">
          <i>💵</i>
          <b>{plot.cash}</b>
        </span>
        <span className="resource-chip" title="Empire Value">
          <i>🏛️</i>
          <b>{plot.empireValue}</b>
        </span>
        <NotificationBell unread={plot.notificationsUnread} />
        {PRIVY_ENABLED ? <LogoutButton /> : null}
      </div>
    </header>
  );
}
