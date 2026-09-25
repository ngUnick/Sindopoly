import PropTypes from "prop-types";
import { useEffect, useRef } from "react";
import boardModelUrl from "../../assets/models/board.glb?url";
import diceModelUrl from "../../assets/models/Dice.glb?url";
import { BoardSceneAdapter } from "../../features/game/board/BoardSceneAdapter.js";

/** Mounts the sole Three.js owner and exposes only its narrow presentation port. */
export default function GameBoard({ onSceneReady, reducedMotion = false }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const adapter = new BoardSceneAdapter({ boardModelUrl, diceModelUrl, reducedMotion });
    if (!adapter.mount(containerRef.current)) return undefined;
    onSceneReady(adapter);
    return () => {
      onSceneReady(null);
      adapter.dispose();
    };
  }, [onSceneReady, reducedMotion]);

  return <div ref={containerRef} className="game-live-board" aria-label="Τρισδιάστατο ταμπλό" />;
}

GameBoard.propTypes = {
  onSceneReady: PropTypes.func.isRequired,
  reducedMotion: PropTypes.bool,
};
