import API_BASE_URL from "./apiConfig";
import { apiFetch } from "./apiClient";
import { acceptGameSnapshot, observeGameSnapshot } from "./gameCommandState";
import { GameAPI } from "./GameAPI";

async function getAcceptedSnapshot(gameId) {
  const snapshot = await GameAPI.getRealtimeSnapshot(gameId);
  if (!acceptGameSnapshot(gameId, snapshot)) return null;
  return snapshot;
}

/** Retained compatibility adapter for Board consumers not normalized yet. */
async function assembleBoard(gameId) {
  const snapshot = await getAcceptedSnapshot(gameId);
  return snapshot ? boardFromSnapshot(snapshot) : null;
}

export function boardFromSnapshot(snapshot) {
  const players = snapshot.players ?? [];
  if (!players.length) return [];

  // 3) normalize
  const normalized = players.map(p => ({
    player_id: p.playerId ?? p.player_id ?? p.id,
    nickname:  p.nickname,
    position:  p.position,
    money:     p.money,
    properties: JSON.stringify(p.properties ?? []),
  }));

  // 4) merge game‐level into the first slot
  return [
    {
      ...normalized[0],
      gameStatus: snapshot.status,
      playerTurn: snapshot.playerTurn,
      winner:     snapshot.winner,
      stateVersion: snapshot.stateVersion,
      optionalAction: snapshot.optionalAction ? JSON.stringify(snapshot.optionalAction) : null,
    },
    ...normalized.slice(1),
  ];
}

export const GamePlayAPI = {
  /** snapshot of board + game */
  getBoard: assembleBoard,
  getSnapshot: getAcceptedSnapshot,


  getInGameStatus: async playerId => {
    const r = await apiFetch(
      `${API_BASE_URL}/api/game-state/in-game/${playerId}`
    );
    if (!r.ok) throw new Error("Failed to check game state");
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
