import { usePrivy } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { setTokenProvider } from "../api/client";
import { useSessionStart } from "../api/hooks";

/** Landing screen shown until the player signs in (standalone/Privy mode). */
export function Landing({ onLogin }: { onLogin: () => void }) {
  return (
    <div id="app" className="loading">
      <div className="panel landing">
        <h1 className="landing-title">PlotGo</h1>
        <p className="landing-sub">Founder Plot — build a financial corner of the city.</p>
        <button className="landing-cta" onClick={onLogin}>
          Sign in to play
        </button>
      </div>
    </div>
  );
}

/**
 * Privy auth gate: wires the access-token provider into the API client, creates
 * the player account on first login (POST /api/session), and renders the
 * landing screen until authenticated. Children render only when authenticated.
 */
export function PrivyGate({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, login, getAccessToken, logout } = usePrivy();
  const queryClient = useQueryClient();
  const startSession = useSessionStart();

  useEffect(() => {
    setTokenProvider(() => getAccessToken());
    return () => setTokenProvider(null);
  }, [getAccessToken]);

  useEffect(() => {
    if (!ready || !authenticated) return;
    let cancelled = false;
    startSession.mutate(
      {},
      {
        onSuccess: (data) => {
          if (cancelled) return;
          // Keep the internal player id for debugging; requests authenticate by token.
          if (data.playerId) localStorage.setItem("plotgo.playerId", data.playerId);
          void queryClient.invalidateQueries({ queryKey: ["plot"] });
        },
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authenticated]);

  if (!ready) {
    return (
      <div id="app" className="loading">
        <div className="panel">
          <p>Opening your Founder Plot…</p>
        </div>
      </div>
    );
  }
  if (!authenticated) return <Landing onLogin={login} />;
  return <>{children}</>;
}
