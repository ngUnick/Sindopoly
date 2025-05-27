import API_BASE_URL from "./apiConfig";

export const AuthAPI = {
  getPlayerInfo: async (playerId) => {
    const res = await fetch(`${API_BASE_URL}/api/player-state/${playerId}`);
    if (!res.ok) throw new Error("Player not found");
    return await res.json(); // { position: 0, money: 1500, ... }
  }
};
