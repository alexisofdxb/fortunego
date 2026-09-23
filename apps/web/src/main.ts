import "./styles.css";
import {
  BOARD,
  CARDS,
  ERA_LABEL,
  STAGE_LABEL,
  cardCustomers,
  cardHourMinor,
  fits,
  lineageColor,
  plotRank,
  boardSize,
  upgradeCostMinor,
  type Era,
  type PlacedCard,
} from "@plotgo/game";

type Plot = {
  playerId: string;
  cash: string;
  cashMinor: number;
  empireValue: string;
  earnedMinor: number;
  weeklyScore: number;
  weeklyRedeemable: boolean;
  tickMinor: number;
  cards: PlacedCard[];
  catalog: {
    id: string;
    name: string;
    era: Era;
    lineage: string;
    blurb: string;
    description: string;
    placeCostMinor: number;
    footprint: [number, number];
    requires: string | null;
    unlocked: boolean;
  }[];
  fragments: Record<string, number>;
  hunt: {
    id: string;
    title: string;
    hint: string;
    claimed: boolean;
    ready: boolean;
    progress: { current: number; target: number; done: boolean };
  };
  dropped?: string | null;
};

const KEY = "plotgo.playerId";
let playerId = localStorage.getItem(KEY) ?? "";
let plot: Plot | null = null;
let toast = "";
let inspectId: string | null = null;
type Drag =
  | { kind: "place"; type: string }
  | { kind: "move"; id: string; type: string; startX: number; startY: number; moved: boolean };
let drag: Drag | null = null;
let ghost: { x: number; y: number; ok: boolean } | null = null;
const LAND_W = 1672;
const LAND_H = 941;
let boardN = 12;
let lastRank = -1;
let panX = 0;
let panY = 0;
let zoom = 1;
let pan: { lastX: number; lastY: number; startX: number; startY: number; pieceId: string | null; moved: boolean } | null =
  null;
let didCenter = false;
let longPress: ReturnType<typeof setTimeout> | null = null;
const pointers = new Map<number, { x: number; y: number }>();
let pinch = 0;

function applyCam() {
  const land = document.querySelector<HTMLElement>("#land");
  const grid = document.querySelector<HTMLElement>("#grid");
  if (land) land.style.transform = `scale(${zoom})`;
  if (grid) grid.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
}

function zoomAt(cx: number, cy: number, factor: number) {
  const view = document.querySelector<HTMLElement>("#board-view");
  if (!view) return;
  const r = view.getBoundingClientRect();
  const x = cx - r.left;
  const y = cy - r.top;
  const wx = (x - panX) / zoom;
  const wy = (y - panY) / zoom;
  zoom = Math.min(3.2, Math.max(0.55, zoom * factor));
  panX = x - wx * zoom;
  panY = y - wy * zoom;
  applyCam();
}

