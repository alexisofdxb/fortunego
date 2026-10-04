# PlotGo Sound System v1.0

| | |
|---|---|
| **Product** | PlotGo — Founder Plot |
| **Date** | 2026-10-04 |
| **Status** | Design, ready to implement |
| **Repo** | `apps/web` (Vite + React). No audio exists today. |
| **Supersedes** | GDD §41 (six optional one-shots). This doc is the catalog, mix, and wiring. |

Audio is a client presentation layer. The API stays silent. Economy state, XP, and settlements remain server-authoritative; the web app plays cues when the player *does* something or when a snapshot change is already visible on screen.

---

## 1. What this is

A small mixer inside the web app:

- one looping **district bed** (music)
- short **stingers** (upgrade, level-up, close-day, hunt claim)
- **board and UI SFX** (place, drag, locked hex, drawers, banners)

It should feel like a quiet financial district at golden hour: analog, gold, wood, paper, a distant trading floor. Premium and restrained. One sound per action. No chatter, no voiceover in v1.

---

## 2. Goals

- Every important verb has a sound: place, invalid drop, acquire, upgrade, close day, hunt start/claim, objective complete, level up.
- Music starts after the first tap (browser autoplay). It never fights the tutorial coach.
- Mute, music, and SFX volumes persist per browser (`localStorage`).
- Total audio payload for v1 stays under **1.5 MB** gzipped (beds streamed, SFX preloaded).
- One module owns the AudioContext. Components fire named cues; they never touch the graph.

---

## 3. Audio identity

**Palette.** Soft piano or Rhodes, muted brass, upright bass, light percussion (shaker, woodblock), paper/card foley, coin/ledger ticks, a low market murmur. Gold frequencies around 2–4 kHz for “value” moments. No dubstep, no 8-bit chiptune, no stock “UI blip pack” that could be any mobile game.

**Tempo.** Beds at 80–96 BPM. Slow enough to sit under a city that barely moves.

**Rank color.** Humble is sparse (piano + murmur). Each empire rank adds one layer: Starter adds bass, Growing adds light strings, Established adds brass hits on stingers only, Elite/Tycoon thicken the murmur. The melody stays the same so the district still sounds like home.

**Day state.** While the day is open, the bed is brighter. After **Close Day**, the bed ducks 3 dB and a dusk pad fades in for ~8 s, then the quieter loop continues until UTC reset.

---

## 4. Architecture

Native **Web Audio API**. No Howler/Tone.js. A ~200-line `audio/` package is enough: context unlock, buses, buffer cache, one music source, a small SFX voice pool.

```
apps/web/src/audio/
  context.ts      // AudioContext singleton, unlock on first pointerdown
  buses.ts        // master → music / sfx / ui / stinger
  loader.ts       // fetch + decode, preload list
  player.ts       // play(id), playStinger(id), setMusic(id | null)
  cues.ts         // CueId union + catalog (gain, bus, cooldown, duck)
  settings.ts     // zustand slice or localStorage: muted, musicGain, sfxGain
  AudioRoot.tsx   // mounts in App, unlocks, preloads, reacts to plot/ui
```

```
apps/web/public/audio/
  music/humble-day.m4a
  music/humble-dusk.m4a
  music/visit.m4a
  sfx/place.m4a
  sfx/locked.m4a
  ...
```

**Unlock.** `AudioRoot` listens once for `pointerdown` / `keydown` on `window`, calls `context.resume()`, then starts the bed. Until then, SFX queue is dropped (do not backlog 20 taps).

**Play API** (what the rest of the app calls):

```ts
audio.play("place");
audio.play("hex_locked");
audio.stinger("upgrade_regional");
audio.setMusic("humble_day");
audio.duckMusic(0.35, 900); // linear, ms
```

Components import `audio` from `src/audio/player.ts`. They pass a `CueId`. They never pass a URL.

**Voice pool.** 8 concurrent SFX voices. Same cue within its cooldown (see catalog) is ignored. Stingers steal the previous stinger (one at a time).

**Ducking.** Stingers and the tutorial coach duck the music bus to 35% for the stinger length + 200 ms release. SFX do not duck.

---

## 5. Buses and mix

| Bus | Default gain | Role |
|---|---|---|
| `master` | 0.85 | User master. Mute sets this to 0. |
| `music` | 0.28 | Looping beds. Duckable. |
| `sfx` | 0.70 | Board foley (place, drag, locked, acquire). |
| `ui` | 0.55 | Clicks, drawer open/close, banners. Quieter than board. |
| `stinger` | 0.80 | Upgrade, level-up, hunt claim, close-day. |

