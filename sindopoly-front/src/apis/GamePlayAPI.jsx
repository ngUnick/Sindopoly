import API_BASE_URL from "./apiConfig";
import { TurnAPI }    from "./TurnAPI";

/* helper that builds the "board" blob Board.jsx expects */
const assembleBoard = async (gameId) => {
  /* 1️⃣ core game hash */
  const gameRes = await fetch(`${API_BASE_URL}/api/game-state/${gameId}`);
  if (!gameRes.ok) throw new Error("Game state fetch failed");
  const gameHash = await gameRes.json();           // status, playerTurn …

  /* 2️⃣ player-id list */
  const listRes = await fetch(
    `${API_BASE_URL}/api/game-state/players/${gameId}`
  );
  if (!listRes.ok) throw new Error("Player list fetch failed");
  const ids = await listRes.json();                // Set<String>

  /* 3️⃣ each player’s redis hash */
  const states = await Promise.all(
    [...ids].map(async (id) => {
      const r = await fetch(`${API_BASE_URL}/api/player-state/${id}`);
      if (!r.ok) throw new Error("Player state fetch failed");
      const s = await r.json();
      return { player_id: id, ...s };
    })
  );

  if (states.length === 0) return [];
  /* Board.jsx needs game-level fields merged into element[0] */
  return [
    {
      gameStatus: gameHash.status,
      playerTurn: gameHash.playerTurn,
      winner:     gameHash.winner,
      ...states[0],
    },
    ...states.slice(1),
  ];
};

export const GamePlayAPI = {
  /* ─────────────────────────────────────────────────────────── */
  /*  small helpers already used by the React code              */
  /* ─────────────────────────────────────────────────────────── */
  getInGameStatus: async (playerId) => {
    const r = await fetch(
      `${API_BASE_URL}/api/game-state/in-game/${playerId}`
    );
    if (!r.ok) throw new Error("Failed to check game state");
    return r.json();
  },

  /* current board snapshot */
  getBoard: assembleBoard,

  /* full turn in one request – the backend returns dice + optional */
  playTurn: (gameId, playerId) => TurnAPI.playTurn(gameId, playerId),

  /* follow-ups for optional actions … */
  buyProperty: async (gameId, playerId, squareId) => {
    const r = await fetch(
      `${API_BASE_URL}/api/player-state/${gameId}/${playerId}/buy?propertyId=${squareId}`,
      { method: "POST" }
    );
    if (!r.ok) throw new Error("Purchase failed");
    return r.json();
  },

  payJailFine: async (gameId, playerId) => {
    const r = await fetch(
      `${API_BASE_URL}/api/player-state/${gameId}/${playerId}/pay-jail`,
      { method: "POST" }
    );
    if (!r.ok) throw new Error("Jail payment failed");
    return r.json();
  },

  /* player declines a buy / pay-jail offer */
  passTurn: (gameId, playerId) => TurnAPI.passTurn(gameId, playerId),
};