function layoutWorld() {
  const view = document.querySelector<HTMLElement>("#board-view");
  const grid = document.querySelector<HTMLElement>("#grid");
  if (!view || !grid) return;
  const r = view.getBoundingClientRect();
  boardN = 12;
  const side = Math.min(r.width, r.height) * 0.58;
  const cell = side / boardN;
  grid.style.width = `${side}px`;
  grid.style.height = `${side}px`;
  grid.style.left = `${(r.width - side) / 2}px`;
  grid.style.top = `${(r.height - side) / 2}px`;
  grid.style.setProperty("--cell", `${cell}px`);
  if (!didCenter) {
    panX = 0;
    panY = 0;
    zoom = 1;
    didCenter = true;
  }
  applyCam();
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-player-id": playerId,
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

function cashLabel(minor: number) {
  return `$${Math.floor(minor / 100).toLocaleString()}`;
}

function cellAt(clientX: number, clientY: number): { x: number; y: number } | null {
  const grid = document.querySelector<HTMLElement>("#grid");
  if (!grid) return null;
  const r = grid.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  if (clientX < r.left || clientY < r.top || clientX >= r.right || clientY >= r.bottom) return null;
  const x = Math.min(boardN - 1, Math.max(0, Math.floor(((clientX - r.left) / r.width) * boardN)));
  const y = Math.min(boardN - 1, Math.max(0, Math.floor(((clientY - r.top) / r.height) * boardN)));
  return { x, y };
}

function tileStyle(x: number, y: number, w: number, h: number): string {
  return `left:${(x / boardN) * 100}%;top:${(y / boardN) * 100}%;width:${(w / boardN) * 100}%;height:${(h / boardN) * 100}%;`;
}

function ignoreId(): string | undefined {
  return drag?.kind === "move" ? drag.id : undefined;
}

function paintGhost() {
  const el = document.querySelector<HTMLElement>("#ghost");
  const hint = document.querySelector("#place-hint");
  if (hint) {
    hint.textContent = drag
      ? drag.kind === "move"
        ? `Move ${CARDS[drag.type].name}`
        : `Drop ${CARDS[drag.type].name} on the board`
      : "Drag the map to pan · tap a building · hold to move";
  }
  if (!el || !drag) {
    if (el) el.hidden = true;
    return;
  }
  if (!ghost) {
    el.hidden = true;
    return;
  }
  const [w, h] = CARDS[drag.type].footprint;
  el.hidden = false;
  el.classList.toggle("bad", !ghost.ok);
  el.setAttribute("style", tileStyle(ghost.x, ghost.y, w, h));
}

function bindOnce() {
  const app = document.querySelector("#app")!;
  app.addEventListener("pointerdown", (e) => {
    if (!plot) return;
    const t = e.target as HTMLElement;
    if (t.closest(".modal-card")) return;
    if (t.closest(".modal-backdrop")) return;
    if (t.closest(".zoom-fab")) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
      pan = null;
      return;
    }
    const catalog = t.closest<HTMLElement>("[data-drag-type]");
    const piece = t.closest<HTMLElement>(".piece");
    if (catalog) {
      const type = catalog.dataset.dragType!;
      drag = { kind: "place", type };
      catalog.setPointerCapture(e.pointerId);
      document.body.classList.add("dragging");
      inspectId = null;
      const at = cellAt(e.clientX, e.clientY);
      ghost = at ? { ...at, ok: fits(plot.cards, type, at.x, at.y, undefined, boardN) } : null;
      paintGhost();
      e.preventDefault();
      return;
    }
    if (t.closest("#board-view")) {
      const pieceId = piece?.dataset.id ?? null;
      pan = {
        lastX: e.clientX,
        lastY: e.clientY,
        startX: e.clientX,
        startY: e.clientY,
        pieceId,
        moved: false,
      };
      (t.closest("#board-view") as HTMLElement).setPointerCapture(e.pointerId);
      if (pieceId) {
        longPress = setTimeout(() => {
          if (!pan || !plot || pan.moved) return;
          const card = plot.cards.find((c) => c.id === pieceId);
          if (!card) return;
          drag = {
            kind: "move",
            id: card.id,
            type: card.type,
            startX: pan.startX,
            startY: pan.startY,
            moved: true,
          };
          document.querySelector(`.piece[data-id="${pieceId}"]`)?.classList.add("lifting");
          document.body.classList.add("dragging");
          pan = null;
        }, 420);
      }
      e.preventDefault();
    }
  });
  app.addEventListener("pointermove", (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      zoomAt(midX, midY, d / pinch);
      pinch = d;
      return;
    }
    if (pan && !drag) {
      const dist = Math.hypot(e.clientX - pan.startX, e.clientY - pan.startY);
      if (dist > 10) {
        pan.moved = true;
        if (longPress) {
          clearTimeout(longPress);
          longPress = null;
        }
      }
      panX += e.clientX - pan.lastX;
      panY += e.clientY - pan.lastY;
      pan.lastX = e.clientX;
      pan.lastY = e.clientY;
      applyCam();
      return;
    }
    if (!drag || !plot) return;
    if (drag.kind === "move" && !drag.moved) {
      const dist = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
      if (dist < 8) return;
      drag.moved = true;
    }
    const at = cellAt(e.clientX, e.clientY);
    if (!at) {
      ghost = null;
      paintGhost();
      return;
    }
    ghost = {
      ...at,
      ok: fits(plot.cards, drag.type, at.x, at.y, ignoreId(), boardN),
    };
    paintGhost();
  });
  app.addEventListener("pointerup", (e) => {
    pointers.delete(e.pointerId);
    pinch = 0;
    if (longPress) {
      clearTimeout(longPress);
      longPress = null;
    }
    if (pan) {
      const hold = pan;
      pan = null;
      if (!drag && !hold.moved && hold.pieceId) {
        inspectId = hold.pieceId;
        render();
        return;
      }
      if (!drag) return;
    }
    if (!drag || !plot) return;
    const current = drag;
    const at = cellAt(e.clientX, e.clientY);
    drag = null;
    ghost = null;
    document.body.classList.remove("dragging");
    document.querySelectorAll(".piece.lifting").forEach((n) => n.classList.remove("lifting"));
    paintGhost();
    if (current.kind === "place") {
      if (at) void place(current.type, at.x, at.y);
      return;
    }
    if (!current.moved) {
      inspectId = current.id;
      render();
      return;
    }
    if (at) void moveCard(current.id, at.x, at.y);
  });
  app.addEventListener("pointercancel", (e) => {
    pointers.delete(e.pointerId);
    pinch = 0;
    pan = null;
    drag = null;
    ghost = null;
    document.body.classList.remove("dragging");
    document.querySelectorAll(".piece.lifting").forEach((n) => n.classList.remove("lifting"));
    paintGhost();
  });
  app.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("[data-close-modal]")) {
      inspectId = null;
      render();
      return;
    }
    const up = t.closest<HTMLElement>("[data-upgrade]");
    if (up?.dataset.upgrade) {
      void upgrade(up.dataset.upgrade);
      return;
    }
    const claim = t.closest<HTMLButtonElement>("button.claim");
    if (claim && !claim.disabled && !claim.dataset.upgrade) void claimHunt();
    const zb = t.closest<HTMLElement>("[data-zoom]");
    if (zb?.dataset.zoom) {
      const view = document.querySelector<HTMLElement>("#board-view");
      if (!view) return;
      const r = view.getBoundingClientRect();
      zoomAt(r.left + r.width / 2, r.top + r.height / 2, zb.dataset.zoom === "in" ? 1.18 : 0.85);
    }
  });
  app.addEventListener(
    "wheel",
    (e) => {
      if (!(e.target as HTMLElement).closest("#board-view")) return;
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 0.92 : 1.09);
    },
    { passive: false },
  );
}