Mute is a single switch (header speaker). Music and SFX sliders live behind it (settings popover on the speaker). Persist:

```
plotgo:audio = { muted, music: 0–1, sfx: 0–1 }
```

`sfx` slider drives both `sfx` and `ui` buses. `stinger` follows `sfx` × 1.15, clamped to 1.

---

## 6. Music beds

One bed at a time. Crossfade 1.2 s.

| Id | When | Length (loop) | Notes |
|---|---|---|---|
| `humble_day` | Own board, ranks Humble–Starter, day open | 48–64 s | Piano + murmur. Default. |
| `humble_dusk` | Own board, after Close Day | 32 s then return to day bed at −3 dB | Same motif, darker. |
| `growing_day` | Rank Growing+ | 64 s | Adds bass / strings. Swap on promotion, not on every XP tick. |
| `visit` | `visitMode` set | 40 s | Slightly more distant, other-city. |
| `world` | World overlay open | 40 s | Map wind, very quiet. |
| `none` | Landing / loading | — | Silence until first gesture. |

Rank is `plot.hexBoard` rank (Humble / Starter / Growing / …), not raw level. Level-ups inside a rank do not swap the bed; they fire a stinger only.

Tutorial: keep `humble_day` but duck to 40% while `Tutorial` is mounted. Restore on finish.

---

## 7. Cue catalog

Cooldown is ms. `poly` = can overlap (capped by the 8-voice pool).

### Board

| Cue | Bus | Cooldown | Trigger |
|---|---|---|---|
| `card_pickup` | sfx | 80 | Hand drag crosses threshold (`Hand.beginCardDrag`). |
| `card_drag_tick` | sfx | 140 | While dragging, on hex change only (not every pointermove). Soft wood tick. |
| `place` | sfx | 200 | `usePlace` success. Card hits owned empty hex. |
| `hex_locked` | sfx | 180 | Hover or drop on a locked/occupied hex (`hex-blocked`). Short muted brass “no”. |
| `hex_valid` | sfx | 200 | First hover onto a droppable hex this drag. Soft chime, very quiet. |
| `acquire` | sfx | 300 | Land acquire success. Stamp + paper. |
| `inspect_open` | ui | 120 | Inspect drawer opens. |
| `inspect_close` | ui | 120 | Inspect drawer closes. |
| `parcel_open` | ui | 120 | HexDrawer opens. |

### Economy / progression

| Cue | Bus | Cooldown | Trigger |
|---|---|---|---|
| `upgrade_regional` | stinger | 600 | Celebration, stage 2. |
| `upgrade_tower` | stinger | 600 | Celebration, stage 3. Longer, one extra brass hit. |
| `module_equip` | sfx | 200 | Module equip success. Click + small sparkle. |
| `close_day` | stinger | 800 | Close Day success. Ledger slam + cash tick. |
| `cash_tick` | sfx | 60 | Receipt / cash chip count-up (optional v1.1). |
| `level_up` | stinger | 1000 | `empireLevel` increases. Fanfare, 1.4 s. |
| `capacity_up` | ui | 400 | “Land Capacity Increased” toast. |
| `objective_done` | sfx | 250 | Objective lane completes. |
| `hunt_start` | sfx | 250 | Hunt started. |
| `hunt_claim` | stinger | 500 | Hunt claimed (stock fragment). |
| `xp_tick` | ui | 80 | Header XP bar moves (throttled). Skip in v1 if busy. |

### Chrome

| Cue | Bus | Cooldown | Trigger |
|---|---|---|---|
| `ui_tap` | ui | 50 | Dock banner, quest toggle, catalog card. Gain 0.35. Easy to overuse — only primary buttons. |
| `drawer_open` | ui | 100 | Quest tracker, dock sheet, catalog overlay. |
| `drawer_close` | ui | 100 | Matching close. |
| `error` | ui | 200 | Mutation `onError` toast. Soft down-interval. |
| `tut_advance` | ui | 150 | Tutorial step advances. |
| `celebrate_spark` | stinger | — | Same as upgrade stinger; do not double-fire. `Celebration` mount plays the upgrade cue once from `useUpgrade`. |

---

## 8. Wiring map (code)

Fire cues at the **success / state edge**, never in render.

