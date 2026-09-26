import { commandHeaders } from "./gameCommandState.js";

/** Build a start intent from the authoritative lobby snapshot version. */
export function buildStartGameRequest(gameId, playerId, stateVersion) {
  if (stateVersion == null || stateVersion === "") {
    throw new Error("Game state is not synchronized; refresh before starting the game");
  }
  const expectedVersion = Number(stateVersion);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
    throw new Error("Game state is not synchronized; refresh before starting the game");
  }

  return Object.freeze({
    path: `/api/game-state/${gameId}/start?playerId=${playerId}`,
    options: Object.freeze({
      method: "POST",
      headers: Object.freeze(commandHeaders(gameId, expectedVersion)),
    }),
  });
}
