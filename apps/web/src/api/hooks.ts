import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  plotSnapshotSchema,
  playerBoardSchema,
  investmentsViewSchema,
  leaderboardResponseSchema,
  type ClaimedPlotResponse,
  type EventChooseRequest,
  type EventMissionClaimRequest,
  type HuntClaimRequest,
  type InvestRequest,
  type ModuleEquipRequest,
  type ModuleUnequipRequest,
  type MoveRequest,
  type OfflineSummaryViewRequest,
  type PerformanceClaimRequest,
  type PlaceRequest,
  type PlotSnapshot,
  type PositionsRebalanceRequest,
  type RebalanceResponse,
  type RotateRequest,
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
    refetchInterval: () => (useUiStore.getState().drag ? false : 10_000),
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

export function useMove() {
  return usePlotMutation(
    (body: MoveRequest) => api("/api/plot/move", { method: "POST", body: JSON.stringify(body) }),
    () => "Building moved.",
  );
}

export function useRotate() {
  return usePlotMutation(
    (body: RotateRequest) => api("/api/plot/rotate", { method: "POST", body: JSON.stringify(body) }),
    () => "Building rotated.",
  );
}

export function useUpgrade() {
  return usePlotMutation(
    (body: UpgradeRequest) => api("/api/plot/upgrade", { method: "POST", body: JSON.stringify(body) }),
    () => "Building upgraded. Empire Value moved.",
  );
}

export function useHuntClaim() {
  return usePlotMutation(
    (body: HuntClaimRequest) => api<PlotSnapshot & { dropped?: string | null }>("/api/hunt/claim", { method: "POST", body: JSON.stringify(body) }),
    (data) => (data.dropped ? `You found ${data.dropped} stock units.` : "Hunt completed; reward pool fallback applied."),
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

export type { SessionVerb };
