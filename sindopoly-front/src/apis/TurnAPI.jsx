import API_BASE_URL from "./apiConfig";
import { apiFetch } from "./apiClient";
import { commandHeaders, readCommandResponse } from "./gameCommandState";

/**
 * Low-level wrappers around your two turn endpoints:
 *  • POST /api/turn/:gameId/:playerId/throw
 *  • POST /api/turn/:gameId/:playerId/action
 */
export const TurnAPI = {
  /** STEP 1: roll dice & peek → POST /throw */
  throwDice: async (gameId, playerId) => {
    const res = await apiFetch(
      `${API_BASE_URL}/api/turn/${gameId}/${playerId}/throw`,
      { method: "POST", headers: commandHeaders(gameId) }
    );
    // body should be your ThrowResultDto:
    // { dice, newPosition, passedGo, squareType, data }
    return await readCommandResponse(res, gameId);
  },

  /** STEP 2: apply buy/ok → POST /action */
  doAction: async (gameId, playerId, yes) => {
    const payload = { gameId, playerId, yes };
    const res = await apiFetch(
      `${API_BASE_URL}/api/turn/${gameId}/${playerId}/action`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...commandHeaders(gameId) },
        body: JSON.stringify(payload),
      }
    );
    // body should be your ActionResultDto:
    // { newBalance, acquiredProperties, nextPlayerId }
    return await readCommandResponse(res, gameId);
  },
};
