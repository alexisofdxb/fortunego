import { Application, Assets, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { CARDS, lineageColor, orientedFootprint, type PlacedCard } from "@plotgo/game";

export const BOARD_N = 12;
const MIN_SCALE = 0.55;
const MAX_SCALE = 3.2;
const LAND_W = 1672;
const LAND_H = 941;

const LINEAGE_HEX: Record<string, number> = {
  bank: 0xe8c547,
  exchange: 0xc45c3e,
  fund: 0x3d8c5c,
  vault: 0x6b4c9a,
  brokerage: 0x3a6ea5,
  research: 0xd9d2c0,
};
const DARK_TEXT = new Set(["bank", "research"]);

export type GhostRect = { x: number; y: number; w: number; h: number; ok: boolean } | null;

function dashedRect(g: Graphics, x: number, y: number, w: number, h: number, color: number, alpha: number, width = 2, dash = 7, gap = 5) {
  const seg = (x1: number, y1: number, x2: number, y2: number) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const dx = (x2 - x1) / len;
    const dy = (y2 - y1) / len;
    for (let d = 0; d < len; d += dash + gap) {
      const end = Math.min(d + dash, len);
      g.moveTo(x1 + dx * d, y1 + dy * d).lineTo(x1 + dx * end, y1 + dy * end);
    }
  };
  g.strokeStyle = { width, color, alpha, cap: "round" };
  seg(x, y, x + w, y);
  seg(x + w, y, x + w, y + h);
  seg(x + w, y + h, x, y + h);
  seg(x, y + h, x, y);
}

/**
 * PixiJS v8 board renderer. Uses a pixi-viewport as the world container;
 * pan/zoom/pinch are driven manually (same math as the old CSS transforms)
 * so piece drag / long-press / tap-inspect keep full control.
 */
export class PixiBoard {
  private app: Application;
  private viewport: Viewport;
  private background: Sprite | null = null;
  private gridLayer = new Container();
  private piecesLayer = new Container();
  private gridGraphics = new Graphics();
  private ghostGraphics = new Graphics();
  private host: HTMLElement;
  private baseScale = 1;
  private side = 0;
  private liftingId: string | null = null;
  private pieceBounds = new Map<string, { x: number; y: number; w: number; h: number }>();

  private constructor(app: Application, viewport: Viewport, host: HTMLElement) {
    this.app = app;
    this.viewport = viewport;
    this.host = host;
  }

  static async create(host: HTMLElement): Promise<PixiBoard> {
    const app = new Application();
    await app.init({ backgroundAlpha: 0, antialias: true, resizeTo: host });
    host.appendChild(app.canvas);

    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    const viewport = new Viewport({ screenWidth: w, screenHeight: h, worldWidth: w, worldHeight: h, events: app.renderer.events });
    app.stage.addChild(viewport);

    const board = new PixiBoard(app, viewport, host);
    viewport.addChild(board.gridLayer);
    board.gridLayer.addChild(board.gridGraphics, board.ghostGraphics);
    viewport.addChild(board.piecesLayer);

    try {
      const texture: Texture = await Assets.load("/largemap.png");
      const bg = new Sprite(texture);
      bg.anchor.set(0.5);
      bg.position.set(w / 2, h / 2);
      board.background = bg;
      app.stage.addChildAt(bg, 0);
    } catch {
      // Map asset missing — board still works over the plain background.
    }

    board.layout();
    return board;
  }

  get canvas(): HTMLCanvasElement {
    return this.app.canvas;
  }

  get scale(): number {
    return this.viewport.scale.x;
  }

  /** Board grid origin in world px + cell size in world px. */
  get geometry(): { originX: number; originY: number; cell: number } {
    return { originX: this.gridLayer.x, originY: this.gridLayer.y, cell: this.side / BOARD_N };
  }

  private layout() {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.side = Math.min(w, h) * 0.58;
    this.gridLayer.position.set((w - this.side) / 2, (h - this.side) / 2);
    this.drawGrid();
    if (this.background) {
      this.baseScale = Math.max(w / LAND_W, h / LAND_H);
      this.background.position.set(w / 2, h / 2);
      this.background.scale.set(this.baseScale * this.scale);
    }
  }

  resize() {
    this.layout();
    // Pieces are rebuilt by the React layer on resize via setCards.
  }

  private drawGrid() {
    const g = this.gridGraphics;
    g.clear();
    const cell = this.side / BOARD_N;
    g.strokeStyle = { width: 2, color: 0x28301c, alpha: 0.72 };
    for (let i = 1; i < BOARD_N; i++) {
      g.moveTo(i * cell, 0).lineTo(i * cell, this.side);
      g.moveTo(0, i * cell).lineTo(this.side, i * cell);
    }
    g.stroke();
    dashedRect(g, 0, 0, this.side, this.side, 0x2a341e, 0.8);
  }

  setGhost(ghost: GhostRect) {
    const g = this.ghostGraphics;
    g.clear();
    if (!ghost) return;
    const cell = this.side / BOARD_N;
    const color = ghost.ok ? 0xd4a017 : 0xc45c3e;
    g.rect(ghost.x * cell, ghost.y * cell, ghost.w * cell, ghost.h * cell)
      .fill({ color, alpha: 0.35 })
      .stroke({ width: 0, color, alpha: 0 });
    dashedRect(g, ghost.x * cell, ghost.y * cell, ghost.w * cell, ghost.h * cell, color, 1);
  }

