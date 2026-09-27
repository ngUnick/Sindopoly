import React, { useEffect, useRef, useState } from "react";
import honeyJam from "../../../assets/audio/massobeats-honey_jam.mp3";
import { ACCESSIBILITY_CONTENT } from "../content/el.js";
import { GameplayMusicController } from "./GameplayMusicController.js";

/** Owns gameplay-only ambient audio while the surrounding game route is mounted. */
export default function MusicControl() {
  const controllerRef = useRef(null);
  if (!controllerRef.current) controllerRef.current = new GameplayMusicController({ source: honeyJam });
  const controller = controllerRef.current;
  const [enabled, setEnabled] = useState(() => controller.getEnabled());

  useEffect(() => {
    controller.start();
    return () => controller.stop();
  }, [controller]);

  const toggle = () => {
    setEnabled(controller.toggle());
  };

  return React.createElement("button", {
    type: "button",
    className: "game-music-control",
    "aria-pressed": enabled,
    "aria-label": enabled ? ACCESSIBILITY_CONTENT.muteMusic : ACCESSIBILITY_CONTENT.enableMusic,
    onClick: toggle,
  }, enabled ? "♫" : "🔇");
}
