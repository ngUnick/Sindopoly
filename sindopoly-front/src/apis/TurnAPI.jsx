import API_BASE_URL from "./apiConfig";

/**
 * Low-level wrappers around the two new turn endpoints:
 *  - throwDice: roll & move, returns ThrowResultDto
 *  - doAction:  apply the buy/pass/ok, returns ActionResultDto
 */
export const TurnAPI = {
  /** Step 1: roll dice and move: POST /api/turn/:gameId/:playerId/throw */
  throwDice: async (gameId, playerId) => {
    const res = await fetch(
      `${API_BASE_URL}/api/turn/${gameId}/${playerId}/throw`,
      { method: "POST" }
    );
    const body = await res.json();
    if (!res.ok) {
      throw new Error(body.error || "Throw dice failed");
    }
    return body;  // { dice, newPosition, event }
  },

  /** Step 2: apply decision: POST /api/turn/:gameId/:playerId/action */
  doAction: async (gameId, playerId, action, squareId = null) => {
    const payload = { gameId, playerId, action, squareId };
    const res = await fetch(
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
    return body;  // { newBalance, acquiredProperties, nextPlayerId }
  },
};
