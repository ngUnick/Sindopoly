import API_BASE_URL from "./apiConfig";
import { apiFetch, clearCsrfToken } from "./apiClient";
import { readCurrentGameResponse } from "./currentGame";

export const AuthAPI = {
  getPlayerInfo: async (playerId) => {
    const res = await apiFetch(`${API_BASE_URL}/api/player-state/${playerId}`);
    if (!res.ok) throw new Error("Player not found");
    return await res.json(); // { position: 0, money: 1500, ... }
  },

  getCurrentPlayer: async () => {
    const res = await apiFetch(`${API_BASE_URL}/api/session/me`);
    if (!res.ok) throw new Error("Authenticated session not found");
    return await res.json();
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
    if (!res.ok) throw new Error("Logout failed");
  },
};
