import { Application, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { CARDS, lineageColor, orientedFootprint, type PlacedCard } from "@plotgo/game";

export const BOARD_N = 12;
const MIN_SCALE = 0.55;
const MAX_SCALE = 3.2;

// 2.5D three-quarter ground plane: x-axis stays horizontal, the depth axis
// slants down-right and is foreshortened (~53° elevation, mobile-builder style).
const TILT_SKEW = 0.45; // horizontal shift per unit of depth
const TILT_SQUASH = 0.8; // vertical foreshortening of depth
const TILT_K = Math.atan(TILT_SKEW); // pixi skew.x angle with tan(k) = shift

// Environment palette (all vector — every layer is tunable here).
const GRASS = 0x7cb840;
const GRASS_LIGHT = 0x8fca4f;
const GRASS_DARK = 0x6aa836;
const FOREST = 0x477a26;
const FOREST_DEEP = 0x38651d;

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

/** Multiply a hex color's brightness by `f`. */
function shade(hex: number, f: number): number {
  const r = Math.min(255, Math.round(((hex >> 16) & 0xff) * f));
  const gg = Math.min(255, Math.round(((hex >> 8) & 0xff) * f));
  const b = Math.min(255, Math.round((hex & 0xff) * f));
  return (r << 16) | (gg << 8) | b;
}

/** Deterministic pseudo-random in [0, 1) for stable decoration placement. */
function hash3(a: number, b: number, c: number): number {
  let x = (a * 73856093) ^ (b * 19349663) ^ (c * 83492791);
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/**
 * PixiJS v8 board renderer. Everything — ground, forest edge, dirt clearing,
 * plots and building cards — lives in one tilted 2.5D ground plane (tiltLayer),
 * so the whole scene shares a single three-quarter perspective. The camera is
 * RTS-style: fixed frame, zoom at cursor / pinch only (no panning). Pointer
 * math inverts the tilt via worldToGrid().
 */
export class PixiBoard {
  private app: Application;
  private viewport: Viewport;
  private tiltLayer = new Container();
  private envLayer = new Container();
  private gridLayer = new Container();
  private piecesLayer = new Container();
  private envGraphics = new Graphics();
  private gridGraphics = new Graphics();
  private ghostGraphics = new Graphics();
  private envBlobs: Sprite[] = [];
  private blobTex: Texture | null = null;
  private host: HTMLElement;
  private side = 0;
  private framed = false;
  private liftingId: string | null = null;
  private pieceBounds = new Map<string, { x: number; y: number; w: number; h: number }>();

  private constructor(app: Application, viewport: Viewport, host: HTMLElement) {
    this.app = app;
    this.viewport = viewport;
    this.host = host;
  }

  /** Soft radial-gradient blob (shared white gradient texture, tinted). */
  private blob(x: number, y: number, r: number, color: number, alpha: number) {
    if (!this.blobTex) {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const ctx = c.getContext("2d")!;
      const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.6, "rgba(255,255,255,0.5)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);
      this.blobTex = Texture.from(c);
    }
    const s = new Sprite(this.blobTex);
    s.anchor.set(0.5);
    s.position.set(x, y);
    s.width = s.height = r * 2;
    s.tint = color;
    s.alpha = alpha;
    this.envLayer.addChild(s);
    this.envBlobs.push(s);
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
    board.tiltLayer.skew.x = TILT_K;
    board.tiltLayer.scale.y = TILT_SQUASH;
    viewport.addChild(board.tiltLayer);
    board.tiltLayer.addChild(board.envLayer, board.gridLayer, board.piecesLayer);
    board.envLayer.addChild(board.envGraphics);
    board.gridLayer.addChild(board.gridGraphics, board.ghostGraphics);

    board.layout();
    return board;
  }

  get canvas(): HTMLCanvasElement {
    return this.app.canvas;
  }

  get scale(): number {
    return this.viewport.scale.x;
  }

  /** Width reserved on the right edge of the host (0 — the panel rail was
   *  replaced by the bottom dock, so the board centers in the full window). */
  private reservedRight(): number {
    return 0;
  }

  private layout() {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.side = Math.min(w, h) * 0.58;
    // Visible world extents at the framed zoom (tilt y is foreshortened).
    const availW = w - this.reservedRight();
    const box = this.boardBox();
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, (Math.min(availW / box.w, h / box.h) * 0.92)));
    const view = {
      halfW: availW / (2 * scale),
      halfH: h / (2 * scale) / TILT_SQUASH,
    };
    this.drawEnvironment(view);
    this.drawGrid();
    if (!this.framed) {
      this.frameBoard();
      this.framed = true;
    }
  }

  /** Screen-space bounding box of the tilted board. */
  private boardBox(): { w: number; h: number; cx: number; cy: number } {
    const bw = this.side * (1 + TILT_SKEW);
    const bh = this.side * TILT_SQUASH;
    return { w: bw, h: bh, cx: bw / 2, cy: bh / 2 };
  }

  /** RTS framing: zoom so the tilted board fills the view and center it. */
  private frameBoard() {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    const availW = w - this.reservedRight();
    const box = this.boardBox();
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, (Math.min(availW / box.w, h / box.h) * 0.92)));
    this.viewport.scale.set(scale);
    this.tiltLayer.position.set(availW / 2 - box.cx * scale, h / 2 - box.cy * scale);
  }

  resize() {
    this.layout();
    // Pieces are rebuilt by the React layer on resize via setCards.
  }

  /** Vector 2.5D environment: grass ground, forest ring, soft shadow, decor. */
  private drawEnvironment(view: { halfW: number; halfH: number }) {
    const g = this.envGraphics;
    g.clear();
    for (const b of this.envBlobs) b.destroy();
    this.envBlobs = [];
    const cx = this.side / 2;
    // Visible region in ground-local units (skew shifts x by depth).
    const rx = (view.halfW + TILT_SKEW * view.halfH) * 1.25;
    const ry = view.halfH * 1.25;

    // Grass ground base covering the whole view.
    g.rect(cx - rx, cx - ry, rx * 2, ry * 2).fill(GRASS);

    // Large soft tonal blobs to break up the flat green.
    for (let i = 0; i < 30; i++) {
      const x = cx + (hash3(i, 1, 0) - 0.5) * rx * 2;
      const y = cx + (hash3(i, 2, 0) - 0.5) * ry * 2;
      const r = this.side * (0.15 + hash3(i, 3, 0) * 0.25);
      this.blob(x, y, r, hash3(i, 4, 0) > 0.5 ? GRASS_LIGHT : GRASS_DARK, 0.3);
    }

    // Forest ring: overlapping canopy masses hugging the visible edges.
    const trees = 42;
    for (let i = 0; i < trees; i++) {
      const a = (i / trees) * Math.PI * 2 + hash3(i, 5, 0) * 0.18;
      const d = 0.94 + hash3(i, 6, 0) * 0.22;
      const x = cx + Math.cos(a) * rx * d;
      const y = cx + Math.sin(a) * ry * d;
      const r = this.side * (0.12 + hash3(i, 7, 0) * 0.1);
      this.blob(x, y, r, hash3(i, 8, 0) > 0.45 ? FOREST : FOREST_DEEP, 0.95);
      // Canopy highlight.
      this.blob(x - r * 0.2, y - r * 0.25, r * 0.5, GRASS_DARK, 0.5);
    }

    // Soft ground shadow under the buildable field.
    this.blob(cx + this.side * 0.02, cx + this.side * 0.03, this.side * 0.72, 0x3c5c22, 0.4);

    // Sparse decoration between the clearing and the forest: tufts, flowers, stones.
    for (let i = 0; i < 110; i++) {
      const a = hash3(i, 13, 0) * Math.PI * 2;
      const d = 0.6 + hash3(i, 14, 0) * 0.32;
      const x = cx + Math.cos(a) * rx * d;
      const y = cx + Math.sin(a) * ry * d;
      // Keep clear of the buildable field.
      if (x > -this.side * 0.1 && x < this.side * 1.1 && y > -this.side * 0.1 && y < this.side * 1.1) continue;
      const kind = hash3(i, 15, 0);
      if (kind < 0.55) {
        // Grass tuft: three small blades.
        g.strokeStyle = { width: 2.5, color: shade(GRASS_DARK, 0.85), alpha: 0.8, cap: "round" };
        for (let b = -1; b <= 1; b++) {
          g.moveTo(x, y).lineTo(x + b * 4, y - 8 - Math.abs(b) * -2 - hash3(i, b + 2, 0) * 4).stroke();
        }
      } else if (kind < 0.8) {
        // Tiny flower.
        const fc = hash3(i, 16, 0) > 0.5 ? 0xffffff : 0xf2d54e;
        for (let p = 0; p < 4; p++) {
          const pa = (p / 4) * Math.PI * 2;
          g.circle(x + Math.cos(pa) * 3, y + Math.sin(pa) * 3, 2.2).fill({ color: fc, alpha: 0.9 });
        }
        g.circle(x, y, 2).fill({ color: 0xe8a13c, alpha: 0.9 });
      } else {
        // Small stone.
        const sw = 5 + hash3(i, 17, 0) * 5;
        const sh = 3.5 + hash3(i, 18, 0) * 3;
        g.ellipse(x, y, sw, sh)
          .fill({ color: 0x9aa08e, alpha: 0.9 });
        g.ellipse(x - 1, y - 1.5, sw * 0.55, sh * 0.55).fill({ color: 0xb9bfae, alpha: 0.7 });
      }
    }
  }

  /** Grass-tone squares painted flush on the ground — the grid is a faint
   *  texture of the floor itself (mobile-builder style), not raised tiles. */
  private drawGrid() {
    const g = this.gridGraphics;
    g.clear();
    const cell = this.side / BOARD_N;

    // Faint boundary where the buildable field ends (soft trampled grass).
    g.roundRect(-cell * 0.12, -cell * 0.12, this.side + cell * 0.24, this.side + cell * 0.24, cell * 0.4)
      .fill({ color: GRASS_DARK, alpha: 0.16 });

    for (let row = 0; row < BOARD_N; row++) {
      for (let col = 0; col < BOARD_N; col++) {
        const x = col * cell;
        const y = row * cell;
        // Barely-there tone variation between neighbouring squares.
        const tone = 0.95 + hash3(row, col, 7) * 0.1;
        g.rect(x, y, cell + 0.5, cell + 0.5)
          .fill({ color: shade((row + col) % 2 === 0 ? GRASS_LIGHT : GRASS, tone), alpha: 0.32 });
      }
    }
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

      const bw = w * cell;
      const bh = h * cell;

      // Soft ground shadow so the illustrated card sits in the scene.
      const shadow = new Graphics();
      shadow
        .roundRect(cell * 0.06, cell * 0.09, bw, bh, cell * 0.1)
        .fill({ color: 0x2a1e0c, alpha: 0.28 });

      // Flat illustrated card (no extrusion — buildings are cards, not boxes).
      const body = new Graphics();
      body.roundRect(0, 0, bw, bh, cell * 0.08).fill(fill).stroke({ width: 2, color: shade(fill, 0.45) });
      if (card.stage === 2) {
        body
          .roundRect(2, 2, bw - 4, bh - 4, cell * 0.06)
          .stroke({ width: 2, color: 0xffffff, alpha: 0.28 })
          .roundRect(-2, -2, bw + 4, bh + 4, cell * 0.1)
          .stroke({ width: 2, color: 0xd4a017, alpha: 0.3 });
      } else if (card.stage === 3) {
        body
          .roundRect(3, 3, bw - 6, bh - 6, cell * 0.06)
          .stroke({ width: 3, color: 0xffffff, alpha: 0.35 })
          .roundRect(-6, -6, bw + 12, bh + 12, cell * 0.12)
          .stroke({ width: 6, color: 0xd4a017, alpha: 0.18 })
          .roundRect(-3, -3, bw + 6, bh + 6, cell * 0.1)
          .stroke({ width: 2, color: 0xd4a017, alpha: 0.55 });
      }

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
      stage.position.set(bw - stage.width - 4, bh - stage.height - 2);

      piece.addChild(shadow, body, name, stage);
      this.piecesLayer.addChild(piece);
      this.pieceBounds.set(card.id, { x: card.x, y: card.y, w, h });
    }
  }

  /** Viewport-space world coords → grid coords (inverts the 2.5D tilt). */
  private worldToGrid(wx: number, wy: number): { gx: number; gy: number } {
    const sx = wx - this.tiltLayer.x;
    const sy = wy - this.tiltLayer.y;
    const gy = sy / TILT_SQUASH;
    const gx = sx - TILT_SKEW * gy;
    return { gx, gy };
  }

  /** Hit-test a piece under client coordinates; returns its id. */
  hitPiece(clientX: number, clientY: number): string | null {
    const world = this.clientToWorld(clientX, clientY);
    if (!world) return null;
    const { gx, gy } = this.worldToGrid(world.x, world.y);
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
    const { gx, gy } = this.worldToGrid(world.x, world.y);
    if (gx < 0 || gy < 0 || gx >= BOARD_N || gy >= BOARD_N) return null;
    return {
      x: Math.min(BOARD_N - 1, Math.max(0, Math.floor(gx))),
      y: Math.min(BOARD_N - 1, Math.max(0, Math.floor(gy))),
    };
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
