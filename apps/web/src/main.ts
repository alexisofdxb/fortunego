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
  moduleSlotsForRuntimeStage,
  orientedFootprint,
  plotRank,
  SESSION_VERBS,
  boardSize,
  upgradeCostMinor,
  type Era,
  type PlacedCard,
  type SessionVerb,
} from "@plotgo/game";

type HuntView = {
  id: string;
  templateId: string;
  title: string;
  name: string;
  hint: string;
  family: string;
  difficulty: string;
  rewardRarity: string;
  stockTicker: string | null;
  rewardValueMinor: number;
  points: number;
  expiresAt: number;
  status: string;
  claimed: boolean;
  ready: boolean;
  claimBlockedReason: string | null;
  moduleReward: { kind: "module" | "parts"; rarity: string; quantity: number; partsAmount: number; compatibleFamily: string | null; moduleId?: string | null; moduleName?: string | null; label?: string; rewardId?: string } | null;
  progress: { current: number; target: number; done: boolean };
};

type ModuleInventoryView = {
  moduleId: string;
  name: string;
  rarity: string;
  category: string;
  families: string[];
  primaryPower: string;
  secondaryPower: string;
  condition: string;
  quantityOwned: number;
  quantityEquipped: number;
  quantityAvailable: number;
};

type ModuleLoadoutSummary = {
  buildingId: string;
  loadoutVersion: number;
  maxModuleSlots: number;
  unlockedSlots: number;
  slots: { slotIndex: number; moduleId: string; module: string; rarity: string; effectiveAt: number }[];
};

