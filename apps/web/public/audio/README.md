# PlotGo audio assets

The mixer loads files from this folder first, then falls back to the in-engine synth.

Replace any file in place — no code change. Names match `apps/web/src/audio/cues.ts`.

```
audio/sfx/*.wav
audio/stinger/*.wav
audio/music/*.wav
```

Spec: `docs/PLOT_Sound_System_v1.0.md` (AAC m4a is fine too; update the `file` field on the cue).
