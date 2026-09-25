import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PrivyProvider } from "@privy-io/react-auth";
import App from "./App";
import "./styles.css";
import { setPlayerId } from "./api/client";
import { useSessionStart } from "./api/hooks";
import { PrivyGate } from "./components/AuthGate";

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID ?? "";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
});

/** Runs once even under React StrictMode's double effect invocation. */
function useEffectOnce(effect: () => void) {
  const ran = React.useRef(false);
  React.useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    effect();
  }, []);
}

/** Dev-mode bootstrap (no Privy app configured): legacy x-player-id session. */
function DevRoot() {
  const startSession = useSessionStart();
  useEffectOnce(() => {
    const stored = localStorage.getItem("plotgo.playerId");
    const playerId = stored || crypto.randomUUID();
    startSession.mutate(
      { playerId },
      {
        onSuccess: (data) => {
          setPlayerId(data.playerId);
          void queryClient.invalidateQueries({ queryKey: ["plot"] });
        },
      },
    );
  });
  return <App />;
}

function Root() {
  if (!PRIVY_APP_ID) return <DevRoot />;
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["email", "google", "discord"],
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
        appearance: { theme: "dark" },
      }}
    >
      <PrivyGate>
        <App />
      </PrivyGate>
    </PrivyProvider>
  );
}

ReactDOM.createRoot(document.getElementById("app")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <Root />
    </QueryClientProvider>
  </React.StrictMode>,
);