type Plot = {
  playerId: string;
  cash: string;
  cashMinor: number;
  empireValue: string;
  earnedMinor: number;
  weeklyScore: number;
  weeklyRedeemable: boolean;
  pendingPayout: { week: string; payoutPlot: number } | null;
  plotBalance: number;
  performance: {
    week: string;
    stage: string;
    score: number;
    eligible: boolean;
    eligibilityReasons: string[];
    components: Record<string, number>;
    activeDays: number;
    completedHunts: number;
    activityMinor: number;
    revenueMinor: number;
    averageActiveCustomers: number;
    averageUtilization: number;
    finalized: boolean;
    payoutPlot: number;
    claimed: boolean;
  };
  marketStage: string;
  marketHuntPoints: number;
  marketHuntPointCap: number;
  marketHuntSubscore: number;
  marketHuntPerformanceContribution: number;
  marketPoolConsumption: number;
  presenceState: string;
  activeMinutesToday: number;
  meaningfulActionsToday: number;
  onboarding: {
    sessionId: string | null;
    startedAt: number | null;
    status: "active" | "completed" | "skipped";
    step: string;
    xp: number;
    level: number;
    completedAt: number | null;
    skippedAt: number | null;
    protectionUntil: number;
    milestones: { id: string; targetMinute: number; xp: number; label: string; required: boolean; achievedAt: number | null }[];
    achieved: string[];
  } | null;
  offlineSummary: {
    summaryId: string;
    offlineSessionId: string;
    awayStartedAt: number;
    returnedAt: number;
    processedUntil: number;
    frozenMs: number;
    cashDeltaMinor: number;
    customerDelta: number;
    revenueCreditMinor: number;
    growthCredit: number;
    bands: { band: string; durationMs: number; cashEfficiency: number; customerIntensity: number }[];
    events: string[];
    risk: { beforeBps: number; afterBps: number };
    viewedAt: number | null;
  } | null;
  stockClaimEligible: boolean;
  stockClaimBlockedReason: string | null;
  activeDays: number;
  empireLevel: number;
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
    progressionFrom: string | null;
    moduleProfile: { buildingRarity: string; maxModuleSlots: number; slotUnlockLevels: number[]; allowedCategories: string[]; maxModuleRarity: string; legendaryLimit: number };
    unlocked: boolean;
  }[];
  fragments: Record<string, number>;
  modules: {
    configVersion: string;
    inventory: ModuleInventoryView[];
    parts: { rarity: string; balance: number }[];
    loadouts: ModuleLoadoutSummary[];
  };
  portfolio: { ticker: string; name: string; sector: string; unlockStage: string; units: number }[];
  positions: { ticker: string; name: string; sector: string; source: string; weightBps: number; allocatedMinor: number; markBps: number; lastMarkDay: string | null; effectiveDay: string | null; updatedAt: number | null }[];
  collections: { id: string; name: string; tickers: string[]; reward: string; owned: number; total: number; complete: boolean }[];
  hunts: HuntView[];
  hunt: HuntView | null;
  event: {
    id: string;
    title: string;
    description: string;
    activityBps: number;
    populationBps: number;
    riskDeltaBps: number;
  };
  marketEvent: {
    id: string;
    title: string;
    durationHours: number;
    spawnMultiplier: number;
    targetMultiplier: number;
    customerDemand: number;
    activityModifier: number;
    stockBias: string;
    minStage: string;
    frequency: string;
  };
  eventState: {
    cycle: { state: string; startedAt: number; endsAt: number; seed: number; cycleVersion: number };
    globalEvent: { id: string; event: string; category: string; tone: string; minStage: string; scope: string; durationHours: number; demandBps: number; activityBps: number; revenueBps: number; riskBps: number; huntSpawnMultiplier: number; stockBias: string; playerChoice: boolean };
    globalChoice: { id: string; catalogId: string; choiceId: string | null; decisions: { id: string; choice: string; immediateCostMinor: number; cashRewardMinor: number; eventPoints: number; tradeoff: string }[] };
    personalEvents: { id: string; catalogId: string; status: string; endsAt: number; choiceId: string | null; event: Plot["eventState"]["globalEvent"] | null; decisions: { id: string; choice: string; immediateCostMinor: number; cashRewardMinor: number; eventPoints: number; tradeoff: string }[] }[];
    mission: { id: string; target: number; expiresAt: number; status: string; template: { id: string; mission: string; metric: string; cashRewardMinor: number; repReward: number; eventPoints: number } | null; progress?: { current: number; target: number; done: boolean }; ready?: boolean } | null;
    modifiers: { demandBps: number; activityBps: number; revenueBps: number; riskBps: number; huntSpawnBps: number; reputationDelta: number };
    moduleInteractions: { global: { rewardChance: number; rewardRarity: string; rewardKind: string; rewardOn: string; lockFamilies: string[]; lockReason: string | null } | null; personal: { eventId: string; interaction: { rewardChance: number; rewardRarity: string; rewardKind: string; rewardOn: string; lockFamilies: string[]; lockReason: string | null } | null }[] };
    moduleLocks: { eventId: string; buildingId: string; family: string; reason: string }[];
    catalogCount: number;
  };
  placement: {
    directLinks: number;
    supportLinks: number;
    links: { id: number; rule: string; linkType: string; distance: number; factor: number; bonusBps: number }[];
    penalties: { kind: string; bps: number; message: string }[];
    districts: { id: string; name: string }[];
    score: { placementScore: number; synergyCoverage: number; infrastructureCoverage: number; congestionHealth: number; spaceEfficiency: number; diversification: number };
  };
  placementAudit: { layoutVersion: number; geometryHash: string; synergyVersion: number; supportVersion: number; stackVersion: number; congestionVersion: number; districtVersion: number; tilemapVersion: number; diagnosticVersion: number; moveTxId: string | null };
  session: { verb: string; settledAt: number; receipt: Receipt } | null;
  attributes: {
    riskBps: number;
    reputationBps: number;
    conditionBps: number;
    population: number;
    capacity: number;
    satisfactionBps: number;
    segments: {
      generalConsumers: number;
      retailInvestors: number;
      activeTraders: number;
      smallBusinesses: number;
      corporateClients: number;
      highNetWorth: number;
      institutional: number;
    };
    transactions: number;
    volumeMinor: number;
    synergyCount: number;
    revenue: { buildingId: string; buildingName: string; model: string; amountMinor: number }[];
  };
  dropped?: string | null;
};

type Receipt = {
  day: string;
  verb: string;
  cashDeltaMinor: number;
  cashAfterMinor: number;
  lines: { label: string; amountMinor: number }[];
  portfolio?: { applied: boolean; marks: { ticker: string; returnBps: number }[]; grossMarkMinor: number; preFeeAumMinor: number; feeMinor: number; endAumMinor: number };
};

const KEY = "plotgo.playerId";
let playerId = localStorage.getItem(KEY) ?? "";
let plot: Plot | null = null;
let toast = "";
let inspectId: string | null = null;
type Drag =
  | { kind: "place"; type: string; orientation: PlacedCard["orientation"] }
  | { kind: "move"; id: string; type: string; orientation: PlacedCard["orientation"]; startX: number; startY: number; moved: boolean };
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
  const sign = minor < 0 ? "-" : "";
  return `${sign}$${Math.floor(Math.abs(minor) / 100).toLocaleString()}`;
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
  const [w, h] = orientedFootprint(drag.type, drag.orientation ?? 0);
  el.hidden = false;
  el.classList.toggle("bad", !ghost.ok);
  el.setAttribute("style", tileStyle(ghost.x, ghost.y, w, h));
}

