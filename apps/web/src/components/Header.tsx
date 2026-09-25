import type { PlotSnapshot } from "@plotgo/shared";
import { useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { NotificationBell } from "./NotificationBell";

const PRIVY_ENABLED = Boolean(import.meta.env.VITE_PRIVY_APP_ID);

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
  return (
    <header className="top">
      <div>
        <h1 className="brand">PlotGo</h1>
        <p className="sub">Founder · 12×12</p>
      </div>
      <div className="top-stats">
        <div>
          <span>Cash</span>
          <b>{plot.cash}</b>
        </div>
        <div>
          <span>Empire</span>
          <b>{plot.empireValue}</b>
        </div>
        <NotificationBell unread={plot.notificationsUnread} />
        {PRIVY_ENABLED ? <LogoutButton /> : null}
      </div>
    </header>
  );
}
