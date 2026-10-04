import type { CueId, MusicId } from "./cues";

const SR = 44100;

function env(t: number, dur: number, attack: number, release: number): number {
  if (t < 0 || t > dur) return 0;
  if (t < attack) return t / attack;
  if (t > dur - release) return Math.max(0, (dur - t) / release);
  return 1;
}

function sampleBuffer(ctx: AudioContext, seconds: number, stereo: boolean, fn: (i: number, ch: number) => number): AudioBuffer {
  const n = Math.floor(SR * seconds);
  const buffer = ctx.createBuffer(stereo ? 2 : 1, n, SR);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < n; i++) data[i] = fn(i, ch);
  }
  return buffer;
}

function tone(i: number, hz: number): number {
  return Math.sin((2 * Math.PI * hz * i) / SR);
}

function tri(i: number, hz: number): number {
  const p = (hz * i) / SR;
  return 1 - 4 * Math.abs(Math.round(p) - p);
}

function hash(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** Soft Rhodes-ish partials. */
function rhodes(i: number, hz: number, t: number, start: number, dur: number): number {
  const local = t - start;
  if (local < 0 || local > dur) return 0;
  const e = env(local, dur, 0.012, dur * 0.55);
  return e * (0.55 * tone(i, hz) + 0.18 * tone(i, hz * 2) + 0.06 * tone(i, hz * 3));
}

function wood(i: number, t: number, start: number): number {
  const local = t - start;
  if (local < 0 || local > 0.04) return 0;
  return (hash(i) * 2 - 1) * 0.22 * env(local, 0.04, 0.001, 0.03) + 0.15 * tone(i, 180) * env(local, 0.04, 0.001, 0.03);
}

/** Quiet district palette: piano-ish partials, wood ticks, muted brass. */
export function synthCue(ctx: AudioContext, id: CueId): AudioBuffer {
  switch (id) {
    case "card_pickup":
      return sampleBuffer(ctx, 0.14, false, (i) => {
        const t = i / SR;
        return (rhodes(i, 392, t, 0, 0.14) * 0.7 + wood(i, t, 0) * 0.5);
      });
    case "card_drag_tick":
      return sampleBuffer(ctx, 0.045, false, (i) => {
        const t = i / SR;
        return wood(i, t, 0) * 0.7;
      });
    case "place":
      return sampleBuffer(ctx, 0.28, false, (i) => {
        const t = i / SR;
        return rhodes(i, 262, t, 0, 0.22) * 0.55 + rhodes(i, 392, t, 0.04, 0.22) * 0.4 + wood(i, t, 0) * 0.35;
      });
    case "hex_locked":
      return sampleBuffer(ctx, 0.22, false, (i) => {
        const t = i / SR;
        const hz = 185 - t * 70;
        return (0.38 * tone(i, hz) + 0.16 * tri(i, hz * 0.5)) * env(t, 0.22, 0.006, 0.14);
      });
    case "hex_valid":
      return sampleBuffer(ctx, 0.16, false, (i) => {
        const t = i / SR;
        return rhodes(i, 784, t, 0, 0.16) * 0.45;
      });
    case "acquire":
      return sampleBuffer(ctx, 0.32, false, (i) => {
        const t = i / SR;
        const paper = (hash(i) * 2 - 1) * 0.1 * env(t, 0.07, 0.001, 0.05);
        return paper + rhodes(i, 196, t, 0.02, 0.28) * 0.55 + rhodes(i, 294, t, 0.06, 0.24) * 0.35;
      });
    case "inspect_open":
    case "parcel_open":
    case "drawer_open":
      return sampleBuffer(ctx, 0.13, false, (i) => {
        const t = i / SR;
        return 0.28 * tone(i, 330 + t * 70) * env(t, 0.13, 0.008, 0.07);
      });
    case "inspect_close":
    case "drawer_close":
      return sampleBuffer(ctx, 0.12, false, (i) => {
        const t = i / SR;
        return 0.26 * tone(i, 330 - t * 80) * env(t, 0.12, 0.005, 0.07);
      });
    case "upgrade_regional":
      return chord(ctx, [262, 330, 392], 0.95);
    case "upgrade_tower":
      return chord(ctx, [262, 330, 392, 523], 1.2);
    case "module_equip":
      return sampleBuffer(ctx, 0.2, false, (i) => {
        const t = i / SR;
        return rhodes(i, 523, t, 0, 0.18) * 0.5 + rhodes(i, 784, t, 0.03, 0.16) * 0.28;
      });
    case "close_day":
      return chord(ctx, [196, 247, 294], 1.25);
    case "level_up":
      return chord(ctx, [262, 330, 392, 523, 659], 1.45);
    case "capacity_up":
      return sampleBuffer(ctx, 0.26, false, (i) => {
        const t = i / SR;
        return rhodes(i, 392, t, 0, 0.24) * 0.45 + rhodes(i, 587, t, 0.05, 0.2) * 0.32;
      });
    case "objective_done":
      return sampleBuffer(ctx, 0.24, false, (i) => {
        const t = i / SR;
        return rhodes(i, 392, t, 0, 0.14) * 0.45 + rhodes(i, 523, t, 0.08, 0.16) * 0.4;
      });
    case "hunt_start":
      return sampleBuffer(ctx, 0.22, false, (i) => {
        const t = i / SR;
        return rhodes(i, 349, t, 0, 0.18) * 0.45 + rhodes(i, 440, t, 0.04, 0.16) * 0.32;
      });
    case "hunt_claim":
      return chord(ctx, [294, 370, 440], 1.05);
    case "ui_tap":
      return sampleBuffer(ctx, 0.035, false, (i) => {
        const t = i / SR;
        return 0.18 * tone(i, 920) * env(t, 0.035, 0.001, 0.028);
      });
    case "error":
      return sampleBuffer(ctx, 0.18, false, (i) => {
        const t = i / SR;
        return 0.36 * tone(i, 165 - t * 40) * env(t, 0.18, 0.005, 0.1);
      });
    case "tut_advance":
      return sampleBuffer(ctx, 0.11, false, (i) => {
        const t = i / SR;
        return rhodes(i, 659, t, 0, 0.11) * 0.4;
      });
  }
}

function chord(ctx: AudioContext, freqs: number[], dur: number): AudioBuffer {
  return sampleBuffer(ctx, dur, true, (i, ch) => {
    const t = i / SR;
    let s = 0;
    freqs.forEach((hz, n) => {
      const delay = n * 0.08;
      s += rhodes(i, hz * (ch === 1 ? 1.003 : 1), t, delay, dur - delay) * (ch === 0 ? 0.42 : 0.38);
    });
    return s;
  });
}

/**
 * 8-second seamless loop at 90 BPM (12 beats). Sparse C-pentatonic Rhodes
 * over a low fifth and a market murmur.
 */
export function synthMusic(ctx: AudioContext, id: MusicId): AudioBuffer {
  const seconds = 8;
  const n = Math.floor(SR * seconds);
  const brightness = id === "humble_dusk" || id === "world" ? 0.52 : id === "visit" ? 0.72 : id === "growing_day" ? 1.12 : 1;
  const detune = id === "visit" ? 1.008 : 1;
  const melody: { beat: number; hz: number }[] = [
    { beat: 0, hz: 329.63 },
    { beat: 3, hz: 392.0 },
    { beat: 6, hz: 293.66 },
    { beat: 8, hz: 261.63 },
    { beat: 10, hz: 196.0 },
  ];
  const beat = 60 / 90;

  return sampleBuffer(ctx, seconds, true, (i, ch) => {
    const t = i / SR;
    const lfo = 0.55 + 0.45 * Math.sin(2 * Math.PI * 0.07 * t + ch * 0.6);
    const murmur = 0.01 * brightness * Math.sin(2 * Math.PI * 4 * t + ch) * Math.sin(2 * Math.PI * 7 * t);
    let pad =
      0.1 * brightness * tone(i, 65.41 * detune) +
      0.07 * brightness * tone(i, 98.0 * detune) +
      0.035 * brightness * tri(i, 196 * (ch === 1 ? 1.002 : 1) * detune) * lfo;
    if (id === "humble_dusk" || id === "world") pad += 0.045 * tone(i, 49);
    if (id === "growing_day") pad += 0.03 * tone(i, 164.81 * detune) * lfo;

    let lead = 0;
    for (const note of melody) {
      lead += rhodes(i, note.hz * detune * (ch === 1 ? 1.002 : 1), t, note.beat * beat, 1.35) * 0.22 * brightness;
    }

    const edge = i < 1024 ? i / 1024 : i > n - 1024 ? (n - i) / 1024 : 1;
    return (pad + lead + murmur) * edge;
  });
}
