import API_BASE_URL from "./apiConfig";

export const GameAPI = {
  // ✅ Create Game
  createGame: async (visibility) => {
    const payload = {
      ownerId: parseInt(localStorage.getItem("player_id")),
      visibility
    };

    const response = await fetch(`${API_BASE_URL}/api/game-state/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Create game failed: ${errText}`);
    }

    return await response.json();
  },

  // ✅ Start Game
  startGame: async (gameId) => {
    const response = await fetch(`${API_BASE_URL}/api/game-state/${gameId}/start`, {
      method: "POST",
    });

    if (!response.ok) throw new Error("Failed to start game");
    return await response.text();
  },

  // ✅ Join Public Game
  joinGame: async (gameId) => {
    const playerId = parseInt(localStorage.getItem("player_id"));
    const response = await fetch(`${API_BASE_URL}/api/game-state/${gameId}/add-player?playerId=${playerId}`, {
      method: "POST",
    });

    if (!response.ok) throw new Error("Failed to join game");
    return await response.text();
  },

  // ✅ Join Private Game by Code
  joinWithInvite: async (code) => {
    const playerId = parseInt(localStorage.getItem("player_id"));
    const response = await fetch(`${API_BASE_URL}/api/game-state/join-with-invite?code=${code}&playerId=${playerId}`, {
      method: "POST",
    });

    if (!response.ok) throw new Error("Failed to join private game");
    return await response.text();
  },

  // ✅ Get Game Metadata
  getGameInfo: async (gameId) => {
    const response = await fetch(`${API_BASE_URL}/api/game-state/${gameId}`);
    if (!response.ok) throw new Error("Failed to get game info");
    return await response.json(); // Redis hash
  },

  // ✅ Get Lobby Player IDs
  getGamePlayers: async (gameId) => {
    const response = await fetch(`${API_BASE_URL}/api/game-state/${gameId}/players`);
    if (!response.ok) throw new Error("Failed to get players");
    return await response.json(); // Array of playerIds
  },

  // ✅ Remove Player From Game
  removePlayer: async (gameId, playerId) => {
    const response = await fetch(`${API_BASE_URL}/api/game-state/${gameId}/remove-player?playerId=${playerId}`, {
      method: "POST",
    });

    if (!response.ok) throw new Error("Failed to remove player");
    return await response.text();
  },

  // ✅ Delete Game
  deleteGame: async (gameId) => {
    const response = await fetch(`${API_BASE_URL}/api/game-state/${gameId}`, {
      method: "DELETE",
    });

    if (!response.ok) throw new Error("Failed to delete game");
    return await response.text();
  }
};
