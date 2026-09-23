import "./styles.css";
import { BOARD, CARDS, fits, type CardId, type PlacedCard } from "@plotgo/game";

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
  catalog: { id: CardId; name: string; blurb: string; placeCostMinor: number; footprint: [number, number] }[];
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
let drag: { type: CardId; pointerId: number } | null = null;
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

function paintGhost() {
  const el = document.querySelector<HTMLElement>("#ghost");
  const hint = document.querySelector("#place-hint");
  if (hint) {
    hint.textContent = drag
      ? `Drop ${CARDS[drag.type].name} on the board`
      : "Drag a building onto the board";
  }
  if (!el) return;
  if (!drag || !ghost) {
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
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-drag-type]");
    if (!btn || !plot) return;
    const type = btn.dataset.dragType as CardId;
    drag = { type, pointerId: e.pointerId };
    btn.setPointerCapture(e.pointerId);
    document.body.classList.add("dragging");
    const at = cellAt(e.clientX, e.clientY);
    if (at) {
      ghost = { ...at, ok: fits(plot.cards, type, at.x, at.y) };
    } else ghost = null;
    paintGhost();
    e.preventDefault();
  });
  app.addEventListener("pointermove", (e) => {
    if (!drag || !plot) return;
    const at = cellAt(e.clientX, e.clientY);
    if (!at) {
      ghost = null;
      paintGhost();
      return;
    }
    ghost = { ...at, ok: fits(plot.cards, drag.type, at.x, at.y) };
    paintGhost();
  });
  app.addEventListener("pointerup", (e) => {
    if (!drag) return;
    const type = drag.type;
    const at = cellAt(e.clientX, e.clientY);
    drag = null;
    document.body.classList.remove("dragging");
    paintGhost();
    if (at) void place(type, at.x, at.y);
  });
  app.addEventListener("pointercancel", () => {
    drag = null;
    ghost = null;
    document.body.classList.remove("dragging");
    paintGhost();
  });
  app.addEventListener("click", (e) => {
    const piece = (e.target as HTMLElement).closest<HTMLElement>(".piece");
    if (piece?.dataset.id) void upgrade(piece.dataset.id);
    const claim = (e.target as HTMLElement).closest<HTMLButtonElement>(".claim");
    if (claim && !claim.disabled) void claimHunt();
  });
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
      return `<button class="piece" type="button" data-type="${c.type}" data-id="${c.id}"
        style="${tileStyle(c.x, c.y, w, h)}">
        <span>${CARDS[c.type].name}</span><span>S${c.stage}</span>
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
      <p class="sub" id="place-hint">Drag a building onto the board</p>
      <div class="cards">
        ${plot.catalog
          .map(
            (c) => `<button class="card-btn" type="button" data-drag-type="${c.id}">
              <span class="cost">${cashLabel(c.placeCostMinor)}</span>
              ${c.name}<small>${c.blurb}</small>
            </button>`,
          )
          .join("")}
      </div>
    </aside>
    <main>
      <div class="board-wrap">
        <div class="hud">
          <div>
            <div class="sub" style="margin:0">This Plot is yours</div>
            <div>Drag a card onto empty tiles · click a building to upgrade</div>
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
  `;
}

async function place(type: CardId, x: number, y: number) {
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

async function upgrade(cardId: string) {
  try {
    plot = await api("/api/plot/upgrade", { method: "POST", body: JSON.stringify({ cardId }) });
    toast = "Building upgraded. Empire Value moved.";
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
      render();
    } catch {
      /* keep last */
    }
  }, 10_000);
}

boot();
