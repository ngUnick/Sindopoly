import API_BASE_URL from "./apiConfig";

export const GamePlayAPI = {


    // ✅ Check if Player is In-Game
    getInGameStatus: async (playerId) => {
        const response = await fetch(`${API_BASE_URL}/api/game-state/in-game/${playerId}`);
        if (!response.ok) throw new Error("Failed to check game state");
        return await response.json(); // true/false
    }


  // ✅ Play Turn (Roll Dice + Move + Handle Tile)
  playTurn: async (gameId, playerId) => {
    const response = await fetch(`${API_BASE_URL}/api/turn/play`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId, playerId }),
    });

    if (!response.ok) throw new Error("Failed to play turn");
    return await response.json(); // returns TurnService.TurnResponse
  },

  // ✅ Get Player State from Redis
  getPlayerState: async (playerId) => {
    const response = await fetch(`${API_BASE_URL}/api/player-state/${playerId}`);
    if (!response.ok) throw new Error("Failed to get player state");
    return await response.json(); // position, money, etc.
  },

  // ✅ Update Player State (optional)
  updatePlayerState: async (playerId, data) => {
    const response = await fetch(`${API_BASE_URL}/api/player-state/${playerId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!response.ok) throw new Error("Failed to update player state");
    return await response.text();
  },

  // ✅ Buy Property (forced buy)
  buyProperty: async (gameId, playerId, propertyId) => {
    const response = await fetch(`${API_BASE_URL}/api/player-state/${gameId}/${playerId}/buy?propertyId=${propertyId}`, {
      method: "POST",
    });

    if (!response.ok) throw new Error("Failed to buy property");
    return await response.json();
  },

  // ✅ Pay Jail Fine (50 by default)
  payJailFine: async (gameId, playerId) => {
    const response = await fetch(`${API_BASE_URL}/api/player-state/${gameId}/${playerId}/pay-jail`, {
      method: "POST",
    });

    if (!response.ok) throw new Error("Failed to pay jail fine");
    return await response.json(); // { status: "freed", paid: 50 }
  },

  // ✅ End Game / Remove Player (if you want this manually exposed)
  deletePlayerState: async (playerId) => {
    const response = await fetch(`${API_BASE_URL}/api/player-state/${playerId}`, {
      method: "DELETE",
    });

    if (!response.ok) throw new Error("Failed to delete player state");
    return await response.text();
  }
};
