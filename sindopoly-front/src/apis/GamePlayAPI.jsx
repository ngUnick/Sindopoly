import API_BASE_URL from "./apiConfig";
import { TurnAPI }    from "./TurnAPI";

/** 
 * Helper that builds the "board" blob Board.jsx expects.
 * Now backed by your new /players-detailed API.
 */
async function assembleBoard(gameId) {
  // 1️⃣ fetch game‐level hash
  const gameRes = await fetch(`${API_BASE_URL}/api/game-state/${gameId}`);
  if (!gameRes.ok) throw new Error("Game state fetch failed");
  const gameHash = await gameRes.json(); // { status, playerTurn, winner, … }

  // 2️⃣ fetch the full per-player array in one shot
  const playersRes = await fetch(
    `${API_BASE_URL}/api/game-state/players-detailed/${gameId}`
  );
  if (!playersRes.ok) throw new Error("Players fetch failed");
  const players = await playersRes.json(); // [ { player_id, nickname, position, money, … }, … ]

  if (!players.length) return [];

  // 3️⃣ merge game‐level fields into the first element
  return [
    {
      ...players[0],
      gameStatus: gameHash.status,
      playerTurn: gameHash.playerTurn,
      winner:     gameHash.winner
    },
    ...players.slice(1)
  ];
}

export const GamePlayAPI = {
  /** Is this player already in an active game? */
  getInGameStatus: async (playerId) => {
    const r = await fetch(
      `${API_BASE_URL}/api/game-state/in-game/${playerId}`
    );
    if (!r.ok) throw new Error("Failed to check game state");
    return r.json();
  },

  /** snapshot of the entire board+game */
  getBoard: assembleBoard,

  /** roll & move – returns dice, optional payload, etc. */
  playTurn: (gameId, playerId) =>
    TurnAPI.playTurn(gameId, playerId).then(r => {
      if (!r.ok) throw new Error("Turn failed");
      return r.json();
    }),

  /** buy a property when offered */
  buyProperty: async (gameId, playerId, propertyId) => {
    const r = await fetch(
      `${API_BASE_URL}/api/player-state/${gameId}/${playerId}/buy?propertyId=${propertyId}`,
      { method: "POST" }
    );
    if (!r.ok) throw new Error("Purchase failed");
    return r.json();
  },

  /** pay your way out of jail */
  payJailFine: async (gameId, playerId) => {
    const r = await fetch(
      `${API_BASE_URL}/api/player-state/${gameId}/${playerId}/pay-jail`,
      { method: "POST" }
    );
    if (!r.ok) throw new Error("Jail payment failed");
    return r.json();
  },

  /** skip / decline the optional action */
  passOptional: async (gameId, playerId) => {
    const r = await fetch(
      `${API_BASE_URL}/api/turn/${gameId}/${playerId}/pass`,
      { method: "POST" }
    );
    if (!r.ok) throw new Error("Pass turn failed");
    return r.json();
  },
};

export async function getGameState(gameId) {
  const r = await fetch(`${API_BASE_URL}/api/game-state/${gameId}`);
  if (!r.ok) throw new Error("Game state fetch failed");
  return r.json();  // { status, playerTurn, winner, … }
}

export async function getPlayersDetailed(gameId) {
  const r = await fetch(
    `${API_BASE_URL}/api/game-state/players-detailed/${gameId}`
  );
  if (!r.ok) throw new Error("Players fetch failed");
  return r.json();  // [ { player_id, nickname, position, money, … }, … ]
}
