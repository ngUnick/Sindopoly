import API_BASE_URL from "./apiConfig";

/* ------------------------------------------------------------------
 *  Every per-turn call that already exists in Spring
 *  (your TurnController has them, even if the code wasn’t pasted).
 * -----------------------------------------------------------------*/
export const TurnAPI = {
  /* 🎲 roll the dice */
  rollDice: (gameId, playerId) =>
    fetch(`${API_BASE_URL}/api/turn/${gameId}/${playerId}/dice`, {
      method: "POST",
    }).then(r => {
      if (!r.ok) throw new Error("Dice roll failed");
      return r.json();                       // { dice1 , dice2 }
    }),

  /* 📋 list mandatory / optional actions */
  actions: (gameId, playerId) =>
    fetch(`${API_BASE_URL}/api/turn/${gameId}/${playerId}/actions`)
      .then(r => {
        if (!r.ok) throw new Error("Failed to fetch actions");
        return r.json();                     // { mandatory:[…], optional:[…] }
      }),

  /* ✅ pass turn */
  passTurn: (gameId, playerId) =>
    fetch(`${API_BASE_URL}/api/turn/${gameId}/${playerId}/pass`, {
      method: "POST",
    }).then(r => {
      if (!r.ok) throw new Error("Pass-turn failed");
    }),
};