  setLifting(id: string | null) {
    this.liftingId = id;
    this.piecesLayer.children.forEach((child) => {
      const piece = child as Container & { pieceId?: string };
      if (piece.pieceId) piece.alpha = piece.pieceId === id ? 0.45 : 1;
    });
  }

  setCards(cards: PlacedCard[]) {
    this.piecesLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.pieceBounds.clear();
    const cell = this.side / BOARD_N;
    for (const card of cards) {
      const [w, h] = orientedFootprint(card.type, card.orientation ?? 0);
      const key = lineageColor(CARDS[card.type]?.lineage ?? "bank");
      const fill = LINEAGE_HEX[key] ?? 0xd9d2c0;
      const piece = new Container() as Container & { pieceId?: string };
      piece.pieceId = card.id;
      piece.position.set(card.x * cell, card.y * cell);
      piece.alpha = card.id === this.liftingId ? 0.45 : 1;

      const body = new Graphics();
      body.rect(0, 0, w * cell, h * cell).fill(fill).stroke({ width: 2, color: 0x1a140c });
      if (card.stage === 2) {
        body
          .rect(2, 2, w * cell - 4, h * cell - 4)
          .stroke({ width: 2, color: 0xffffff, alpha: 0.28 })
          .rect(-2, -2, w * cell + 4, h * cell + 4)
          .stroke({ width: 2, color: 0xd4a017, alpha: 0.3 });
      } else if (card.stage === 3) {
        body
          .rect(3, 3, w * cell - 6, h * cell - 6)
          .stroke({ width: 3, color: 0xffffff, alpha: 0.35 })
          .rect(-6, -6, w * cell + 12, h * cell + 12)
          .stroke({ width: 6, color: 0xd4a017, alpha: 0.18 })
          .rect(-3, -3, w * cell + 6, h * cell + 6)
          .stroke({ width: 2, color: 0xd4a017, alpha: 0.55 });
      }
      piece.addChild(body);

      const textColor = DARK_TEXT.has(key) ? 0x0c0f16 : 0xffffff;
      const name = new Text({
        text: pieceName(card.type),
        style: { fontFamily: '"IBM Plex Sans", sans-serif', fontSize: card.stage === 3 ? 11 : 10, fontWeight: "600", fill: textColor },
      });
      name.position.set(4, 2);
      const stage = new Text({
        text: `S${card.stage}`,
        style: { fontFamily: '"IBM Plex Sans", sans-serif', fontSize: 10, fontWeight: "600", fill: textColor },
      });
      stage.position.set(w * cell - stage.width - 4, h * cell - stage.height - 2);
      piece.addChild(name, stage);

      this.piecesLayer.addChild(piece);
      this.pieceBounds.set(card.id, { x: card.x, y: card.y, w, h });
    }
  }

  /** Hit-test a piece under client coordinates; returns its id. */
  hitPiece(clientX: number, clientY: number): string | null {
    const world = this.clientToWorld(clientX, clientY);
    if (!world) return null;
    const { originX, originY, cell } = this.geometry;
    const gx = (world.x - originX) / cell;
    const gy = (world.y - originY) / cell;
    for (const [id, b] of this.pieceBounds) {
      if (gx >= b.x && gx < b.x + b.w && gy >= b.y && gy < b.y + b.h) return id;
    }
    return null;
  }

  clientToWorld(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return {
      x: (sx - this.viewport.x) / this.viewport.scale.x,
      y: (sy - this.viewport.y) / this.viewport.scale.y,
    };
  }

  screenToCell(clientX: number, clientY: number): { x: number; y: number } | null {
    const world = this.clientToWorld(clientX, clientY);
    if (!world) return null;
    const { originX, originY, cell } = this.geometry;
    const gx = (world.x - originX) / cell;
    const gy = (world.y - originY) / cell;
    if (gx < 0 || gy < 0 || gx >= BOARD_N || gy >= BOARD_N) return null;
    return {
      x: Math.min(BOARD_N - 1, Math.max(0, Math.floor(gx))),
      y: Math.min(BOARD_N - 1, Math.max(0, Math.floor(gy))),
    };
  }

  panBy(dx: number, dy: number) {
    this.viewport.position.set(this.viewport.x + dx, this.viewport.y + dy);
  }

  zoomAt(clientX: number, clientY: number, factor: number) {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.scale * factor));
    const real = scale / this.scale;
    const wx = (x - this.viewport.x) / this.viewport.scale.x;
    const wy = (y - this.viewport.y) / this.viewport.scale.y;
    this.viewport.scale.set(scale);
    this.viewport.position.set(x - wx * scale, y - wy * scale);
    if (this.background) this.background.scale.set(this.baseScale * scale);
  }

  zoomBy(factor: number) {
    const rect = this.canvas.getBoundingClientRect();
    this.zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  }

  destroy() {
    this.app.destroy(true, { children: true });
  }
}

function pieceName(type: string): string {
  return CARDS[type]?.name ?? type;
}
