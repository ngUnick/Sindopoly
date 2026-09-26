import { useCallback, useEffect, useRef, useState } from "react";
import { BoardAPI } from "../apis/BoardAPI.js";
import { GameAPI } from "../apis/GameAPI.jsx";
import { TurnAPI } from "../apis/TurnAPI.jsx";
import { createGameRealtimeClient } from "../apis/gameRealtimeClient.js";
import { AuthoritativeGameRuntime } from "../features/game/controller/AuthoritativeGameRuntime.js";

const EMPTY_GAME_STATE = Object.freeze({
  controller: null,
  viewModel: null,
  displayAction: null,
  metadata: Object.freeze({ status: "LOADING", index: null, error: null }),
  history: Object.freeze({ gameId: null, entries: Object.freeze([]), seenEventIds: Object.freeze([]) }),
  outcome: null,
  presentationPhase: "IDLE",
});

/** Owns one production runtime instance for one mounted authenticated game. */
export function useAuthoritativeGame({
  gameId,
  viewerPlayerId,
  scene,
  reducedMotion = false,
} = {}) {
  const runtimeRef = useRef(null);
  const [state, setState] = useState(EMPTY_GAME_STATE);

  useEffect(() => {
    if (!scene || !isPositiveInteger(gameId) || !isPositiveInteger(viewerPlayerId)) {
      setState(EMPTY_GAME_STATE);
      return undefined;
    }

    const runtime = new AuthoritativeGameRuntime({
      gameId,
      viewerPlayerId,
      scene,
      fetchSnapshot: GameAPI.getRealtimeSnapshot,
      fetchBoardMetadata: BoardAPI.getMetadata,
      createRealtime: createGameRealtimeClient,
      commands: {
        roll: TurnAPI.throwDiceAuthoritative,
        resolve: TurnAPI.resolveActionAuthoritative,
        pass: TurnAPI.passAuthoritative,
      },
      reducedMotion,
      onDiagnostic: error => console.error("Authoritative game runtime failure", error),
    });
    runtimeRef.current = runtime;
    const unsubscribe = runtime.subscribe(() => setState(runtime.getState()));
    setState(runtime.getState());
    runtime.start();

    return () => {
      unsubscribe();
      runtime.dispose();
      if (runtimeRef.current === runtime) runtimeRef.current = null;
    };
  }, [gameId, viewerPlayerId, scene, reducedMotion]);

  const onPrimaryAction = useCallback(
    () => runtimeRef.current?.primaryAction() ?? Promise.resolve(false),
    [],
  );
  const onSecondaryAction = useCallback(
    () => runtimeRef.current?.secondaryAction() ?? Promise.resolve(false),
    [],
  );
  const dismissOutcome = useCallback(
    () => runtimeRef.current?.dismissOutcome() ?? false,
    [],
  );

  return Object.freeze({
    ...state,
    onPrimaryAction,
    onSecondaryAction,
    dismissOutcome,
  });
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}
