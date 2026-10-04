import { CUES, MUSIC_FILES, SFX_PRELOAD, type BusId, type CueId, type MusicId } from "./cues";
import { useAudioSettings } from "./settings";
import { synthCue, synthMusic } from "./synth";

const MAX_VOICES = 8;
const MASTER_DEFAULT = 0.85;
const STINGER_SFX_MULT = 1.15;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicBus: GainNode | null = null;
let sfxBus: GainNode | null = null;
let uiBus: GainNode | null = null;
let stingerBus: GainNode | null = null;
let musicGain: GainNode | null = null;
let unlocked = false;
let tutorialDuck = false;
let duckToken = 0;

const buffers = new Map<string, AudioBuffer>();
const lastPlayed = new Map<string, number>();
const liveVoices: AudioBufferSourceNode[] = [];
type MusicVoice = { src: AudioBufferSourceNode; fade: GainNode };
let musicVoice: MusicVoice | null = null;
let musicId: MusicId | null = null;
let musicStarting = false;
let musicQueued: MusicId | null = null;
let stingerSource: AudioBufferSourceNode | null = null;

function busNode(id: BusId): GainNode | null {
  if (id === "music") return musicBus;
  if (id === "sfx") return sfxBus;
  if (id === "ui") return uiBus;
  return stingerBus;
}

function ensureGraph(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    musicBus = ctx.createGain();
    sfxBus = ctx.createGain();
    uiBus = ctx.createGain();
    stingerBus = ctx.createGain();
    musicGain = ctx.createGain();
    musicGain.connect(musicBus);
    musicBus.connect(master);
    sfxBus.connect(master);
    uiBus.connect(master);
    stingerBus.connect(master);
    master.connect(ctx.destination);
    applySettings();
  }
  return ctx;
}

function applySettings() {
  if (!master || !musicBus || !sfxBus || !uiBus || !stingerBus || !ctx) return;
  const { muted, music, sfx } = useAudioSettings.getState();
  const now = ctx.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(muted ? 0 : MASTER_DEFAULT, now);
  musicBus.gain.setValueAtTime(music, now);
  sfxBus.gain.setValueAtTime(sfx, now);
  uiBus.gain.setValueAtTime(sfx * (0.55 / 0.7), now);
  stingerBus.gain.setValueAtTime(Math.min(1, sfx * STINGER_SFX_MULT), now);
}

useAudioSettings.subscribe(() => applySettings());

async function loadFile(ctx: AudioContext, path: string): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(`/audio/${path}`);
    if (!res.ok) return null;
    const raw = await res.arrayBuffer();
    return await ctx.decodeAudioData(raw.slice(0));
  } catch {
    return null;
  }
}

async function getBuffer(id: CueId | MusicId): Promise<AudioBuffer | null> {
  const c = ensureGraph();
  if (!c) return null;
  const hit = buffers.get(id);
  if (hit) return hit;
  if (id in CUES) {
    const spec = CUES[id as CueId];
    const fromFile = spec.file ? await loadFile(c, spec.file) : null;
    const buf = fromFile ?? synthCue(c, id as CueId);
    buffers.set(id, buf);
    return buf;
  }
  const file = MUSIC_FILES[id as MusicId];
  const fromFile = file ? await loadFile(c, file) : null;
  const buf = fromFile ?? synthMusic(c, id as MusicId);
  buffers.set(id, buf);
  return buf;
}

function duckMusic(to: number, ms: number) {
  if (!musicGain || !ctx) return;
  const token = ++duckToken;
  const now = ctx.currentTime;
  const current = musicGain.gain.value;
  musicGain.gain.cancelScheduledValues(now);
  musicGain.gain.setValueAtTime(current, now);
  musicGain.gain.linearRampToValueAtTime(to, now + 0.08);
  window.setTimeout(() => {
    if (token !== duckToken || !musicGain || !ctx) return;
    const t = ctx.currentTime;
    musicGain.gain.cancelScheduledValues(t);
    musicGain.gain.setValueAtTime(musicGain.gain.value, t);
    musicGain.gain.linearRampToValueAtTime(tutorialDuck ? 0.4 : 1, t + 0.2);
  }, ms + 200);
}

