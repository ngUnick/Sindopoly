import API_BASE_URL from "./apiConfig";
import { apiFetch } from "./apiClient";
import { commandHeaders, observeGameSnapshot, readCommandResponse } from "./gameCommandState";
import {
  decodeArrayPayload, decodeGameSnapshot, decodeInviteMetadata, decodeRecordPayload,
} from "./transportDecoders";
import { readJsonResponse } from "./transportError";
import { buildStartGameRequest } from "./gameStartRequest.js";

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

    return await readCommandResponse(response, payload.ownerId);
  },

  // ✅ Start Game
  startGame: async (gameId, playerId, stateVersion) => {
    const request = buildStartGameRequest(gameId, playerId, stateVersion);
    const res = await apiFetch(
      `${API_BASE_URL}${request.path}`,
      request.options
    );

    return await readCommandResponse(res, gameId);
  },



  // ✅ Get Public Lobby Games
  getPublicLobbyGames: async () => {
    const res = await apiFetch("/api/game-state/public-lobby");
    const games = await readJsonResponse(res, { decoder: decodeArrayPayload });
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
    const metadata = await readJsonResponse(metadataRes, { decoder: decodeInviteMetadata });
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
    const game = await readJsonResponse(response, { decoder: decodeRecordPayload });
    observeGameSnapshot(gameId, game);
    return game;
  },

  getRealtimeSnapshot: async (gameId) => {
    const response = await apiFetch(`${API_BASE_URL}/api/game-state/${gameId}/snapshot`);
    return readJsonResponse(response, { decoder: decodeGameSnapshot });
  },

  // ✅ Get Lobby Player IDs
  getGamePlayers: async (gameId) => {
    const response = await apiFetch(`${API_BASE_URL}/api/game-state/${gameId}/players`);
    return readJsonResponse(response, { decoder: decodeArrayPayload });
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
