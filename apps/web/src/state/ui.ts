import { create } from "zustand";

interface UiState {
  inspectId: string | null;
  /** Place mode: a Hand card is selected, waiting for a target hex click. */
  placeMode: { type: string } | null;
  /** Move mode: a placed building is being relocated to a target hex click. */
  moveMode: { cardId: string } | null;
  toast: string;
  openSections: Record<string, boolean>;
  questOpen: boolean;
  /** Active card drag from the hand: card type, current pointer, drag origin. */
  drag: { type: string; x: number; y: number; ox: number; oy: number } | null;
  /** Travelled to another founder's city on the world map. */
  visitMode: {
    hostId: string;
    name: string;
    regionId: string;
    regionLabel: string;
    buildings: { id: string; type: string; name: string; hexId: string; stage: number; lineage: string }[];
  } | null;
  setInspectId: (id: string | null) => void;
  setPlaceMode: (mode: { type: string } | null) => void;
  setMoveMode: (mode: { cardId: string } | null) => void;
  cancelBoardModes: () => void;
  setToast: (toast: string) => void;
  toggleSection: (id: string) => void;
  setQuestOpen: (open: boolean) => void;
  startDrag: (type: string, ox: number, oy: number) => void;
  updateDrag: (x: number, y: number) => void;
  endDrag: () => void;
  setVisitMode: (mode: UiState["visitMode"]) => void;
}

export const useUiStore = create<UiState>((set) => ({
  inspectId: null,
  placeMode: null,
  moveMode: null,
  toast: "",
  openSections: {},
  questOpen: false,
  drag: null,
  startDrag: (type, ox, oy) =>
    set({ drag: { type, x: ox, y: oy, ox, oy }, placeMode: { type }, moveMode: null, inspectId: null }),
  updateDrag: (x, y) => set((state) => (state.drag ? { drag: { ...state.drag, x, y } } : {})),
  endDrag: () => set({ drag: null }),
  setVisitMode: (visitMode) => set({ visitMode, placeMode: null, moveMode: null, inspectId: null }),
  setInspectId: (inspectId) => set({ inspectId }),
  setPlaceMode: (placeMode) => set({ placeMode, moveMode: null, inspectId: null }),
  setMoveMode: (moveMode) => set({ moveMode, placeMode: null, inspectId: null }),
  cancelBoardModes: () => set({ placeMode: null, moveMode: null }),
  setToast: (toast) => set({ toast }),
  toggleSection: (id) =>
    set((state) => ({ openSections: { ...state.openSections, [id]: !state.openSections[id] } })),
  setQuestOpen: (open: boolean) => set({ questOpen: open }),
}));
