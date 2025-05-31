import API_BASE_URL from "./apiConfig";

/* ------------------------------------------------------------------
 *  Minimal wrapper around every /api/turn/* endpoint that exists
 * -----------------------------------------------------------------*/
export const TurnAPI = {
  /* 🎲 perform the entire turn (dice → move → optionalAction|rotate) */
  playTurn: (gameId, playerId) =>
    fetch(`${API_BASE_URL}/api/turn/${gameId}/${playerId}`, {
      method: "POST",
    }).then((r) => {
      if (!r.ok) throw new Error("Turn execution failed");
      return r.json();                       // <- TurnResponse JSON
    }),

  /* ✅ skip / pass when the player declines an optional action */
  passTurn: (gameId, playerId) =>
    fetch(`${API_BASE_URL}/api/turn/${gameId}/${playerId}/pass`, {
      method: "POST",
    }).then((r) => {
      if (!r.ok) throw new Error("Pass-turn failed");
    }),
};
