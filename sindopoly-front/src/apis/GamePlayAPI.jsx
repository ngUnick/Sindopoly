import API_BASE_URL from "./apiConfig";
import { TurnAPI }  from "./TurnAPI";
import { apiFetch } from "./apiClient";
import { observeGameSnapshot } from "./gameCommandState";

/**
 * Helper that builds the "board" blob Board.jsx expects.
 * Uses your existing /players-detailed endpoint.
 */
async function assembleBoard(gameId) {
  // 1) fetch game‐level fields
  const gameRes = await apiFetch(`${API_BASE_URL}/api/game-state/${gameId}`);
  if (!gameRes.ok) throw new Error("Game state fetch failed");
  const gameHash = await gameRes.json();
  observeGameSnapshot(gameId, gameHash);

  // 2) fetch per‐player list
  const playersRes = await apiFetch(
    `${API_BASE_URL}/api/game-state/players-detailed/${gameId}`
  );
  if (!playersRes.ok) throw new Error("Players fetch failed");
  const players = await playersRes.json();
  if (!players.length) return [];

  // 3) normalize
  const normalized = players.map(p => ({
    player_id: p.player_id ?? p.id,
    nickname:  p.nickname,
    position:  p.position,
    money:     p.money,
    properties: p.properties,
  }));

  // 4) merge game‐level into the first slot
  return [
    {
      ...normalized[0],
      gameStatus: gameHash.status,
      playerTurn: gameHash.playerTurn,
      winner:     gameHash.winner,
      stateVersion: gameHash.stateVersion,
      optionalAction: gameHash.optionalAction,
    },
    ...normalized.slice(1),
  ];
}

export const GamePlayAPI = {
  /** snapshot of board + game */
  getBoard: assembleBoard,


  /****** TWO-STEP TURN ******/

  // /** Step 1: roll & peek */
  // playTurn: async (gameId, playerId) => {
  //   const r = await TurnAPI.throwDice(gameId, playerId);
  //   if (!r) throw new Error("Roll failed");
  //   return r;
  // },

  // /** Step 2: apply the modal decision */
  // playAction: async (gameId, playerId, action, squareId = null) => {
  //   const r = await TurnAPI.doAction(gameId, playerId, action, squareId);
  //   if (!r) throw new Error("Action failed");
  //   return r;
  // },

  // /****** legacy, you can delete these once React is updated ******/
  // playTurn: async (gameId, playerId) => {
  //   const data = await TurnAPI.throwDice(gameId, playerId);
  //   return data;
  // },
  // passOptional: async (gameId, playerId) => {
  //   return await TurnAPI.doAction(gameId, playerId, "pass", null);
  // },

  /****** other APIs unchanged ******/
  getInGameStatus: async playerId => {
    const r = await apiFetch(
      `${API_BASE_URL}/api/game-state/in-game/${playerId}`
    );
    if (!r.ok) throw new Error("Failed to check game state");
    return r.json();
  },

  buyProperty: async (gameId, playerId, propertyId) => {
    const r = await apiFetch(
      `${API_BASE_URL}/api/player-state/${gameId}/${playerId}/buy?propertyId=${propertyId}`,
      { method: "POST" }
    );
    if (!r.ok) throw new Error("Purchase failed");
    return r.json();
  },

  payJailFine: async (gameId, playerId) => {
    const r = await apiFetch(
      `${API_BASE_URL}/api/player-state/${gameId}/${playerId}/pay-jail`,
      { method: "POST" }
    );
    if (!r.ok) throw new Error("Jail payment failed");
    return r.json();
  },
};

export async function getGameState(gameId) {
  const r = await apiFetch(`${API_BASE_URL}/api/game-state/${gameId}`);
  if (!r.ok) throw new Error("Game state fetch failed");
  const game = await r.json();
  observeGameSnapshot(gameId, game);
  return game;
}

export async function getPlayersDetailed(gameId) {
  const r = await apiFetch(
    `${API_BASE_URL}/api/game-state/players-detailed/${gameId}`
  );
  if (!r.ok) throw new Error("Players fetch failed");
  return r.json();
}
