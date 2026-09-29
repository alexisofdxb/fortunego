import { useEffect, useRef } from "react";
import type { PlotSnapshot } from "@plotgo/shared";
import { useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { rankForLevel } from "@plotgo/game";
import { NotificationBell } from "./NotificationBell";
import { useUiStore } from "../state/ui";

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

export function Header({ plot }: { plot: PlotSnapshot }) {
  const setToast = useUiStore((s) => s.setToast);
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

  return (
    <header className="top">
      <div className="top-left">
        <div className="avatar-medallion small" title={`Empire Level ${board.empireLevel} · ${board.empireXp.toLocaleString()} XP · land ${board.ownedCount}/${board.capacityForLevel}`}>
          <span className="avatar-face">🦊</span>
        </div>
        <span className="level-pill">Lv {board.empireLevel}</span>
        <span className="xp-pill" title={`${board.empireXp.toLocaleString()} XP`}>
          {board.empireXp >= 1000 ? `${(board.empireXp / 1000).toFixed(1)}k` : board.empireXp} XP
        </span>
      </div>
      <div className="top-stats">
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
