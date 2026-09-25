import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./styles.css";
import { setPlayerId } from "./api/client";
import { useSessionStart } from "./api/hooks";

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

function Root() {
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

ReactDOM.createRoot(document.getElementById("app")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <Root />
    </QueryClientProvider>
  </React.StrictMode>,
);
