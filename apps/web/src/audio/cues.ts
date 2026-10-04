export type BusId = "music" | "sfx" | "ui" | "stinger";

export type CueId =
  | "card_pickup"
  | "card_drag_tick"
  | "place"
  | "hex_locked"
  | "hex_valid"
  | "acquire"
  | "inspect_open"
  | "inspect_close"
  | "parcel_open"
  | "upgrade_regional"
  | "upgrade_tower"
  | "module_equip"
  | "close_day"
  | "level_up"
  | "capacity_up"
  | "objective_done"
  | "hunt_start"
  | "hunt_claim"
  | "ui_tap"
  | "drawer_open"
  | "drawer_close"
  | "error"
  | "tut_advance";

export type MusicId = "humble_day" | "humble_dusk" | "growing_day" | "visit" | "world";

export interface CueSpec {
  bus: BusId;
  gain: number;
  cooldown: number;
  duck?: number;
  /** Optional file under /audio. Missing files fall back to the synth. */
  file?: string;
}

export const CUES: Record<CueId, CueSpec> = {
  card_pickup: { bus: "sfx", gain: 0.55, cooldown: 80, file: "sfx/card_pickup.wav" },
  card_drag_tick: { bus: "sfx", gain: 0.28, cooldown: 140, file: "sfx/card_drag_tick.wav" },
  place: { bus: "sfx", gain: 0.7, cooldown: 200, file: "sfx/place.wav" },
  hex_locked: { bus: "sfx", gain: 0.55, cooldown: 180, file: "sfx/hex_locked.wav" },
  hex_valid: { bus: "sfx", gain: 0.32, cooldown: 200, file: "sfx/hex_valid.wav" },
  acquire: { bus: "sfx", gain: 0.7, cooldown: 300, file: "sfx/acquire.wav" },
  inspect_open: { bus: "ui", gain: 0.45, cooldown: 120, file: "sfx/inspect_open.wav" },
  inspect_close: { bus: "ui", gain: 0.4, cooldown: 120, file: "sfx/inspect_close.wav" },
  parcel_open: { bus: "ui", gain: 0.45, cooldown: 120, file: "sfx/parcel_open.wav" },
  upgrade_regional: { bus: "stinger", gain: 0.85, cooldown: 600, duck: 900, file: "stinger/upgrade_regional.wav" },
  upgrade_tower: { bus: "stinger", gain: 0.9, cooldown: 600, duck: 1200, file: "stinger/upgrade_tower.wav" },
  module_equip: { bus: "sfx", gain: 0.6, cooldown: 200, file: "sfx/module_equip.wav" },
  close_day: { bus: "stinger", gain: 0.85, cooldown: 800, duck: 1400, file: "stinger/close_day.wav" },
  level_up: { bus: "stinger", gain: 0.9, cooldown: 1000, duck: 1600, file: "stinger/level_up.wav" },
  capacity_up: { bus: "ui", gain: 0.55, cooldown: 400, file: "sfx/capacity_up.wav" },
  objective_done: { bus: "sfx", gain: 0.65, cooldown: 250, file: "sfx/objective_done.wav" },
  hunt_start: { bus: "sfx", gain: 0.65, cooldown: 250, file: "sfx/hunt_start.wav" },
  hunt_claim: { bus: "stinger", gain: 0.85, cooldown: 500, duck: 1100, file: "stinger/hunt_claim.wav" },
  ui_tap: { bus: "ui", gain: 0.35, cooldown: 50, file: "sfx/ui_tap.wav" },
  drawer_open: { bus: "ui", gain: 0.4, cooldown: 100, file: "sfx/drawer_open.wav" },
  drawer_close: { bus: "ui", gain: 0.35, cooldown: 100, file: "sfx/drawer_close.wav" },
  error: { bus: "ui", gain: 0.5, cooldown: 200, file: "sfx/error.wav" },
  tut_advance: { bus: "ui", gain: 0.4, cooldown: 150, file: "sfx/tut_advance.wav" },
};

export const MUSIC_FILES: Record<MusicId, string> = {
  humble_day: "music/humble_day.wav",
  humble_dusk: "music/humble_dusk.wav",
  growing_day: "music/growing_day.wav",
  visit: "music/visit.wav",
  world: "music/world.wav",
};

export const SFX_PRELOAD: CueId[] = [
  "card_pickup",
  "card_drag_tick",
  "place",
  "hex_locked",
  "hex_valid",
  "ui_tap",
  "inspect_open",
  "inspect_close",
  "error",
];