function bindOnce() {
  const app = document.querySelector<HTMLElement>("#app")!;
  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() !== "r" || !drag) return;
    drag.orientation = (((drag.orientation ?? 0) + 90) % 360) as 0 | 90 | 180 | 270;
    paintGhost();
    e.preventDefault();
  });
  app.addEventListener("pointerdown", (e: PointerEvent) => {
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
      drag = { kind: "place", type, orientation: 0 };
      catalog.setPointerCapture(e.pointerId);
      document.body.classList.add("dragging");
      inspectId = null;
      const at = cellAt(e.clientX, e.clientY);
      ghost = at ? { ...at, ok: fits(plot.cards, type, at.x, at.y, undefined, boardN, 0) } : null;
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
            orientation: card.orientation ?? 0,
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
  app.addEventListener("pointermove", (e: PointerEvent) => {
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
      ok: fits(plot.cards, drag.type, at.x, at.y, ignoreId(), boardN, drag.orientation ?? 0),
    };
    paintGhost();
  });
  app.addEventListener("pointerup", (e: PointerEvent) => {
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
      if (at) void place(current.type, at.x, at.y, current.orientation ?? 0);
      return;
    }
    if (!current.moved) {
      inspectId = current.id;
      render();
      return;
    }
    if (at) void moveCard(current.id, at.x, at.y, current.orientation ?? 0);
  });
  app.addEventListener("pointercancel", (e: PointerEvent) => {
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
    const offlineView = t.closest<HTMLButtonElement>("button[data-offline-summary-view]");
    if (offlineView) {
      void viewOfflineSummary(offlineView.dataset.offlineSummaryView);
      return;
    }
    const onboardingSkip = t.closest<HTMLButtonElement>("button[data-onboarding-skip]");
    if (onboardingSkip) {
      void skipOnboarding();
      return;
    }
    const rebalance = t.closest<HTMLButtonElement>("button[data-rebalance]");
    if (rebalance && !rebalance.disabled) {
      void rebalancePortfolio();
      return;
    }
    const up = t.closest<HTMLElement>("[data-upgrade]");
    if (up?.dataset.upgrade) {
      void upgrade(up.dataset.upgrade);
      return;
    }
    const rotate = t.closest<HTMLElement>("[data-rotate]");
    if (rotate?.dataset.rotate) {
      const card = plot?.cards.find((candidate) => candidate.id === rotate.dataset.rotate);
      if (card) void rotateCard(card.id, (((card.orientation ?? 0) + 90) % 360) as 0 | 90 | 180 | 270);
      return;
    }
    const equip = t.closest<HTMLButtonElement>("button[data-module-equip]");
    if (equip?.dataset.moduleEquip && equip.dataset.moduleSlot) {
      const slot = Number(equip.dataset.moduleSlot);
      const select = document.querySelector<HTMLSelectElement>(`select[data-module-select="${equip.dataset.moduleEquip}-${slot}"]`);
      if (select?.value) void equipModule(equip.dataset.moduleEquip, slot, select.value);
      return;
    }
    const unequip = t.closest<HTMLButtonElement>("button[data-module-unequip]");
    if (unequip?.dataset.moduleUnequip && unequip.dataset.moduleSlot) {
      void unequipModule(unequip.dataset.moduleUnequip, Number(unequip.dataset.moduleSlot));
      return;
    }
    const action = t.closest<HTMLButtonElement>("button[data-verb]");
    if (action?.dataset.verb) {
      void settle(action.dataset.verb as SessionVerb);
      return;
    }
    const claim = t.closest<HTMLButtonElement>("button.claim");
    if (claim && !claim.disabled && !claim.dataset.upgrade) void claimHunt(claim.dataset.huntId);
    const performanceClaim = t.closest<HTMLButtonElement>("button[data-performance-claim]");
    if (performanceClaim) void claimPerformance(performanceClaim.dataset.performanceWeek);
    const decision = t.closest<HTMLButtonElement>("button[data-event-choice]");
    if (decision?.dataset.eventChoice && decision.dataset.eventId) void chooseEvent(decision.dataset.eventId, decision.dataset.eventChoice);
    const eventMission = t.closest<HTMLButtonElement>("button[data-event-mission-claim]");
    if (eventMission) void claimEventMission(eventMission.dataset.eventMissionClaim);
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
    (e: WheelEvent) => {
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
  const [w, h] = orientedFootprint(card.type, card.orientation ?? 0);
  const hour = cardHourMinor(card, plot.cards);
  const customers = cardCustomers(card);
  const revenue = plot.attributes.revenue.find((item) => item.buildingId === card.id);
  const next = card.stage < 3 ? upgradeCostMinor(card.type, card.stage as 1 | 2) : null;
  const moduleSlots = moduleSlotsForRuntimeStage(card.type, card.stage);
  const moduleSummary = plot.modules?.loadouts.find((loadout) => loadout.buildingId === card.id);
  const moduleProfile = plot.catalog.find((item) => item.id === card.type)?.moduleProfile;
  const equipped = new Map((moduleSummary?.slots ?? []).map((slot) => [slot.slotIndex, slot]));
  const compatibleInventory = (plot.modules?.inventory ?? []).filter((module) => !moduleProfile || moduleProfile.allowedCategories.includes(module.category));
  const modulePanel = moduleSummary
    ? `<div class="module-panel"><div class="module-panel-head"><span>Modules</span><small>${moduleSummary.unlockedSlots}/${moduleSummary.maxModuleSlots} slots unlocked · v${moduleSummary.loadoutVersion}</small></div>${Array.from({ length: moduleSummary.maxModuleSlots }, (_, slotIndex) => {
        const slot = equipped.get(slotIndex);
        if (slotIndex >= moduleSummary.unlockedSlots) return `<div class="module-slot locked"><span>Slot ${slotIndex + 1}</span><small>Unlocks with building progression</small></div>`;
        const options = compatibleInventory.length
          ? compatibleInventory.map((module) => `<option value="${module.moduleId}">${module.name} · ${module.rarity} (${module.quantityAvailable})</option>`).join("")
          : `<option value="">Earn a Module from Hunts or Events</option>`;
        return `<div class="module-slot"><div><b>Slot ${slotIndex + 1}</b><span>${slot ? `${slot.module} · ${slot.rarity}` : "Empty"}</span></div><div class="module-slot-actions"><select data-module-select="${card.id}-${slotIndex}" ${compatibleInventory.length ? "" : "disabled"}>${options}</select><button class="claim" type="button" data-module-equip="${card.id}" data-module-slot="${slotIndex}" ${compatibleInventory.length ? "" : "disabled"}>Equip</button>${slot ? `<button class="claim secondary" type="button" data-module-unequip="${card.id}" data-module-slot="${slotIndex}">Unequip</button>` : ""}</div></div>`;
      }).join("")}</div>`
    : "";
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
        <div><span>Revenue model</span><b>${revenue?.model ?? "service"}</b></div>
        <div><span>Level</span><b>${card.stage} / 3</b></div>
        <div><span>Customers</span><b>${customers.toLocaleString()}</b></div>
        <div><span>Earn / hour</span><b>${cashLabel(hour)}</b></div>
        <div><span>Footprint</span><b>${w}×${h}</b></div>
        <div><span>Orientation</span><b>${card.orientation ?? 0}°</b></div>
        <div><span>Module slots</span><b>${moduleSlots}</b></div>
      </div>
      <div class="lvl-row">${stages}</div>
      ${modulePanel}
      <button class="claim" type="button" data-rotate="${card.id}">Rotate building 90°</button>
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
  const hunts = plot.hunts ?? (plot.hunt ? [plot.hunt] : []);
  const pieces = plot.cards
    .map((c) => {
      const [w, h] = orientedFootprint(c.type, c.orientation ?? 0);
      const spec = CARDS[c.type];
      return `<button class="piece stage-${c.stage}" type="button" data-type="${lineageColor(spec.lineage)}" data-stage="${c.stage}" data-id="${c.id}"
        style="${tileStyle(c.x, c.y, w, h)}">
        <span>${spec.name}</span><span>S${c.stage}</span>
      </button>`;
    })
    .join("");

  const hand = plot.catalog.filter((c) => c.unlocked);
  const risk = Math.round(plot.attributes.riskBps / 100);
  const reputation = Math.round(plot.attributes.reputationBps / 100);
  const condition = Math.round(plot.attributes.conditionBps / 100);
  const segments = plot.attributes.segments;
  const sessionButtons = SESSION_VERBS.map((verb) =>
    `<button class="verb" type="button" data-verb="${verb.id}" ${plot!.session ? "disabled" : ""} title="${verb.description}">${verb.title}</button>`,
  ).join("");
  const receipt = plot.session?.receipt;
  const receiptHtml = receipt
    ? `<div class="receipt"><b>Today's receipt</b><span>${receipt.lines.map((line) => `${line.label}: ${cashLabel(line.amountMinor)}`).join(" · ")}</span><strong>${cashLabel(receipt.cashDeltaMinor)} Cash</strong></div>`
    : "";
  const offlineSummary = plot.offlineSummary;
  const offlineSummaryHtml = offlineSummary
    ? `<section class="offline-summary"><div class="portfolio-heading"><b>Welcome back</b><span>${Math.max(0, (offlineSummary.returnedAt - offlineSummary.awayStartedAt) / 3_600_000).toFixed(1)}h away · ${plot.presenceState}</span></div><div class="offline-summary-stats"><span>Offline Cash <b>${cashLabel(offlineSummary.cashDeltaMinor)}</b></span><span>Customers <b>${offlineSummary.customerDelta >= 0 ? "+" : ""}${Math.round(offlineSummary.customerDelta).toLocaleString()}</b></span><span>Revenue credit <b>${cashLabel(offlineSummary.revenueCreditMinor)}</b></span><span>Growth credit <b>${offlineSummary.growthCredit.toFixed(1)}</b></span></div><small class="settled">Offline operations use reduced efficiency. Activity and Hunts require active play; only 25% of later offline revenue and customer growth counts toward Performance.${offlineSummary.frozenMs > 0 ? ` Economy froze after 12 hours (${(offlineSummary.frozenMs / 3_600_000).toFixed(1)}h frozen).` : ""}</small><button class="performance-claim" type="button" data-offline-summary-view="${offlineSummary.summaryId}">Dismiss summary</button></section>`
     : "";
  const onboarding = plot.onboarding;
  const onboardingNext = onboarding?.milestones.find((milestone) => milestone.id === onboarding.step) ?? null;
  const onboardingRequired = onboarding?.milestones.filter((milestone) => milestone.required) ?? [];
  const onboardingComplete = onboardingRequired.filter((milestone) => milestone.achievedAt != null).length;
  const onboardingHtml = onboarding && onboarding.status === "active"
    ? `<section class="onboarding-panel"><div class="portfolio-heading"><b>First 5 minutes</b><span>Lv${onboarding.level} · ${onboardingComplete}/${onboardingRequired.length} milestones</span></div><div class="onboarding-progress"><i style="width:${Math.round((onboardingComplete / Math.max(1, onboardingRequired.length)) * 100)}%"></i></div><p>${onboardingNext ? onboardingNext.label : "Your core empire loop is live."}</p><small class="settled">Build → Customers → Cash → Placement → Hunts → Portfolio → Performance. This guide ends before 30 minutes.</small><button class="performance-claim" type="button" data-onboarding-skip>Skip guided onboarding</button></section>`
    : "";

  const portfolioHtml = plot.portfolio.length
    ? plot.portfolio.map((stock) => `<span class="stock-chip"><b>${stock.ticker}</b> ${stock.units.toFixed(6)} <small>${stock.sector}</small></span>`).join("")
    : '<span class="portfolio-empty">Complete a Market Hunt to discover your first stock fragment.</span>';
  const collectionHtml = plot.collections
    .map((collection) => `<span class="collection-chip ${collection.complete ? "complete" : ""}">${collection.name} ${collection.owned}/${collection.total}</span>`)
    .join("");
  const positionAumMinor = plot.positions.reduce((sum, position) => sum + position.allocatedMinor, 0);
  const portfolioEligible = plot.cards.some((card) => ["broker", "fund"].includes(CARDS[card.type]?.lineage ?? ""));
  const positionRowsHtml = plot.positions.map((position) => {
    const mark = position.lastMarkDay ? `${position.markBps >= 0 ? "+" : ""}${(position.markBps / 100).toFixed(2)}%` : "pending";
    return `<div class="position-row"><div><b>${position.ticker}</b><small>${position.name} · ${position.sector} · ${mark}</small></div><label><input type="number" min="0" max="100" step="0.01" value="${(position.weightBps / 100).toFixed(2)}" data-position-weight="${position.ticker}" ${portfolioEligible ? "" : "disabled"}>%</label><strong>${cashLabel(position.allocatedMinor)}</strong></div>`;
  }).join("");
  const bookHtml = `<div class="portfolio-book"><div class="portfolio-heading"><b>Simulated portfolio book</b><span>AUM ${cashLabel(positionAumMinor)}</span></div><small class="settled">In-game assets · deterministic daily marks · not real securities. Fee: 150 bps/year, charged daily on end-of-day AUM.</small><div class="position-list">${positionRowsHtml}</div><div class="portfolio-actions"><button class="performance-claim" type="button" data-rebalance ${portfolioEligible ? "" : "disabled"}>Save weights</button><small>${portfolioEligible ? "Weights total 100%. Rebalance takes effect next UTC day." : "Place a Brokerage or Fund building to allocate."}</small></div></div>`;
  const performance = plot.performance;
  const eventState = plot.eventState;
  const performanceRows = Object.entries(performance.components)
    .map(([key, value]) => `<span>${key.replace(/([A-Z])/g, " $1")} <b>${Math.round(value)}</b></span>`)
    .join("");

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
    ${offlineSummaryHtml}
    ${onboardingHtml}
    <div class="hunt-strip">
      <div class="hunt-heading"><b>Market Hunts · ${plot.marketStage} · L${plot.empireLevel}</b><span>${plot.marketHuntPoints}/${plot.marketHuntPointCap} weekly points · ${plot.marketHuntSubscore}/100 score · pool ${Math.round(plot.marketPoolConsumption * 100)}%</span></div>
      <div class="hunt-list">
        ${hunts.map((hunt) => {
          const pct = Math.min(100, Math.round((hunt.progress.current / Math.max(1, hunt.progress.target)) * 100));
          const stockReward = hunt.rewardValueMinor ? `$${(hunt.rewardValueMinor / 100).toFixed(2)} ${hunt.stockTicker ?? "stock"}` : "Pool fallback";
          const moduleReward = hunt.moduleReward ? ` + ${hunt.moduleReward.label ?? `${hunt.moduleReward.rarity} Module ${hunt.moduleReward.kind === "parts" ? "Parts" : ""}`}` : "";
          return `<div class="hunt-row ${hunt.ready ? "ready" : ""}">
            <div class="hunt-copy"><b>${hunt.title}</b><span>${hunt.difficulty} · ${hunt.rewardRarity} · ${stockReward}${moduleReward} · ${hunt.points} pts</span><div class="bar"><i style="width:${pct}%"></i></div></div>
            <button class="claim" type="button" title="${hunt.claimBlockedReason ?? ""}" data-hunt-id="${hunt.id}" ${hunt.ready ? "" : "disabled"}>${hunt.status === "claimed" ? "Claimed" : (hunt.claimBlockedReason ? "Held" : "Claim")}</button>
          </div>`;
        }).join("")}
      </div>
    </div>
    <section class="portfolio-panel">
      <div class="portfolio-heading"><b>Stock Portfolio</b><span>In-game fragments</span></div>
      <div class="portfolio-list">${portfolioHtml}</div>
      <div class="collection-list">${collectionHtml}</div>
      ${bookHtml}
    </section>
    <section class="performance-panel">
      <div class="portfolio-heading"><b>Weekly Performance · ${performance.week}</b><span>${performance.score}/120 · ${plot.plotBalance.toLocaleString()} $PLOT</span></div>
      <div class="performance-stats">${performanceRows}</div>
      <small class="settled">${plot.pendingPayout ? `Pending payout: ${plot.pendingPayout.payoutPlot.toLocaleString()} $PLOT from ${plot.pendingPayout.week}.` : performance.finalized ? (performance.eligible ? `Eligible payout: ${performance.payoutPlot.toLocaleString()} $PLOT${performance.claimed ? " · claimed" : ""}` : "Finalized but not eligible") : `${performance.activeDays}/3 active days · ${performance.completedHunts} hunts · snapshot in progress`}</small>
      ${plot.weeklyRedeemable ? `<button class="performance-claim" type="button" data-performance-claim data-performance-week="${plot.pendingPayout?.week ?? ""}">Claim weekly $PLOT payout</button>` : ""}
      ${!performance.finalized && performance.eligibilityReasons.length ? `<small class="settled">${performance.eligibilityReasons.slice(0, 2).join(" ")}</small>` : ""}
    </section>
    <section class="day-panel">
      <div class="day-copy"><b>District Day · ${plot.event.title}</b><span>${plot.event.description}</span><small>Market event: ${plot.marketEvent.title} · ${plot.marketEvent.durationHours}h · ${plot.marketEvent.spawnMultiplier}× hunt spawn · ${plot.marketEvent.activityModifier}× activity</small></div>
      <div class="day-stats"><span>Risk <b>${risk}%</b></span><span>Reputation <b>${reputation}%</b></span><span>Customers <b>${plot.attributes.population.toLocaleString()} / ${plot.attributes.capacity.toLocaleString()}</b></span><span>Condition <b>${condition}%</b></span><span>Transactions <b>${plot.attributes.transactions.toLocaleString()}</b></span><span>Volume <b>${cashLabel(plot.attributes.volumeMinor)}</b></span><span>Synergies <b>${plot.attributes.synergyCount}</b></span><span>Placement <b>${plot.placement.score.placementScore}/100</b></span></div>
      <div class="segments"><span>Links ${plot.placement.directLinks} direct · ${plot.placement.supportLinks} support</span><span>Districts ${plot.placement.districts.length}</span><span>Penalties ${plot.placement.penalties.length}</span><span>Layout v${plot.placementAudit.layoutVersion}</span></div>
      <div class="segments"><span>General ${segments.generalConsumers}</span><span>Retail ${segments.retailInvestors}</span><span>Traders ${segments.activeTraders}</span><span>Small biz ${segments.smallBusinesses}</span><span>Corporate ${segments.corporateClients}</span><span>HNW ${segments.highNetWorth}</span><span>Institutional ${segments.institutional}</span></div>
      <div class="verbs">${sessionButtons}</div>
      ${plot.session ? `<small class="settled">Settled today with “${plot.session.verb.replaceAll("_", " ") }”.</small>` : '<small class="settled">Choose one business action. It settles once per UTC day.</small>'}
    </section>
    <section class="event-panel">
      <div class="portfolio-heading"><b>Market Cycle · ${eventState.cycle.state}</b><span>v${eventState.cycle.cycleVersion} · ${eventState.catalogCount} events</span></div>
      <div class="event-summary"><b>${eventState.globalEvent.event}</b><span>${eventState.globalEvent.category} · ${eventState.globalEvent.tone} · ${eventState.globalEvent.durationHours}h · Hunt ×${eventState.globalEvent.huntSpawnMultiplier}${eventState.moduleInteractions.global?.rewardChance ? ` · Module reward chance ${Math.round(eventState.moduleInteractions.global.rewardChance * 100)}%` : ""}${eventState.moduleLocks.length ? ` · ${eventState.moduleLocks.length} Module lock${eventState.moduleLocks.length === 1 ? "" : "s"}` : ""}</span></div>
      ${eventState.globalEvent.playerChoice && !eventState.globalChoice.choiceId ? `<div class="event-choices">${eventState.globalChoice.decisions.map((decision) => `<button class="verb" type="button" data-event-id="${eventState.globalChoice.id}" data-event-choice="${decision.id}">${decision.choice} · ${cashLabel(decision.immediateCostMinor)}</button>`).join("")}</div>` : ""}
      ${eventState.personalEvents.map((personal) => `<div class="event-row"><div><b>${personal.event?.event ?? personal.catalogId}</b><span>${personal.event?.category ?? "Personal"} · ends ${new Date(personal.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div>${personal.decisions.length && !personal.choiceId ? `<div class="event-choices">${personal.decisions.map((decision) => `<button class="verb" type="button" data-event-id="${personal.id}" data-event-choice="${decision.id}">${decision.choice} · ${cashLabel(decision.immediateCostMinor)}</button>`).join("")}</div>` : `<small class="settled">${personal.choiceId ? "Decision resolved" : "No decision required"}</small>`}</div>`).join("")}
      ${eventState.mission?.template ? `<div class="event-mission"><div><b>${eventState.mission.template.mission}</b><span>${eventState.mission.template.metric} · ${eventState.mission.progress?.current ?? 0} / ${eventState.mission.progress?.target ?? eventState.mission.target}</span></div><button class="claim" type="button" data-event-mission-claim="${eventState.mission.id}" ${eventState.mission.ready ? "" : "disabled"}>${eventState.mission.ready ? "Claim" : "In progress"}</button></div>` : ""}
      <div class="segments"><span>Demand ${Math.round(eventState.modifiers.demandBps / 100)}%</span><span>Activity ${Math.round(eventState.modifiers.activityBps / 100)}%</span><span>Revenue ${Math.round(eventState.modifiers.revenueBps / 100)}%</span><span>Risk ${Math.round(eventState.modifiers.riskBps / 100)}%</span></div>
    </section>
    ${receiptHtml}
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

async function place(type: string, x: number, y: number, orientation: PlacedCard["orientation"] = 0) {
  try {
    plot = await api("/api/plot/place", {
      method: "POST",
      body: JSON.stringify({ type, x, y, orientation }),
    });
    toast = `${CARDS[type].name} placed. Run today's action to settle activity.`;
    render();
  } catch (e) {
    toast = (e as Error).message;
    render();
  }
}

async function moveCard(cardId: string, x: number, y: number, orientation: PlacedCard["orientation"] = 0) {
  try {
    plot = await api("/api/plot/move", {
      method: "POST",
      body: JSON.stringify({ cardId, x, y, orientation }),
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

async function claimHunt(huntId?: string) {
  try {
    const data = await api("/api/hunt/claim", { method: "POST", body: JSON.stringify(huntId ? { huntId } : {}) });
    plot = data;
    toast = data.dropped ? `You found ${data.dropped} stock units.` : "Hunt completed; reward pool fallback applied.";
    render();
  } catch (e) {
    toast = (e as Error).message;
    render();
  }
}

async function rotateCard(cardId: string, orientation: 0 | 90 | 180 | 270) {
  try {
    plot = await api("/api/plot/rotate", { method: "POST", body: JSON.stringify({ cardId, orientation }) });
    toast = "Building rotated.";
    render();
  } catch (e) {
    toast = (e as Error).message;
    render();
  }
}

async function equipModule(buildingId: string, slot: number, moduleId: string) {
  try {
    await api(`/api/buildings/${buildingId}/modules/equip`, { method: "POST", body: JSON.stringify({ slot, moduleId, idempotencyKey: crypto.randomUUID() }) });
    plot = await api("/api/plot");
    toast = "Module equipped at the next settlement boundary.";
    render();
  } catch (e) {
    toast = (e as Error).message;
    render();
  }
}

async function unequipModule(buildingId: string, slot: number) {
  try {
    await api(`/api/buildings/${buildingId}/modules/unequip`, { method: "POST", body: JSON.stringify({ slot, idempotencyKey: crypto.randomUUID() }) });
    plot = await api("/api/plot");
    toast = "Module unequipped at the next settlement boundary.";
    render();
  } catch (e) {
    toast = (e as Error).message;
    render();
  }
}

async function claimPerformance(week?: string) {
  try {
    const data = await api("/api/performance/claim", { method: "POST", body: JSON.stringify(week ? { week } : {}) });
    plot = data;
    toast = `Weekly payout claimed: ${data.claimedPlot.toLocaleString()} $PLOT.`;
    render();
  } catch (e) {
    toast = (e as Error).message;
    render();
  }
}

async function chooseEvent(eventId: string, decisionId: string) {
  try {
    plot = await api("/api/event/choose", { method: "POST", body: JSON.stringify({ eventId, decisionId }) });
    toast = "Event decision applied.";
    render();
  } catch (e) {
    toast = (e as Error).message;
    render();
  }
}

async function claimEventMission(missionId?: string) {
  try {
    plot = await api("/api/event/mission/claim", { method: "POST", body: JSON.stringify(missionId ? { missionId } : {}) });
    toast = "Event mission reward claimed.";
    render();
  } catch (e) {
    toast = (e as Error).message;
    render();
  }
}

async function settle(verb: SessionVerb) {
  try {
    const data = await api("/api/session/settle", { method: "POST", body: JSON.stringify({ verb }) });
    plot = data;
    toast = data.receipt?.cashDeltaMinor >= 0 ? "District day settled." : "District day settled with a loss.";
    render();
  } catch (e) {
    toast = (e as Error).message;
    render();
  }
}

async function rebalancePortfolio() {
  try {
    const weights = Object.fromEntries(["NVDA", "AAPL", "TSLA", "CASH"].map((ticker) => {
      const input = document.querySelector<HTMLInputElement>(`input[data-position-weight="${ticker}"]`);
      return [ticker, Math.round(Number(input?.value ?? 0) * 100)];
    }));
    const data = await api("/api/positions/rebalance", { method: "POST", body: JSON.stringify({ weights }) });
    plot = await api("/api/plot");
    toast = `Portfolio saved. Next daily mark begins ${data.receipt.effectiveDay === new Date().toISOString().slice(0, 10) ? "tomorrow" : data.receipt.effectiveDay}.`;
    render();
  } catch (e) {
    toast = (e as Error).message;
    render();
  }
}

async function viewOfflineSummary(summaryId?: string) {
  try {
    await api("/api/offline/summary/view", { method: "POST", body: JSON.stringify(summaryId ? { summaryId } : {}) });
    if (plot) plot = await api("/api/plot");
    render();
  } catch (e) {
    toast = (e as Error).message;
    render();
  }
}

async function skipOnboarding() {
  try {
    await api("/api/onboarding/skip", { method: "POST", body: "{}" });
    plot = await api("/api/plot");
    toast = "Guided onboarding skipped. Your normal goals remain available.";
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
