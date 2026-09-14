const RESUMABLE_STATUSES = new Set(["lobby", "inProgress"]);
const VISIBILITIES = new Set(["public", "private"]);

export async function readCurrentGameResponse(response) {
  if (response.status === 204) return null;
  if (!response.ok) {
    const error = new Error(
      response.status === 401
        ? "Authenticated session not found"
        : "Failed to resolve the current game",
    );
    error.status = response.status;
    throw error;
  }

  const currentGame = await response.json();
  if (!isCurrentGame(currentGame)) {
    const error = new Error("Current-game response is invalid");
    error.code = "invalidPayload";
    throw error;
  }
  return currentGame;
}

export function continueGameRoute(currentGame, playerId) {
  if (!isCurrentGame(currentGame)) return null;
  if (currentGame.status === "lobby") {
    return `/lobby?game_id=${currentGame.gameId}&visibility=${currentGame.visibility}`;
  }

  const parsedPlayerId = Number(playerId);
  if (!Number.isSafeInteger(parsedPlayerId) || parsedPlayerId <= 0) return null;
  return `/Game?game=${currentGame.gameId}&player=${parsedPlayerId}`;
}

function isCurrentGame(value) {
  return value !== null
    && typeof value === "object"
    && Number.isSafeInteger(value.gameId)
    && value.gameId > 0
    && RESUMABLE_STATUSES.has(value.status)
    && Number.isSafeInteger(value.stateVersion)
    && value.stateVersion >= 0
    && VISIBILITIES.has(value.visibility);
}
