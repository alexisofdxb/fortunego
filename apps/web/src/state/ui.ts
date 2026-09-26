import { create } from "zustand";

export type DragState =
  | { kind: "place"; type: string; orientation: 0 | 90 | 180 | 270 }
  | { kind: "move"; id: string; type: string; orientation: 0 | 90 | 180 | 270 };

export type Ghost = { x: number; y: number; ok: boolean } | null;

interface UiState {
  inspectId: string | null;
  drag: DragState | null;
  ghost: Ghost;
  toast: string;
  openSections: Record<string, boolean>;
  setInspectId: (id: string | null) => void;
  beginDrag: (drag: DragState) => void;
  rotateDrag: () => void;
  setGhost: (ghost: Ghost) => void;
  endDrag: () => void;
  setToast: (toast: string) => void;
  toggleSection: (id: string) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  inspectId: null,
  drag: null,
  ghost: null,
  toast: "",
  openSections: {},
  setInspectId: (inspectId) => set({ inspectId }),
  beginDrag: (drag) => set({ drag, ghost: null, inspectId: null }),
  rotateDrag: () => {
    const drag = get().drag;
    if (!drag) return;
    set({ drag: { ...drag, orientation: ((drag.orientation + 90) % 360) as 0 | 90 | 180 | 270 } });
  },
  setGhost: (ghost) => set({ ghost }),
  endDrag: () => set({ drag: null, ghost: null }),
  setToast: (toast) => set({ toast }),
  toggleSection: (id) => set({ openSections: { ...get().openSections, [id]: !get().openSections[id] } }),
}));
