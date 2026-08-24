import API_BASE_URL from "./apiConfig";
import { apiFetch } from "./apiClient";
import { commandHeaders, observeGameSnapshot, readCommandResponse } from "./gameCommandState";

export const GameAPI = {
  // ✅ Create Game
  createGame: async (visibility) => {
    const payload = {
      ownerId: parseInt(localStorage.getItem("player_id")),
      visibility
    };

    const response = await apiFetch(`${API_BASE_URL}/api/game-state/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...commandHeaders(payload.ownerId, -1) },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Create game failed: ${errText}`);
    }

    return await readCommandResponse(response, payload.ownerId);
  },

  // ✅ Start Game
  startGame: async (gameId, playerId) => {
    const res = await apiFetch(
      `${API_BASE_URL}/api/game-state/${gameId}/start?playerId=${playerId}`,
      { method: "POST", headers: commandHeaders(gameId) }
    );

    return await readCommandResponse(res, gameId);
  },



  // ✅ Get Public Lobby Games
  getPublicLobbyGames: async () => {
    const res = await apiFetch("http://localhost:8080/api/game-state/public-lobby");
    if (!res.ok) throw new Error("Failed to fetch public games");
    const games = await res.json();
    games.forEach(game => observeGameSnapshot(game.gameId, game));
    return games;
  },

  // ✅ Join Public Game
  joinGame: async (gameId, stateVersion) => {
    const playerId = parseInt(localStorage.getItem("player_id"));
    const response = await apiFetch(`${API_BASE_URL}/api/game-state/add/${gameId}/${playerId}`, {
      method: "POST",
      headers: commandHeaders(gameId, Number(stateVersion)),
    });

    return await readCommandResponse(response, gameId);
  },

  // ✅ Join Private Game by Code
  joinWithInvite: async (inviteCode) => {
    const playerId = localStorage.getItem("player_id");
    const metadataRes = await apiFetch(
      `${API_BASE_URL}/api/game-state/invite-metadata?inviteCode=${encodeURIComponent(inviteCode)}`
    );
    if (!metadataRes.ok) throw new Error("Invalid or expired invite code");
    const metadata = await metadataRes.json();
    observeGameSnapshot(metadata.gameId, metadata);
    const res = await apiFetch(
      `${API_BASE_URL}/api/game-state/join-with-invite?inviteCode=${inviteCode}&playerId=${playerId}`,
      { method: "POST", headers: commandHeaders(metadata.gameId, metadata.stateVersion) }
    );
    return await readCommandResponse(res, metadata.gameId);
  },



  // ✅ Get Game Metadata
  getGameInfo: async (gameId) => {
    const response = await apiFetch(`${API_BASE_URL}/api/game-state/${gameId}`);
    if (!response.ok) throw new Error("Failed to get game info");
    const game = await response.json();
    observeGameSnapshot(gameId, game);
    return game;
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
      headers: commandHeaders(gameId),
    });

    return await readCommandResponse(response, gameId);
  },

  // Host remains the authenticated actor; targetPlayerId selects the member to remove.
  kickPlayer: async (gameId, targetPlayerId) => {
    const response = await apiFetch(
      `${API_BASE_URL}/api/game-state/${gameId}/players/${targetPlayerId}/kick`,
      { method: "POST", headers: commandHeaders(gameId) }
    );

    return await readCommandResponse(response, gameId);
  }
};
