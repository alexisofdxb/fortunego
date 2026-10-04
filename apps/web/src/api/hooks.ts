import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  notificationsResponseSchema,
  plotSnapshotSchema,
  playerBoardSchema,
  investmentsViewSchema,
  landAcquireResponseSchema,
  landFitResponseSchema,
  landResponseSchema,
  leaderboardResponseSchema,
  type ClaimedPlotResponse,
  type EventChooseRequest,
  type EventMissionClaimRequest,
  type HuntClaimRequest,
  type HuntRerollRequest,
  type HuntStartRequest,
  type InvestRequest,
  type ModuleEquipRequest,
  type ModuleUnequipRequest,
  type MoveRequest,
  type NotificationsResponse,
  type ObjectiveRerollRequest,
  type OfflineSummaryViewRequest,
  type PerformanceClaimRequest,
  type PlaceRequest,
  type PlotSnapshot,
  type PositionsRebalanceRequest,
  type RebalanceResponse,
  type SessionSettleRequest,
  type SessionStartRequest,
  type SessionStartResponse,
  type UpgradeRequest,
  type VisitReceipt,
  type VisitRequest,
} from "@plotgo/shared";
import { CARDS, type SessionVerb } from "@plotgo/game";
import { api, getPlayerId } from "./client";
import { useUiStore } from "../state/ui";

export const PLOT_KEY = ["plot"] as const;
export const LEADERBOARD_KEY = ["leaderboard"] as const;
export const INVESTMENTS_KEY = ["investments"] as const;
export const NOTIFICATIONS_KEY = ["notifications"] as const;

function usePlotMutation<TVars, TData = PlotSnapshot>(
  fn: (vars: TVars) => Promise<TData>,
  toastOnSuccess?: (data: TData, vars: TVars) => string,
) {
  const queryClient = useQueryClient();
  const setToast = useUiStore((s) => s.setToast);
  return useMutation({
    mutationFn: fn,
    onSuccess: (data, vars) => {
      if (toastOnSuccess) setToast(toastOnSuccess(data, vars));
      void queryClient.invalidateQueries({ queryKey: PLOT_KEY });
    },
    onError: (error) => setToast(error instanceof Error ? error.message : String(error)),
  });
}

/** GET /api/plot — 10s polling, paused while a drag is in flight. */
export function usePlot() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: PLOT_KEY,
    queryFn: async () => {
      const data = await api<unknown>("/api/plot");
      const parsed = plotSnapshotSchema.safeParse(data);
      if (!parsed.success) {
        // Keep the last good snapshot; log the contract drift.
        console.error("[plotgo] /api/plot response failed validation", parsed.error);
        const last = queryClient.getQueryData<PlotSnapshot>(PLOT_KEY);
        if (last) return last;
        throw parsed.error;
      }
      return parsed.data;
    },
    refetchInterval: () => {
      const ui = useUiStore.getState();
      return ui.placeMode || ui.moveMode ? false : 10_000;
    },
    staleTime: 5_000,
  });
}

/** POST /api/session — bootstrap; persists the returned playerId. */
export function useSessionStart() {
  return useMutation({
    mutationFn: (body: SessionStartRequest) => api<SessionStartResponse>("/api/session", { method: "POST", body: JSON.stringify(body) }),
  });
}

export function usePlace() {
  return usePlotMutation(
    (body: PlaceRequest) => api("/api/plot/place", { method: "POST", body: JSON.stringify(body) }),
    (_data, vars) => `${CARDS[vars.type].name} placed. Run today's action to settle activity.`,
  );
}

/** POST /api/land/acquire — claim a frontier parcel (starter grant, deed or cash purchase). */
/** Full land board with per-hex attributes (drives the hex info drawer). */
export function useLandView() {
  return useQuery({
    queryKey: ["land"],
    queryFn: () => api("/api/land").then((data) => landResponseSchema.parse(data)),
  });
}

export function useAcquireLand() {
  const queryClient = useQueryClient();
  const setToast = useUiStore((s) => s.setToast);
  return useMutation({
    mutationFn: (hexId: string) =>
      api("/api/land/acquire", { method: "POST", body: JSON.stringify({ hexId }) }).then((data) => {
        const parsed = landAcquireResponseSchema.safeParse(data);
        if (!parsed.success) throw parsed.error;
        return parsed.data;
      }),
    onSuccess: () => {
      setToast("Parcel acquired");
      void queryClient.invalidateQueries({ queryKey: PLOT_KEY });
    },
    onError: (error) => setToast(error instanceof Error ? error.message : String(error)),
  });
}

