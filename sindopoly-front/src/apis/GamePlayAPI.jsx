import API_BASE_URL from "./apiConfig";
import { TurnAPI }   from "./TurnAPI";

/* helper: collect game + every player’s state in one shot */
const assembleBoard = async (gameId) => {
  /* 1️⃣ core game hash --------------------------------------------- */
  const gameRes = await fetch(`${API_BASE_URL}/api/game-state/${gameId}`);
  if (!gameRes.ok) throw new Error("Game state fetch failed");
  const gameHash = await gameRes.json();           // status, playerTurn …

  /* 2️⃣ player id list --------------------------------------------- */
  const listRes = await fetch(`${API_BASE_URL}/api/game-state/players/${gameId}`);
  if (!listRes.ok) throw new Error("Player list fetch failed");
  const ids = await listRes.json();                // Set<String>

  /* 3️⃣ fetch state of every player in parallel -------------------- */
  const states = await Promise.all(
    [...ids].map(async id => {
      const detailRes = await fetch(`${API_BASE_URL}/api/player-state/${id}`);
      if (!detailRes.ok) throw new Error("Player state fetch failed");
      const s = await detailRes.json();
      return { player_id : id, ...s };             // position, money, properties …
    })
  );

  /* 👇 Board.jsx expects an *array* that also carries some
   *    top-level fields on element [0].                           */
  if (states.length === 0) return [];
  return [
    { gameStatus : gameHash.status,
      playerTurn : gameHash.playerTurn,
      winner     : gameHash.winner,
      ...states[0] },                             // merge first element
    ...states.slice(1),
  ];
};

export const GamePlayAPI = {
  /* ──────────────────────────────────────────────────────────────── */
  /*   simple helpers that already existed                          */
  /* ──────────────────────────────────────────────────────────────── */

  getInGameStatus: async (playerId) => {
    const r = await fetch(`${API_BASE_URL}/api/game-state/in-game/${playerId}`);
    if (!r.ok) throw new Error("Failed to check game state");
    return r.json();
  },

  /* 🆕 single call used in Board.jsx – no dedicated /board route
   *    required, we build it here                                   */
  getBoard: assembleBoard,

  /* 🎲 full turn (dice → actions → pass) – the shape Board.jsx
   *    already expects (dice + actions)                             */
  playTurn: async (gameId, playerId) => {
    const dice    = await TurnAPI.rollDice (gameId, playerId);
    const actions = await TurnAPI.actions  (gameId, playerId);
    await TurnAPI.passTurn(gameId, playerId);
    return { ...dice, actions };
  },

  /* forced buy – endpoint already present in PlayerStateController  */
  buyProperty: async (gameId, playerId, squareId) => {
    const r = await fetch(
      `${API_BASE_URL}/api/player-state/${gameId}/${playerId}/buy?propertyId=${squareId}`,
      { method: "POST" }
    );
    if (!r.ok) throw new Error("Failed to buy");
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
};
