import { create } from "zustand";

interface UiState {
  inspectId: string | null;
  /** Place mode: a Hand card is selected, waiting for a target hex click. */
  placeMode: { type: string } | null;
  /** Move mode: a placed building is being relocated to a target hex click. */
  moveMode: { cardId: string } | null;
  toast: string;
  openSections: Record<string, boolean>;
  setInspectId: (id: string | null) => void;
  setPlaceMode: (mode: { type: string } | null) => void;
  setMoveMode: (mode: { cardId: string } | null) => void;
  cancelBoardModes: () => void;
  setToast: (toast: string) => void;
  toggleSection: (id: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  inspectId: null,
  placeMode: null,
  moveMode: null,
  toast: "",
  openSections: {},
  setInspectId: (inspectId) => set({ inspectId }),
  setPlaceMode: (placeMode) => set({ placeMode, moveMode: null, inspectId: null }),
  setMoveMode: (moveMode) => set({ moveMode, placeMode: null, inspectId: null }),
  cancelBoardModes: () => set({ placeMode: null, moveMode: null }),
  setToast: (toast) => set({ toast }),
  toggleSection: (id) =>
    set((state) => ({ openSections: { ...state.openSections, [id]: !state.openSections[id] } })),
}));
