// src/apis/StatisticsAPI.js
import API_BASE_URL from "./apiConfig";

export const StatisticsAPI = {
  /* -----------------------------------------------------------
   *  GET /api/statistics/leaderboard
   *  → [{ nickname:"Bob", totalWins:3, … }, …]
   * ----------------------------------------------------------- */
  getLeaderboard: async () => {
    const res = await fetch(
      `${API_BASE_URL}/api/statistics/leaderboard`,
      { method: "GET" }
    );
    if (!res.ok) throw new Error("Failed to fetch leaderboard");
    return await res.json();
  },

  /* -----------------------------------------------------------
   *  GET /api/statistics/user/{playerId}
   *  → { nickname:"Bob", totalWins:3, … }
   * ----------------------------------------------------------- */
  getUserStats: async (playerId) => {
    const res = await fetch(
      `${API_BASE_URL}/api/statistics/user/${playerId}`,
      { method: "GET" }
    );
    if (!res.ok) throw new Error("Failed to fetch user stats");
    return await res.json();
  },
};
