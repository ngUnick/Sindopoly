import { buildEventViewModel } from "../features/game/presentation/eventViewModel.js";

/** Builds one non-actionable Greek observer notification per committed transition. */
export function observerNotification(event, viewerPlayerId, playerName, squareName) {
  const actorId = event?.payload?.actorPlayerId;
  if (actorId == null || String(actorId) === String(viewerPlayerId)) return null;
  const model = buildEventViewModel({ event, viewerPlayerId, playerName, squareName });
  return model ? { id: model.id, message: model.text } : null;
}

/** Keeps rapid events ordered and bounded; duplicate STOMP envelopes are ignored. */
export function enqueueNotification(queue, notification, limit = 8) {
  if (!notification || queue.some(item => item.id === notification.id)) return queue;
  // Preserve the currently displayed item and FIFO order; overflow drops newest arrivals.
  return queue.length >= limit ? queue : [...queue, notification];
}

/** Keeps an assigned visual pawn stable even if a later snapshot changes row ordering. */
export function assignPawnRefsByPlayerId(playerRows, pawnRefs, previous = new Map()) {
  const next = new Map();
  const available = new Set(pawnRefs);
  for (const row of playerRows) {
    const playerKey = String(row.player_id);
    const existing = previous.get(playerKey);
    if (existing && available.has(existing)) {
      next.set(playerKey, existing);
      available.delete(existing);
    }
  }
  // Initial/reconnect allocation must not inherit an incidental snapshot render order.
  const unassignedRows = playerRows
    .filter(row => !next.has(String(row.player_id)))
    .sort((left, right) => Number(left.player_id) - Number(right.player_id));
  for (const row of unassignedRows) {
    const playerKey = String(row.player_id);
    const pawnRef = available.values().next().value;
    if (!pawnRef) break;
    next.set(playerKey, pawnRef);
    available.delete(pawnRef);
  }
  return next;
}

export function pawnRefForPlayer(playerId, pawnRefsByPlayerId) {
  return pawnRefsByPlayerId.get(String(playerId)) ?? null;
}

/** Dispatches movement through the immutable player-to-pawn association. */
export function movePawnForPlayer(playerId, pawnRefsByPlayerId, position, movePawn) {
  const pawn = pawnRefForPlayer(playerId, pawnRefsByPlayerId)?.current;
  if (!pawn) return false;
  movePawn(pawn, position);
  return true;
}