function pruneVoices() {
  while (liveVoices.length > MAX_VOICES) {
    const src = liveVoices.shift();
    try {
      src?.stop();
    } catch {
      /* already stopped */
    }
  }
}

function fire(id: CueId, buffer: AudioBuffer) {
  const c = ensureGraph();
  const spec = CUES[id];
  const dest = busNode(spec.bus);
  if (!c || !dest) return;
  const now = performance.now();
  const prev = lastPlayed.get(id) ?? 0;
  if (now - prev < spec.cooldown) return;
  lastPlayed.set(id, now);

  if (spec.bus === "stinger") {
    try {
      stingerSource?.stop();
    } catch {
      /* already stopped */
    }
    if (spec.duck) duckMusic(0.35, spec.duck);
  }

  const src = c.createBufferSource();
  src.buffer = buffer;
  const g = c.createGain();
  g.gain.value = spec.gain;
  src.connect(g);
  g.connect(dest);
  src.onended = () => {
    const i = liveVoices.indexOf(src);
    if (i >= 0) liveVoices.splice(i, 1);
    if (stingerSource === src) stingerSource = null;
  };
  if (spec.bus === "stinger") stingerSource = src;
  else {
    liveVoices.push(src);
    pruneVoices();
  }
  src.start();
}

async function startMusic(id: MusicId) {
  const c = ensureGraph();
  if (!c || !musicGain) return;
  if (musicStarting) {
    musicQueued = id;
    return;
  }
  musicStarting = true;
  const buffer = await getBuffer(id);
  if (!buffer || musicId === id) {
    musicStarting = false;
    const queued = musicQueued;
    musicQueued = null;
    if (queued && queued !== musicId) void startMusic(queued);
    return;
  }
  const prev = musicVoice;
  const src = c.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  const fade = c.createGain();
  fade.gain.setValueAtTime(0, c.currentTime);
  fade.gain.linearRampToValueAtTime(1, c.currentTime + 1.2);
  src.connect(fade);
  fade.connect(musicGain);
  src.start();
  if (prev) {
    prev.fade.gain.cancelScheduledValues(c.currentTime);
    prev.fade.gain.setValueAtTime(prev.fade.gain.value, c.currentTime);
    prev.fade.gain.linearRampToValueAtTime(0, c.currentTime + 1.2);
    try {
      prev.src.stop(c.currentTime + 1.25);
    } catch {
      /* */
    }
  }
  musicVoice = { src, fade };
  musicId = id;
  musicStarting = false;
  const queued = musicQueued;
  musicQueued = null;
  if (queued && queued !== musicId) void startMusic(queued);
}

export const audio = {
  async unlock() {
    const c = ensureGraph();
    if (!c) return;
    if (c.state !== "running") await c.resume();
    unlocked = true;
    applySettings();
    await Promise.all(SFX_PRELOAD.map((id) => getBuffer(id)));
    void Promise.all((Object.keys(CUES) as CueId[]).map((id) => getBuffer(id)));
  },

  isUnlocked() {
    return unlocked && ctx?.state === "running";
  },

  play(id: CueId) {
    if (!unlocked) return;
    void getBuffer(id).then((buf) => {
      if (buf) fire(id, buf);
    });
  },

  setMusic(id: MusicId | null) {
    if (!id) {
      try {
        musicVoice?.src.stop();
      } catch {
        /* */
      }
      musicVoice = null;
      musicId = null;
      return;
    }
    if (!unlocked) return;
    if (musicId === id) return;
    void startMusic(id);
  },

  duckMusic,

  setTutorialDuck(on: boolean) {
    tutorialDuck = on;
    if (!musicGain || !ctx) return;
    const now = ctx.currentTime;
    musicGain.gain.cancelScheduledValues(now);
    musicGain.gain.setValueAtTime(musicGain.gain.value, now);
    musicGain.gain.linearRampToValueAtTime(on ? 0.4 : 1, now + 0.4);
  },

  pauseForBackground(hidden: boolean) {
    if (!ctx) return;
    if (hidden) void ctx.suspend();
    else if (unlocked) void ctx.resume();
  },
};
