import PropTypes from "prop-types";
import { useEffect, useRef } from "react";
import boardModelUrl from "../../assets/models/board.glb?url";
import diceModelUrl from "../../assets/models/Dice.glb?url";
import backpackModelUrl from "../../assets/models/pawns/Backpack.glb?url";
import frappeCupModelUrl from "../../assets/models/pawns/FrappeCup.glb?url";
import graduationCapModelUrl from "../../assets/models/pawns/GraduationCap.glb?url";
import laptopModelUrl from "../../assets/models/pawns/Laptop.glb?url";
import { BoardSceneAdapter } from "../../features/game/board/BoardSceneAdapter.js";

const pawnModelUrls = Object.freeze({
  backpack: backpackModelUrl,
  frappeCup: frappeCupModelUrl,
  graduationCap: graduationCapModelUrl,
  laptop: laptopModelUrl,
});

/** Mounts the sole Three.js owner and exposes only its narrow presentation port. */
export default function GameBoard({ onSceneReady, reducedMotion = false }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const adapter = new BoardSceneAdapter({
      boardModelUrl, diceModelUrl, pawnModelUrls, reducedMotion,
    });
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