function modalHtml(): string {
  if (!plot || !inspectId) return "";
  const card = plot.cards.find((c) => c.id === inspectId);
  if (!card) return "";
  const spec = CARDS[card.type];
  const [w, h] = spec.footprint;
  const hour = cardHourMinor(card, plot.cards);
  const customers = cardCustomers(card);
  const next = card.stage < 3 ? upgradeCostMinor(card.type, card.stage as 1 | 2) : null;
  const stages = ([1, 2, 3] as const)
    .map(
      (s) =>
        `<span class="lvl ${s <= card.stage ? "on" : ""}">${s} ${STAGE_LABEL[s]}</span>`,
    )
    .join("");
  return `
    <div class="modal-backdrop" data-close-modal="1"></div>
    <div class="modal-card" role="dialog">
      <button class="modal-x" type="button" data-close-modal="1">×</button>
      <div class="modal-art" data-type="${lineageColor(spec.lineage)}">
        <span>${spec.name}</span>
        <small>${w}×${h} · ${STAGE_LABEL[card.stage]}</small>
      </div>
      <h2>${spec.name}</h2>
      <p class="modal-desc">${spec.description}</p>
      <div class="modal-stats">
        <div><span>Level</span><b>${card.stage} / 3</b></div>
        <div><span>Customers</span><b>${customers.toLocaleString()}</b></div>
        <div><span>Earn / hour</span><b>${cashLabel(hour)}</b></div>
        <div><span>Footprint</span><b>${w}×${h}</b></div>
      </div>
      <div class="lvl-row">${stages}</div>
      ${
        next === null
          ? `<p class="note">Max stage. Drag the building to move it.</p>`
          : `<button class="claim" type="button" data-upgrade="${card.id}">Upgrade to ${STAGE_LABEL[(card.stage + 1) as 2 | 3]} · ${cashLabel(next)}</button>`
      }
    </div>
  `;
}

