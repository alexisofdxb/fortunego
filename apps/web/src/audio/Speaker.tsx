import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { audio } from "./player";
import { useAudioSettings } from "./settings";

/** Header speaker: click mutes; caret opens Music / SFX sliders. */
export function Speaker() {
  const muted = useAudioSettings((s) => s.muted);
  const music = useAudioSettings((s) => s.music);
  const sfx = useAudioSettings((s) => s.sfx);
  const toggleMuted = useAudioSettings((s) => s.toggleMuted);
  const setMusic = useAudioSettings((s) => s.setMusic);
  const setSfx = useAudioSettings((s) => s.setSfx);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="speaker" ref={root}>
      <button
        type="button"
        className="speaker-btn"
        title={muted ? "Unmute" : "Mute"}
        aria-label={muted ? "Unmute" : "Mute"}
        aria-pressed={muted}
        onClick={() => {
          void audio.unlock();
          toggleMuted();
          audio.play("ui_tap");
        }}
      >
        {muted ? <VolumeX size={16} strokeWidth={1.8} /> : <Volume2 size={16} strokeWidth={1.8} />}
      </button>
      <button
        type="button"
        className="speaker-caret"
        aria-label="Sound settings"
        aria-expanded={open}
        onClick={() => {
          void audio.unlock();
          setOpen((v) => !v);
        }}
      >
        ▾
      </button>
      {open ? (
        <div className="speaker-pop" role="dialog" aria-label="Sound">
          <label>
            Music
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={music}
              onChange={(e) => setMusic(Number(e.target.value))}
            />
          </label>
          <label>
            SFX
            <input type="range" min={0} max={1} step={0.01} value={sfx} onChange={(e) => setSfx(Number(e.target.value))} />
          </label>
        </div>
      ) : null}
    </div>
  );
}