| Cue | File |
|---|---|
| `card_pickup`, `place` (client drop), `hex_locked` on drop | `Hand.tsx` `beginCardDrag` |
| `card_drag_tick`, `hex_locked` / `hex_valid` on hover | `HexBoard.tsx` hoverHex effect |
| `place` (API confirm) | `hooks.ts` `usePlace` `onSuccess` |
| `acquire` | `hooks.ts` `useAcquireLand` |
| `upgrade_*` | `hooks.ts` `useUpgrade` (already builds the celebration) |
| `module_equip` | `hooks.ts` `useModuleEquip` |
| `close_day` | `hooks.ts` `useSessionSettle` |
| `hunt_start` / `hunt_claim` | `hooks.ts` hunt mutations |
| `objective_done` | `ObjectivesPanel.tsx` existing complete-toast effect |
| `level_up`, `capacity_up` | `Header.tsx` existing level/capacity effect |
| `inspect_open/close` | `InspectSheet.tsx` mount/unmount |
| `tut_advance` | `Tutorial.tsx` `setStep` |
| Music bed | `AudioRoot.tsx` from `visitMode`, dock-world, rank, `plot.session` |

`AudioRoot` is the only subscriber that *chooses music*. Everyone else only `play`s one-shots.

---

## 9. Settings UI

Speaker button in the header (right cluster, left of the bell).

- Click: toggle mute (icon swaps).
- Long-press / small caret: popover with Music and SFX sliders.
- First visit: unmuted, music 0.28, sfx 0.70.
- `prefers-reduced-motion: reduce` does **not** auto-mute (motion ≠ sound). Offer mute in the tutorial last step: “Sound is on — tap the speaker any time.”

---

## 10. Asset spec

| Kind | Format | Channels | Sample rate | Notes |
|---|---|---|---|---|
| Music beds | `.m4a` AAC, 96–128 kbps | stereo | 44.1 kHz | Seamless loop. Provide 200 ms overlap in the file. |
| SFX / UI | `.m4a` AAC, 64–96 kbps | mono | 44.1 kHz | Peak −6 dBTP. |
| Stingers | `.m4a` AAC, 96 kbps | stereo | 44.1 kHz | 0.8–1.8 s. |

Keep a lossless session in whatever DAW; the repo only gets AAC. File names = cue ids (`place.m4a`).

**v1 source list (commission or pack, then retune):** 1 day bed, 1 dusk bed, 1 visit bed, ~18 SFX, 4 stingers. World bed can reuse dusk −6 dB until P3.

Placeholder sine blips are allowed in the first PR so wiring can land before art. Replace files in `public/audio/` without a code change.

---

## 11. Performance and mobile

- Decode SFX at unlock (one `Promise.all`). Music decodes on first need.
- Do not decode on the main thread if a bed is > 1 MB; `AudioContext.decodeAudioData` is async and fine at this size.
- iOS: resume the context on `visibilitychange` → `visible`.
- Background tab: `document.hidden` pauses music, keeps SFX muted; resume on visible.
- No audio worklets in v1.

---

## 12. Build order

**PR 1 — Mixer + mute.** `audio/` module, unlock, speaker button, placeholder SFX for `place`, `hex_locked`, `ui_tap`. No music yet.

**PR 2 — Board verbs.** Wire Hand, HexBoard, InspectSheet, acquire, errors.

**PR 3 — Stingers.** Upgrade celebration, close day, hunt start/claim, objective done, level up. Duck music.

**PR 4 — Music.** Humble day + dusk. Visit bed. Tutorial duck. Rank swap stub (same file until Growing bed exists).

**PR 5 — Polish.** Drag tick, valid-hex chime, dusk pad, settings sliders, real assets replacing placeholders.

Each PR is playable with the previous mix.

---

## 13. Acceptance

- First tap starts (or is ready to start) the bed. No console errors on Safari iOS and Chrome desktop.
- Mute kills everything immediately; unmute restores the bed.
- Placing on a locked hex plays `hex_locked` and does not play `place`.
- Upgrade celebration plays one stinger, not stinger + sparkle + ui_tap.
- Close Day plays `close_day` once per success.
- Tutorial remains readable; music is ducked; coach click still has `tut_advance`.
- Reloading keeps mute/volume.
- Network tab: audio files cache (`Cache-Control` from Vite/static). Switching beds does not download the same file twice.

---

## 14. Out of scope for v1

- Voice / VO.
- Adaptive music that follows Cash per second.
- Spatial / HRTF on hexes.
- User-uploaded music.
- Sound on the API, emails, or push.
- Per-building leitmotifs (can tag `lineage` on `place` later with a pitch offset, not new files).
