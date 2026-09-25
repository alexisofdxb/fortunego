import { useEffect, useRef } from "react";
import { fits, orientedFootprint } from "@plotgo/game";
import type { PlotSnapshot } from "@plotgo/shared";
import { PixiBoard, type GhostRect } from "../board/PixiBoard";
import { useMove, usePlace } from "../api/hooks";
import { useUiStore } from "../state/ui";

const LONG_PRESS_MS = 420;
const DRAG_THRESHOLD = 10;

/** Mutable handle shared with the Hand tray (drag-from-hand flows). */
export const boardHandle: { current: PixiBoard | null } = { current: null };

export function BoardStage({ plot }: { plot: PlotSnapshot }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const place = usePlace();
  const move = useMove();
  // Track latest plot + mutations inside pointer handlers without stale closures.
  const live = useRef({ plot, place, move });
  live.current = { plot, place, move };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let board: PixiBoard | null = null;
    let unsubscribe: (() => void) | null = null;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    let pan: { lastX: number; lastY: number; startX: number; startY: number; pieceId: string | null; moved: boolean } | null = null;
    let longPress: ReturnType<typeof setTimeout> | null = null;
    let pieceDragFromBoard = false;

    const ui = useUiStore;
    const clearLongPress = () => {
      if (longPress) {
        clearTimeout(longPress);
        longPress = null;
      }
    };

    const ghostFrom = (clientX: number, clientY: number) => {
      const drag = ui.getState().drag;
      if (!drag || !board) return;
      const at = board.screenToCell(clientX, clientY);
      if (!at) {
        ui.getState().setGhost(null);
        return;
      }
      const ignoreId = drag.kind === "move" ? drag.id : undefined;
      const ok = fits(live.current.plot.cards, drag.type, at.x, at.y, ignoreId, 12, drag.orientation);
      ui.getState().setGhost({ x: at.x, y: at.y, ok });
    };

    const beginPieceDrag = (pieceId: string) => {
      const card = live.current.plot.cards.find((c) => c.id === pieceId);
      if (!card) return;
      ui.getState().beginDrag({ kind: "move", id: card.id, type: card.type, orientation: card.orientation ?? 0 });
      board?.setLifting(card.id);
      pieceDragFromBoard = true;
    };

    const endDrag = (clientX: number, clientY: number, fromBoard: boolean) => {
      const state = ui.getState();
      const drag = state.drag;
      if (!drag) return;
      const at = board?.screenToCell(clientX, clientY) ?? null;
      state.endDrag();
      board?.setLifting(null);
      document.body.classList.remove("dragging");
      if (drag.kind === "place") {
        if (at) live.current.place.mutate({ type: drag.type, x: at.x, y: at.y, orientation: drag.orientation });
        return;
      }
      if (!fromBoard) {
        // Should not happen for move drags, but never drop a move silently.
        state.setInspectId(drag.id);
        return;
      }
      if (at) live.current.move.mutate({ cardId: drag.id, x: at.x, y: at.y, orientation: drag.orientation });
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!board) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
        pan = null;
        clearLongPress();
        return;
      }
      // Place-drag initiated from the Hand: keep tracking on the canvas.
      if (ui.getState().drag) return;
      const pieceId = board.hitPiece(e.clientX, e.clientY);
      pan = { lastX: e.clientX, lastY: e.clientY, startX: e.clientX, startY: e.clientY, pieceId, moved: false };
      if (pieceId) {
        longPress = setTimeout(() => {
          longPress = null;
          if (!pan || pan.moved || ui.getState().drag) return;
          pan = null;
          beginPieceDrag(pieceId);
          ghostFrom(e.clientX, e.clientY);
        }, LONG_PRESS_MS);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!board) return;
      if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        board.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch);
        pinch = d;
        return;
      }
      const drag = ui.getState().drag;
      if (drag) {
        ghostFrom(e.clientX, e.clientY);
        return;
      }
      if (pan) {
        const dist = Math.hypot(e.clientX - pan.startX, e.clientY - pan.startY);
        if (dist > DRAG_THRESHOLD) {
          pan.moved = true;
          clearLongPress();
          // Direct drag on a piece starts a move; on empty space it pans.
          if (pan.pieceId) {
            const pieceId = pan.pieceId;
            pan = null;
            beginPieceDrag(pieceId);
            ghostFrom(e.clientX, e.clientY);
            return;
          }
        }
        board.panBy(e.clientX - pan.lastX, e.clientY - pan.lastY);
        pan.lastX = e.clientX;
        pan.lastY = e.clientY;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      pinch = 0;
      clearLongPress();
      const drag = ui.getState().drag;
      if (drag) {
        const fromBoard = pieceDragFromBoard;
        pieceDragFromBoard = false;
        endDrag(e.clientX, e.clientY, fromBoard);
        return;
      }
      if (pan) {
        const hold = pan;
        pan = null;
        if (!hold.moved && hold.pieceId) ui.getState().setInspectId(hold.pieceId);
      }
    };

    const onPointerCancel = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      pinch = 0;
      clearLongPress();
      pan = null;
      const state = ui.getState();
      if (state.drag) {
        pieceDragFromBoard = false;
        state.endDrag();
        board?.setLifting(null);
        document.body.classList.remove("dragging");
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (!board) return;
      e.preventDefault();
      board.zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 0.92 : 1.09);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "r") return;
      if (!ui.getState().drag) return;
      ui.getState().rotateDrag();
      e.preventDefault();
    };

    const observer = new ResizeObserver(() => {
      board?.resize();
      board?.setCards(live.current.plot.cards);
    });
    observer.observe(host);

    void PixiBoard.create(host).then((b) => {
      if (cancelled) {
        b.destroy();
        return;
      }
      board = b;
      boardHandle.current = b;
      b.canvas.addEventListener("pointerdown", onPointerDown);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerCancel);
      b.canvas.addEventListener("wheel", onWheel, { passive: false });
      window.addEventListener("keydown", onKeyDown);

      // Imperative ghost painting straight from the store (no React re-render).
      unsubscribe = useUiStore.subscribe((state, prev) => {
        if (state.drag === prev.drag && state.ghost === prev.ghost) return;
        const drag = state.drag;
        const ghost = state.ghost;
        if (!drag || !ghost) {
          b.setGhost(null);
          return;
        }
        const [w, h] = orientedFootprint(drag.type, drag.orientation);
        const rect: GhostRect = { x: ghost.x, y: ghost.y, w, h, ok: ghost.ok };
        b.setGhost(rect);
        document.body.classList.toggle("dragging", true);
      });
    });

    return () => {
      cancelled = true;
      observer.disconnect();
      unsubscribe?.();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("keydown", onKeyDown);
      board?.canvas.removeEventListener("pointerdown", onPointerDown);
      board?.canvas.removeEventListener("wheel", onWheel);
      board?.destroy();
      if (boardHandle.current === board) boardHandle.current = null;
    };
  }, []);

  // Rebuild pieces whenever the placement changes.
  useEffect(() => {
    boardHandle.current?.setCards(plot.cards);
  }, [plot.cards]);

  // Dragging class cleanup when drag ends via store.
  useEffect(
    () =>
      useUiStore.subscribe((state) => {
        if (!state.drag) document.body.classList.remove("dragging");
      }),
    [],
  );

  return (
    <main className="board-wrap" id="board-view" data-onboarding-target="board" ref={hostRef}>
      <div className="zoom-fab">
        <button type="button" onClick={() => boardHandle.current?.zoomBy(1.18)}>+</button>
        <button type="button" onClick={() => boardHandle.current?.zoomBy(0.85)}>−</button>
      </div>
    </main>
  );
}
