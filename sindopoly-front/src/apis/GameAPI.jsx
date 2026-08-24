import API_BASE_URL from "./apiConfig";
import { apiFetch } from "./apiClient";

export const GameAPI = {
  // ✅ Create Game
  createGame: async (visibility) => {
    const payload = {
      ownerId: parseInt(localStorage.getItem("player_id")),
      visibility
    };

    const response = await apiFetch(`${API_BASE_URL}/api/game-state/create`, {
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
  startGame: async (gameId, playerId) => {
    const res = await apiFetch(
      `${API_BASE_URL}/api/game-state/${gameId}/start?playerId=${playerId}`,
      { method: "POST" }
    );

    if (!res.ok) throw new Error(await res.text() || "Failed to start");
    return await res.json();          // → { status:"inProgress", gameId: 9 }
  },



  // ✅ Get Public Lobby Games
  getPublicLobbyGames: async () => {
    const res = await apiFetch("http://localhost:8080/api/game-state/public-lobby");
    if (!res.ok) throw new Error("Failed to fetch public games");
    return await res.json();
  },

  // ✅ Join Public Game
  joinGame: async (gameId) => {
    const playerId = parseInt(localStorage.getItem("player_id"));
    const response = await apiFetch(`${API_BASE_URL}/api/game-state/add/${gameId}/${playerId}`, {
      method: "POST",
    });

    if (!response.ok) throw new Error("Failed to join game");
    return await response.text();
  },

  // ✅ Join Private Game by Code
  joinWithInvite: async (inviteCode) => {
    const playerId = localStorage.getItem("player_id");
    const res = await apiFetch(
      `${API_BASE_URL}/api/game-state/join-with-invite?inviteCode=${inviteCode}&playerId=${playerId}`,
      { method: "POST" }
    );
    if (!res.ok) throw new Error("Failed to join private game");

    const text = await res.text();        // could be "4"  or  {"gameId":"4"}
    try {
      return JSON.parse(text);            // → {gameId:"4"}
    } catch {
      return { gameId: text.trim() };     // → {gameId:"4"}
    }
  },



  // ✅ Get Game Metadata
  getGameInfo: async (gameId) => {
    const response = await apiFetch(`${API_BASE_URL}/api/game-state/${gameId}`);
    if (!response.ok) throw new Error("Failed to get game info");
    return await response.json(); // Redis hash
  },

  // ✅ Get Lobby Player IDs
  getGamePlayers: async (gameId) => {
    const response = await apiFetch(`${API_BASE_URL}/api/game-state/${gameId}/players`);
    if (!response.ok) throw new Error("Failed to get players");
    return await response.json(); // Array of playerIds
  },

  // ✅ Remove Player From Game
  removePlayer: async (gameId, playerId) => {
    const response = await apiFetch(`${API_BASE_URL}/api/game-state/${gameId}/remove-player?playerId=${playerId}`, {
      method: "POST",
    });

    if (!response.ok) throw new Error("Failed to remove player");
    return await response.text();
  },

  // Host remains the authenticated actor; targetPlayerId selects the member to remove.
  kickPlayer: async (gameId, targetPlayerId) => {
    const response = await apiFetch(
      `${API_BASE_URL}/api/game-state/${gameId}/players/${targetPlayerId}/kick`,
      { method: "POST" }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "Failed to remove player");
    }
    return await response.text();
  }
};
