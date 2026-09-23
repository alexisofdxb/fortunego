import "./styles.css";
import {
  BOARD,
  CARDS,
  ERA_LABEL,
  ERA_ORDER,
  STAGE_LABEL,
  cardCustomers,
  cardHourMinor,
  fits,
  lineageColor,
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
  const x = Math.min(BOARD - 1, Math.max(0, Math.floor(((clientX - r.left) / r.width) * BOARD)));
  const y = Math.min(BOARD - 1, Math.max(0, Math.floor(((clientY - r.top) / r.height) * BOARD)));
  return { x, y };
}

function tileStyle(x: number, y: number, w: number, h: number): string {
  return `left:${(x / BOARD) * 100}%;top:${(y / BOARD) * 100}%;width:${(w / BOARD) * 100}%;height:${(h / BOARD) * 100}%;`;
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
      : "Drag a building onto the board · drag a placed card to move it";
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
    const catalog = t.closest<HTMLElement>("[data-drag-type]");
    const piece = t.closest<HTMLElement>(".piece");
    if (catalog) {
      const type = catalog.dataset.dragType!;
      drag = { kind: "place", type };
      catalog.setPointerCapture(e.pointerId);
      document.body.classList.add("dragging");
      inspectId = null;
      const at = cellAt(e.clientX, e.clientY);
      ghost = at ? { ...at, ok: fits(plot.cards, type, at.x, at.y) } : null;
      paintGhost();
      e.preventDefault();
      return;
    }
    if (piece?.dataset.id) {
      const card = plot.cards.find((c) => c.id === piece.dataset.id);
      if (!card) return;
      drag = {
        kind: "move",
        id: card.id,
        type: card.type,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
      };
      piece.setPointerCapture(e.pointerId);
      piece.classList.add("lifting");
      document.body.classList.add("dragging");
      e.preventDefault();
    }
  });
  app.addEventListener("pointermove", (e) => {
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
      ok: fits(plot.cards, drag.type, at.x, at.y, ignoreId()),
    };
    paintGhost();
  });
  app.addEventListener("pointerup", (e) => {
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
  app.addEventListener("pointercancel", () => {
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
  });
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
  const frags =
    Object.entries(plot.fragments)
      .map(([t, u]) => `<div><b>${t}</b> ${u.toFixed(2)}</div>`)
      .join("") || `<div>No fragments yet</div>`;

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

  app.innerHTML = `
    <aside class="panel">
      <h1 class="brand">PlotGo</h1>
      <p class="sub">Founder Plot · 12×12</p>
      <div class="stat"><span>Cash</span><b>${plot.cash}</b></div>
      <div class="stat"><span>Income / 10s</span><b>${cashLabel(plot.tickMinor)}</b></div>
      <div class="stat"><span>Founder</span><b>badge</b></div>
      <h2>Buildings</h2>
      <p class="sub" id="place-hint">Start humble. Stage 2 unlocks the next shop in that line.</p>
      <div class="cards">
        ${ERA_ORDER.map((era) => {
          const rows = plot.catalog.filter((c) => {
            if (c.era !== era) return false;
            if (c.unlocked) return true;
            if (c.requires && plot.cards.some((p) => p.type === c.requires)) return true;
            return false;
          });
          if (!rows.length) return "";
          return `<div class="era">${ERA_LABEL[era]}</div>${rows
            .map((c) =>
              c.unlocked
                ? `<button class="card-btn" type="button" data-drag-type="${c.id}">
              <span class="cost">${cashLabel(c.placeCostMinor)}</span>
              ${c.name}<small>${c.footprint[0]}×${c.footprint[1]} · ${c.blurb}</small>
            </button>`
                : `<button class="card-btn locked" type="button" disabled>
              <span class="cost">locked</span>
              ${c.name}<small>Raise the previous building to stage 2</small>
            </button>`,
            )
            .join("")}`;
        }).join("")}
      </div>
    </aside>
    <main>
      <div class="board-wrap">
        <div class="hud">
          <div>
            <div class="sub" style="margin:0">This Plot is yours</div>
            <div>Drag to place or move · click a building for details</div>
          </div>
          <div class="ev">${plot.empireValue}</div>
        </div>
        <div class="grid" id="grid">
          <div class="ghost" id="ghost" hidden></div>
          ${pieces}
        </div>
      </div>
    </main>
    <aside class="panel">
      <div class="hunt">
        <h2>Market Hunt</h2>
        <p>${plot.hunt.title}</p>
        <p class="sub">${plot.hunt.hint}</p>
        <div class="bar"><i style="width:${huntPct}%"></i></div>
        <p class="sub">${plot.hunt.progress.current} / ${plot.hunt.progress.target}</p>
        <button class="claim" type="button" ${plot.hunt.ready ? "" : "disabled"}>Claim hunt</button>
        <p class="toast">${toast}</p>
      </div>
      <h2>Portfolio</h2>
      <div class="frags">${frags}</div>
      <h2>Weekly Empire Score</h2>
      <div class="stat"><span>Score</span><b>${cashLabel(plot.weeklyScore)}</b></div>
      <p class="note">Payout is not redeemable yet. We are reading how fast Cash grows before a $PLOT pool is attached.</p>
      <p class="note">Plot id ${plot.playerId.slice(0, 8)}</p>
    </aside>
    ${modalHtml()}
  `;
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
  setInterval(async () => {
    if (drag) return;
    try {
      plot = await api("/api/plot");
      if (!drag) render();
    } catch {
      /* keep last */
    }
  }, 10_000);
}

boot();
