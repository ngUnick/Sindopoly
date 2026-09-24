import { useCallback, useContext, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AuthContext from "../../AuthContext/AuthContext.jsx";
import { GameplayFeedback } from "../../components/GameFeedback.js";
import { GAMEPLAY_CONTENT } from "../../features/game/content/el.js";
import {
  ContextPanel,
  MatchStatusHeader,
  PlayerRail,
} from "../../features/game/hud/index.js";
import ActionFocusRegion from "../../features/game/hud/ActionFocusRegion.js";
import GameLiveAnnouncer from "../../features/game/hud/GameLiveAnnouncer.js";
import MusicControl from "../../features/game/hud/MusicControl.js";
import { readCompletionNavigationState } from "../../features/game/presentation/gameViewModel.js";
import GameShell from "../../features/game/shell/GameShell.jsx";
import { useAuthoritativeGame } from "../../hooks/useAuthoritativeGame.js";
import GameBoard from "./GameBoard.jsx";
import "../../components/GameFeedback.css";

/** Live FE-REVAMP-021 route: HUD emits intent into one authoritative runtime. */
export default function AuthoritativeGame() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentPlayer } = useContext(AuthContext);
  const [scene, setScene] = useState(null);
  const gameId = parsePositiveId(searchParams.get("game"));
  const viewerPlayerId = parsePositiveId(currentPlayer?.id);
  const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  const handleSceneReady = useCallback(adapter => setScene(adapter), []);
  const game = useAuthoritativeGame({ gameId, viewerPlayerId, scene, reducedMotion });

  useEffect(() => {
    const completion = readCompletionNavigationState(game.viewModel);
    if (completion) navigate("/endgame", { replace: true, state: { completion } });
  }, [game.viewModel, navigate]);

  const context = game.metadata.status === "FAILED"
    ? (
        <ContextPanel title={GAMEPLAY_CONTENT.board}>
          <p role="alert">{GAMEPLAY_CONTENT.boardMetadataUnavailable}</p>
        </ContextPanel>
      )
    : null;
  const board = (
    <div className="game-live-board-region">
      <GameBoard onSceneReady={handleSceneReady} />
      <GameplayFeedback
        outcome={game.outcome}
        onDismiss={game.dismissOutcome}
      />
    </div>
  );

  return (
    <>
      <GameLiveAnnouncer key={gameId} viewModel={game.viewModel} />
      <GameShell
        header={game.viewModel && (
          <div className="game-header-controls">
            <MatchStatusHeader turn={game.viewModel.turn} connection={game.viewModel.connection} />
            <MusicControl />
          </div>
        )}
        players={game.viewModel && <PlayerRail players={game.viewModel.players} />}
        board={board}
        context={context}
        actions={game.viewModel && (
          <ActionFocusRegion
            action={game.viewModel.action}
            onPrimaryAction={game.onPrimaryAction}
            onSecondaryAction={game.onSecondaryAction}
          />
        )}
      />
    </>
  );
}

function parsePositiveId(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
