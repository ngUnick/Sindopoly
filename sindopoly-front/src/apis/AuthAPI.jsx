import API_BASE_URL from "./apiConfig";
import { apiFetch, clearCsrfToken } from "./apiClient";
import { readCurrentGameResponse } from "./currentGame";
import { decodeCurrentPlayer, decodeRecordPayload } from "./transportDecoders";
import { readJsonResponse, requireSuccessfulResponse } from "./transportError";

export const AuthAPI = {
  getPlayerInfo: async (playerId) => {
    const res = await apiFetch(`${API_BASE_URL}/api/player-state/${playerId}`);
    return readJsonResponse(res, { decoder: decodeRecordPayload });
  },

  getCurrentPlayer: async () => {
    const res = await apiFetch(`${API_BASE_URL}/api/session/me`);
    return readJsonResponse(res, { decoder: decodeCurrentPlayer });
  },

  getCurrentGame: async () => {
    const res = await apiFetch(`${API_BASE_URL}/api/session/current-game`);
    return readCurrentGameResponse(res);
  },

  logout: async () => {
    const res = await apiFetch(`${API_BASE_URL}/api/session/logout`, {
      method: "POST",
    });
    clearCsrfToken();
    await requireSuccessfulResponse(res);
  },
};
