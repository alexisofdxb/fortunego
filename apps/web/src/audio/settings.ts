import { create } from "zustand";

const KEY = "plotgo:audio";

export type AudioSettings = {
  muted: boolean;
  music: number;
  sfx: number;
};

const DEFAULTS: AudioSettings = { muted: false, music: 0.28, sfx: 0.7 };

function load(): AudioSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      muted: Boolean(parsed.muted),
      music: clamp01(parsed.music ?? DEFAULTS.music),
      sfx: clamp01(parsed.sfx ?? DEFAULTS.sfx),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

interface AudioSettingsStore extends AudioSettings {
  setMuted: (muted: boolean) => void;
  toggleMuted: () => void;
  setMusic: (music: number) => void;
  setSfx: (sfx: number) => void;
}

export const useAudioSettings = create<AudioSettingsStore>((set, get) => {
  const initial = typeof localStorage === "undefined" ? DEFAULTS : load();
  const persist = (patch: Partial<AudioSettings>) => {
    const next = { muted: get().muted, music: get().music, sfx: get().sfx, ...patch };
    localStorage.setItem(KEY, JSON.stringify({ muted: next.muted, music: next.music, sfx: next.sfx }));
    set(next);
  };
  return {
    ...initial,
    setMuted: (muted) => persist({ muted }),
    toggleMuted: () => persist({ muted: !get().muted }),
    setMusic: (music) => persist({ music: clamp01(music) }),
    setSfx: (sfx) => persist({ sfx: clamp01(sfx) }),
  };
});
