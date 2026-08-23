import API_BASE_URL from "./apiConfig";
import { apiFetch } from "./apiClient";

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
      { method: "POST" }
    );
    const body = await res.json();
    if (!res.ok) {
      throw new Error(body.error || "Throw dice failed");
    }
    // body should be your ThrowResultDto:
    // { dice, newPosition, passedGo, squareType, data }
    return body;
  },

  /** STEP 2: apply buy/ok → POST /action */
  doAction: async (gameId, playerId, yes) => {
    const payload = { gameId, playerId, yes };
    const res = await apiFetch(
      `${API_BASE_URL}/api/turn/${gameId}/${playerId}/action`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const body = await res.json();
    if (!res.ok) {
      throw new Error(body.error || "Action failed");
    }
    // body should be your ActionResultDto:
    // { newBalance, acquiredProperties, nextPlayerId }
    return body;
  },
};