/** GET /api/land/fit?hexId&type= — placement fit preview for the hovered owned hex. */
export function useFitPreview(args: { hexId: string; type: string } | null) {
  return useQuery({
    queryKey: ["land-fit", args?.hexId, args?.type],
    enabled: Boolean(args),
    staleTime: 60_000,
    queryFn: async () => {
      const data = await api<unknown>(`/api/land/fit?hexId=${encodeURIComponent(args!.hexId)}&type=${encodeURIComponent(args!.type)}`);
      const parsed = landFitResponseSchema.safeParse(data);
      if (!parsed.success) throw parsed.error;
      return parsed.data;
    },
  });
}

export function useMove() {
  return usePlotMutation(
    (body: MoveRequest) => api("/api/plot/move", { method: "POST", body: JSON.stringify(body) }),
    () => "Building moved.",
  );
}

export function useUpgrade() {
  return usePlotMutation(
    (body: UpgradeRequest) => api("/api/plot/upgrade", { method: "POST", body: JSON.stringify(body) }),
    () => "Building upgraded. Empire Value moved.",
  );
}

export function useOpenLiveopsCase() {
  return usePlotMutation(
    (caseType: "daily" | "business" | "market" | "event" | "executive" | "tycoon") =>
      api<PlotSnapshot & { caseResult?: { label: string } }>("/api/liveops/cases/open", {
        method: "POST",
        body: JSON.stringify({ caseType }),
      }),
    (data) => (data.caseResult?.label ? `Opened: ${data.caseResult.label}` : "Case opened."),
  );
}

export function useUnlockSeasonPass() {
  return usePlotMutation(() => api("/api/liveops/pass/unlock", { method: "POST", body: "{}" }), () => "Premium track unlocked with $PLOT.");
}

