
import API_BASE_URL from "./apiConfig";

export const TurnAPI = {
  async playTurn(gameId, playerId) {
    const res = await fetch(`${API_BASE_URL}/api/turn/${gameId}/${playerId}`, {
      method: "POST",
    });
    const body = await res.json();
    if (!res.ok) {
      // bubble the server’s error message
      throw new Error(body.error || "Turn failed");
    }
    return body;
  },
  async passTurn(gameId, playerId) {
    const res = await fetch(`${API_BASE_URL}/api/turn/${gameId}/${playerId}/pass`, {
      method: "POST",
    });
    const body = await res.json();
    if (!res.ok) {
      throw new Error(body.error || "Pass turn failed");
    }
    return body;
  },
};