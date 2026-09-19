import React, { useEffect, useRef, useState } from "react";
import honeyJam from "../../../assets/audio/massobeats-honey_jam.mp3";
import { ACCESSIBILITY_CONTENT } from "../content/el.js";
import { persistMusicEnabled, readMusicEnabled } from "./musicPreference.js";

/** Owns only gesture-gated ambient audio; game state and controls remain elsewhere. */
export default function MusicControl() {
  const [enabled, setEnabled] = useState(() => readMusicEnabled());
  const audioRef = useRef(null);

  useEffect(() => () => {
    audioRef.current?.pause();
    audioRef.current = null;
  }, []);

  const toggle = () => {
    const next = !enabled;
    persistMusicEnabled(next);
    setEnabled(next);
    if (!globalThis.Audio) return;

    if (!audioRef.current) {
      audioRef.current = new globalThis.Audio(honeyJam);
      audioRef.current.loop = true;
      audioRef.current.volume = 0.5;
    }
    if (next) {
      audioRef.current.play().catch(() => {
        persistMusicEnabled(false);
        setEnabled(false);
      });
    } else {
      audioRef.current.pause();
    }
  };

  return React.createElement("button", {
    type: "button",
    className: "game-music-control",
    "aria-pressed": enabled,
    "aria-label": enabled ? ACCESSIBILITY_CONTENT.muteMusic : ACCESSIBILITY_CONTENT.enableMusic,
    onClick: toggle,
  }, enabled ? "♫" : "🔇");
}