export function useBuyLiveopsSku() {
  return usePlotMutation(
    (body: { sku: string; quoteId: string }) =>
      api<PlotSnapshot & { shopItem?: string }>("/api/liveops/shop/buy", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    (data) => (data.shopItem ? `Purchased ${data.shopItem}` : "Purchased."),
  );
}

export function useLiveopsFaucet() {
  return usePlotMutation(
    () => api<PlotSnapshot & { faucetPlot?: number }>("/api/liveops/shop/faucet", { method: "POST", body: "{}" }),
    (data) => `Granted ${(data.faucetPlot ?? 0).toLocaleString()} $PLOT.`,
  );
}

export function useClaimSeasonPass() {
  return usePlotMutation(
    (body: { level: number; track: "free" | "premium" }) =>
      api<PlotSnapshot & { passReward?: string }>("/api/liveops/pass/claim", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    (data) => (data.passReward ? `Claimed: ${data.passReward}` : "Pass reward claimed."),
  );
}

export function useLiveopsLeaderboard(eventId: string | null) {
  return useQuery({
    queryKey: ["liveops-leaderboard", eventId],
    enabled: Boolean(eventId),
    staleTime: 15_000,
    queryFn: () => api(`/api/liveops/leaderboard?eventId=${encodeURIComponent(eventId!)}`),
  });
}

export function useHuntClaim() {
  return usePlotMutation(
    (body: HuntClaimRequest) => api<PlotSnapshot & { dropped?: string | null }>("/api/hunt/claim", { method: "POST", body: JSON.stringify(body) }),
    (data) => (data.dropped ? `You found ${data.dropped} stock units.` : "Hunt completed; reward pool fallback applied."),
  );
}

/** POST /api/hunts/start — start an unstarted daily offer; the offer keeps its own real-time expiry. */
export function useHuntStart() {
  return usePlotMutation(
    (body: HuntStartRequest) => api<PlotSnapshot & { started?: string }>("/api/hunts/start", { method: "POST", body: JSON.stringify(body) }),
    () => "Hunt started — progress only counts while you play actively.",
  );
}

/** POST /api/hunts/reroll — free daily reroll (1/day); replaces one unstarted offer. */
export function useHuntReroll() {
  return usePlotMutation(
    (body: HuntRerollRequest) => api<PlotSnapshot>("/api/hunts/reroll", { method: "POST", body: JSON.stringify(body) }),
    () => "Offer rerolled — a fresh Hunt offer is on the board.",
  );
}

/** POST /api/objectives/reroll — one shared lane reroll per day across all objective lanes. */
export function useObjectiveReroll() {
  return usePlotMutation(
    (body: ObjectiveRerollRequest) => api("/api/objectives/reroll", { method: "POST", body: JSON.stringify(body) }),
    () => "Objective lane rerolled for today.",
  );
}

export function useModuleEquip(buildingId: string) {
  return usePlotMutation(
    (body: ModuleEquipRequest) =>
      api(`/api/buildings/${buildingId}/modules/equip`, { method: "POST", body: JSON.stringify(body) }),
    () => "Module equipped at the next settlement boundary.",
  );
}

export function useModuleUnequip(buildingId: string) {
  return usePlotMutation(
    (body: ModuleUnequipRequest) =>
      api(`/api/buildings/${buildingId}/modules/unequip`, { method: "POST", body: JSON.stringify(body) }),
    () => "Module unequipped at the next settlement boundary.",
  );
}

export function usePerformanceClaim() {
  return usePlotMutation(
    (body: PerformanceClaimRequest) => api<ClaimedPlotResponse>("/api/performance/claim", { method: "POST", body: JSON.stringify(body) }),
    (data) => `Weekly payout claimed: ${(data.claimedPlot ?? 0).toLocaleString()} $PLOT.`,
  );
}

export function useEventChoose() {
  return usePlotMutation(
    (body: EventChooseRequest) => api("/api/event/choose", { method: "POST", body: JSON.stringify(body) }),
    () => "Event decision applied.",
  );
}

export function useEventMissionClaim() {
  return usePlotMutation(
    (body: EventMissionClaimRequest) => api("/api/event/mission/claim", { method: "POST", body: JSON.stringify(body) }),
    () => "Event mission reward claimed.",
  );
}

export function useSessionSettle() {
  return usePlotMutation(
    (body: SessionSettleRequest) => api<PlotSnapshot & { receipt?: { cashDeltaMinor: number } }>("/api/session/settle", { method: "POST", body: JSON.stringify(body) }),
    (data) => (data.receipt && data.receipt.cashDeltaMinor < 0 ? "District day settled with a loss." : "District day settled."),
  );
}

export function useRebalance() {
  const queryClient = useQueryClient();
  const setToast = useUiStore((s) => s.setToast);
  return useMutation({
    mutationFn: (body: PositionsRebalanceRequest) =>
      api<RebalanceResponse>("/api/positions/rebalance", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (data) => {
      const today = new Date().toISOString().slice(0, 10);
      setToast(`Portfolio saved. Next daily mark begins ${data.receipt.effectiveDay === today ? "tomorrow" : data.receipt.effectiveDay}.`);
      void queryClient.invalidateQueries({ queryKey: PLOT_KEY });
    },
    onError: (error) => setToast(error instanceof Error ? error.message : String(error)),
  });
}

export function useOfflineSummaryView() {
  const queryClient = useQueryClient();
  const setToast = useUiStore((s) => s.setToast);
  return useMutation({
    mutationFn: (body: OfflineSummaryViewRequest) =>
      api("/api/offline/summary/view", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: PLOT_KEY }),
    onError: (error) => setToast(error instanceof Error ? error.message : String(error)),
  });
}

/** GET /api/leaderboard?board=empire — visit target list. */
export function useLeaderboard() {
  return useQuery({
    queryKey: LEADERBOARD_KEY,
    queryFn: async () => {
      const data = await api<unknown>("/api/leaderboard?board=empire");
      const parsed = leaderboardResponseSchema.safeParse(data);
      if (!parsed.success) throw parsed.error;
      return parsed.data;
    },
  });
}

export function useWorldMap() {
  return useQuery({
    queryKey: ["world"],
    queryFn: () => api("/api/world"),
    staleTime: 10_000,
  });
}

export function useVisitWorld() {
  const setVisitMode = useUiStore((s) => s.setVisitMode);
  const toggle = useUiStore((s) => s.toggleSection);
  const setToast = useUiStore((s) => s.setToast);
  return useMutation({
    mutationFn: (regionId: string) =>
      api<{
        region: { id: string; label: string };
        host: {
          playerId: string;
          name: string;
          buildings: { id: string; type: string; name: string; hexId: string; stage: number; lineage: string }[];
        };
      }>("/api/world/visit", { method: "POST", body: JSON.stringify({ regionId }) }),
    onSuccess: (data) => {
      setVisitMode({
        hostId: data.host.playerId,
        name: data.host.name,
        regionId: data.region.id,
        regionLabel: data.region.label,
        buildings: data.host.buildings,
      });
      toggle("dock-world");
      setToast(`Arrived in ${data.host.name}'s city`);
    },
    onError: (error) => setToast(error instanceof Error ? error.message : String(error)),
  });
}

/** GET /api/players/:playerId/board — privacy-filtered public read model. */
export function usePlayerBoard(playerId: string | null) {
  return useQuery({
    queryKey: ["player-board", playerId],
    enabled: Boolean(playerId),
    queryFn: async () => {
      const data = await api<unknown>(`/api/players/${playerId}/board`);
      const parsed = playerBoardSchema.safeParse(data);
      if (!parsed.success) throw parsed.error;
      return parsed.data;
    },
  });
}

/** GET /api/investments — both the visitor and host investment views. */
export function useInvestments() {
  return useQuery({
    queryKey: INVESTMENTS_KEY,
    enabled: Boolean(getPlayerId()),
    queryFn: async () => {
      const data = await api<unknown>("/api/investments");
      const parsed = investmentsViewSchema.safeParse(data);
      if (!parsed.success) throw parsed.error;
      return parsed.data;
    },
  });
}

export function useVisit() {
  const queryClient = useQueryClient();
  const setToast = useUiStore((s) => s.setToast);
  return useMutation({
    mutationFn: (body: VisitRequest) => api<VisitReceipt>("/api/visits", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (data) => {
      setToast(`Visit complete: ${(data.feeMinor / 100).toLocaleString()} Cash fee${data.notionalMinor ? ` + ${(data.notionalMinor / 100).toLocaleString()} notional` : ""}.`);
      void queryClient.invalidateQueries({ queryKey: PLOT_KEY });
      void queryClient.invalidateQueries({ queryKey: INVESTMENTS_KEY });
    },
    onError: (error) => setToast(error instanceof Error ? error.message : String(error)),
  });
}

export function useInvest() {
  const queryClient = useQueryClient();
  const setToast = useUiStore((s) => s.setToast);
  return useMutation({
    mutationFn: (body: InvestRequest) => api("/api/invest", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setToast("Investment active. Yield pays at the host's daily settle; principal returns at maturity.");
      void queryClient.invalidateQueries({ queryKey: PLOT_KEY });
      void queryClient.invalidateQueries({ queryKey: INVESTMENTS_KEY });
    },
    onError: (error) => setToast(error instanceof Error ? error.message : String(error)),
  });
}

export function useOnboardingSkip() {
  const queryClient = useQueryClient();
  const setToast = useUiStore((s) => s.setToast);
  return useMutation({
    mutationFn: () => api("/api/onboarding/skip", { method: "POST", body: "{}" }),
    onSuccess: () => {
      setToast("Guided onboarding skipped. Your normal goals remain available.");
      void queryClient.invalidateQueries({ queryKey: PLOT_KEY });
    },
    onError: (error) => setToast(error instanceof Error ? error.message : String(error)),
  });
}

/** GET /api/notifications — in-app inbox, newest first; 60s polling (spec sheet 12). */
export function useNotifications() {
  return useQuery({
    queryKey: NOTIFICATIONS_KEY,
    enabled: Boolean(getPlayerId()),
    refetchInterval: 60_000,
    queryFn: async () => {
      const data = await api<unknown>("/api/notifications");
      const parsed = notificationsResponseSchema.safeParse(data);
      if (!parsed.success) throw parsed.error;
      return parsed.data;
    },
  });
}

function useNotificationInvalidator() {
  const queryClient = useQueryClient();
  const setToast = useUiStore((s) => s.setToast);
  return {
    queryClient,
    setToast,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
      void queryClient.invalidateQueries({ queryKey: PLOT_KEY });
    },
    onError: (error: unknown) => setToast(error instanceof Error ? error.message : String(error)),
  };
}

/** POST /api/notifications/:id/read */
export function useNotificationRead() {
  const { onSuccess, onError } = useNotificationInvalidator();
  return useMutation({
    mutationFn: (id: string) => api(`/api/notifications/${id}/read`, { method: "POST", body: "{}" }),
    onSuccess,
    onError,
  });
}

/** POST /api/notifications/read-all */
export function useNotificationReadAll() {
  const { onSuccess, onError } = useNotificationInvalidator();
  return useMutation({
    mutationFn: () => api("/api/notifications/read-all", { method: "POST", body: "{}" }),
    onSuccess,
    onError,
  });
}

export type { SessionVerb };