function render() {
  const app = document.querySelector("#app")!;
  if (!plot) {
    app.innerHTML = `<div class="panel"><p>Opening your Founder Plot…</p></div>`;
    return;
  }
  const huntPct = Math.min(
    100,
    Math.round((plot.hunt.progress.current / Math.max(1, plot.hunt.progress.target)) * 100),
  );
  const pieces = plot.cards
    .map((c) => {
      const [w, h] = CARDS[c.type].footprint;
      const spec = CARDS[c.type];
      return `<button class="piece" type="button" data-type="${lineageColor(spec.lineage)}" data-id="${c.id}"
        style="${tileStyle(c.x, c.y, w, h)}">
        <span>${spec.name}</span><span>S${c.stage}</span>
      </button>`;
    })
    .join("");

  const hand = plot.catalog.filter((c) => {
    if (c.unlocked) return true;
    if (c.requires && plot.cards.some((p) => p.type === c.requires)) return true;
    return c.era === "humble";
  });

  app.innerHTML = `
    <header class="top">
      <div>
        <h1 class="brand">PlotGo</h1>
        <p class="sub">Founder · 12×12</p>
      </div>
      <div class="top-stats">
        <div><span>Cash</span><b>${plot.cash}</b></div>
        <div><span>Empire</span><b>${plot.empireValue}</b></div>
      </div>
    </header>
    <div class="hunt-strip">
      <div>
        <b>Market Hunt</b>
        <span>${plot.hunt.title}</span>
        <div class="bar"><i style="width:${huntPct}%"></i></div>
      </div>
      <button class="claim" type="button" ${plot.hunt.ready ? "" : "disabled"}>Claim</button>
    </div>
    <p class="toast strip-toast">${toast}</p>
    <main class="board-wrap" id="board-view">
      <div id="world">
        <div id="land">
          <div class="grid" id="grid">
            <div class="ghost" id="ghost" hidden></div>
            ${pieces}
          </div>
        </div>
      </div>
      <div class="zoom-fab">
        <button type="button" data-zoom="in">+</button>
        <button type="button" data-zoom="out">−</button>
      </div>
    </main>
    <p class="place-hint" id="place-hint">Drag a card onto the board</p>
    <section class="hand">
      <div class="hand-track">
        ${hand
          .map((c) =>
            c.unlocked
              ? `<button class="play-card" type="button" data-drag-type="${c.id}" title="${c.name}">
            <i></i><i></i><i></i><i></i>
            <span class="play-era">${ERA_LABEL[c.era]}</span>
            <span class="play-name">${c.name}</span>
            <span class="play-meta">${c.footprint[0]}×${c.footprint[1]} · ${cashLabel(c.placeCostMinor)}</span>
          </button>`
              : `<button class="play-card back" type="button" disabled title="Locked">
            <svg viewBox="0 0 40 40" aria-hidden="true"><rect x="7" y="6" width="16" height="22" rx="2" fill="none" stroke="currentColor"/><rect x="14" y="11" width="16" height="22" rx="2" fill="none" stroke="currentColor"/></svg>
          </button>`,
          )
          .join("")}
      </div>
    </section>
    ${modalHtml()}
  `;
  requestAnimationFrame(() => layoutWorld());
}

async function place(type: string, x: number, y: number) {
  try {
    plot = await api("/api/plot/place", {
      method: "POST",
      body: JSON.stringify({ type, x, y }),
    });
    toast = `${CARDS[type].name} placed. Cash is growing.`;
    render();
  } catch (e) {
    toast = (e as Error).message;
    render();
  }
}

async function moveCard(cardId: string, x: number, y: number) {
  try {
    plot = await api("/api/plot/move", {
      method: "POST",
      body: JSON.stringify({ cardId, x, y }),
    });
    toast = "Building moved.";
    render();
  } catch (e) {
    toast = (e as Error).message;
    render();
  }
}

async function upgrade(cardId: string) {
  try {
    plot = await api("/api/plot/upgrade", { method: "POST", body: JSON.stringify({ cardId }) });
    toast = "Building upgraded. Empire Value moved.";
    inspectId = cardId;
    render();
  } catch (e) {
    toast = (e as Error).message;
    render();
  }
}

async function claimHunt() {
  try {
    const data = await api("/api/hunt/claim", { method: "POST", body: "{}" });
    plot = data;
    toast = data.dropped ? `You found a ${data.dropped} fragment.` : "Hunt claimed.";
    render();
  } catch (e) {
    toast = (e as Error).message;
    render();
  }
}

async function boot() {
  bindOnce();
  const data = await api("/api/session", {
    method: "POST",
    body: JSON.stringify({ playerId: playerId || undefined }),
  });
  playerId = data.playerId;
  localStorage.setItem(KEY, playerId);
  plot = data.plot;
  render();
  window.addEventListener("resize", () => layoutWorld());
  setInterval(async () => {
    if (drag) return;
    try {
      plot = await api("/api/plot");
      if (!drag && !pan) {
        render();
        layoutWorld();
      }
    } catch {
      /* keep last */
    }
  }, 10_000);
}

boot();
