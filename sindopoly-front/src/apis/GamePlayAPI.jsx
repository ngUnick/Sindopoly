import API_BASE_URL from "./apiConfig";
import { TurnAPI }    from "./TurnAPI";

/** 
 * Helper that builds the "board" blob Board.jsx expects.
 * Now backed by your new /players-detailed API.
 */
async function assembleBoard(gameId) {
  // 1) fetch the game-level bits
  const gameRes = await fetch(`${API_BASE_URL}/api/game-state/${gameId}`);
  if (!gameRes.ok) throw new Error("Game state fetch failed");
  const gameHash = await gameRes.json(); 

  // 2) fetch the full per-player array
  const playersRes = await fetch(
    `${API_BASE_URL}/api/game-state/players-detailed/${gameId}`
  );
  if (!playersRes.ok) throw new Error("Players fetch failed");
  const players = await playersRes.json();

  if (!players.length) return [];

  // 3) normalize every player
  const normalized = players.map(p => ({
    player_id: p.player_id ?? p.id,        // your DTO was using `id`
    nickname:  p.nickname,                 // or whatever your field is
    position:  p.position,                 // ensure your backend is returning this
    money:     p.money,                    // ensure your backend is returning this
    properties: p.properties               // if you need them
  }));

  // 4) merge game-level into the first object
  return [
    {
      ...normalized[0],
      gameStatus: gameHash.status,
      playerTurn: gameHash.playerTurn,
      winner:     gameHash.winner,
    },
    ...normalized.slice(1)
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

  /** roll & move – returns parsed JSON or throws with server error */
  playTurn: async (gameId, playerId) => {
    // this will throw if res.ok===false, with the server’s `error` message
    const data = await TurnAPI.playTurn(gameId, playerId);
    return data;
  },

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
