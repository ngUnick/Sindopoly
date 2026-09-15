import {
  GAME_EVENT_FACT_TYPES,
  formatGameEventFact,
} from "../features/game/content/el.js";

/** Builds one non-actionable Greek observer notification per committed transition. */
export function observerNotification(event, viewerPlayerId, playerName, squareName) {
  const actorId = event?.payload?.actorPlayerId;
  if (actorId == null || String(actorId) === String(viewerPlayerId)) return null;
  const details = event.payload.details ?? [];
  const byType = type => details.find(detail => detail.type === type);
  const actor = playerName(actorId);
  const dice = byType("DICE_ROLLED");
  const landed = byType("LANDED_ON_TILE");
  const moved = byType("PLAYER_MOVED");
  const card = byType("CARD_DRAWN");
  const available = byType("PROPERTY_AVAILABLE");
  const purchased = byType("PROPERTY_PURCHASED");
  const declined = byType("PROPERTY_DECLINED");
  const rent = byType("RENT_PAID");
  const tax = byType("TAX_PAID");
  const jailed = byType("PLAYER_JAILED");
  const released = byType("PLAYER_RELEASED");
  const jailOffer = byType("JAIL_EXIT_AVAILABLE");
  const moneyReceived = byType("MONEY_RECEIVED");
  const turnChanged = byType("TURN_CHANGED");

  const messages = [];
  const addFact = fact => {
    const content = formatGameEventFact(fact);
    if (content) messages.push(content);
  };

  if (event.payload.reason === "TURN_TIMED_OUT") {
    addFact({ type: GAME_EVENT_FACT_TYPES.TIMEOUT, playerName: actor });
  } else if (dice) {
    addFact({ type: GAME_EVENT_FACT_TYPES.ROLL, playerName: actor, total: dice.dice });
  }
  if (landed) {
    addFact({
      type: GAME_EVENT_FACT_TYPES.LANDING,
      playerName: actor,
      squareName: squareName(landed.squareId),
    });
  } else if (moved) {
    addFact({
      type: GAME_EVENT_FACT_TYPES.LANDING,
      playerName: actor,
      squareName: squareName(moved.toPosition),
    });
  }

  if (card?.card) {
    addFact({
      type: GAME_EVENT_FACT_TYPES.CARD,
      playerName: actor,
      category: card.card.title,
      cardText: card.card.text,
      amount: card.card.effect === "money" ? card.card.amount : undefined,
      destinationName: card.card.effect === "transport" && moved
        ? squareName(moved.toPosition) : undefined,
    });
  } else if (available) {
    addFact({
      type: GAME_EVENT_FACT_TYPES.PURCHASE_AVAILABLE,
      playerName: actor,
      squareName: squareName(available.squareId),
      amount: available.amount,
    });
  } else if (purchased) {
    addFact({
      type: GAME_EVENT_FACT_TYPES.PURCHASE,
      playerName: actor,
      squareName: squareName(purchased.squareId),
      amount: purchased.amount,
    });
  } else if (declined) {
    addFact({
      type: GAME_EVENT_FACT_TYPES.PURCHASE_DECLINED,
      playerName: actor,
      squareName: squareName(declined.squareId),
    });
  } else if (rent) {
    addFact({
      type: GAME_EVENT_FACT_TYPES.RENT,
      playerName: actor,
      amount: rent.amount,
      counterpartyName: playerName(rent.counterpartyPlayerId),
    });
  } else if (tax) {
    addFact({ type: GAME_EVENT_FACT_TYPES.TAX, playerName: actor, amount: tax.amount });
  } else if (jailed) {
    addFact({ type: GAME_EVENT_FACT_TYPES.JAIL, playerName: actor });
  } else if (released) {
    addFact({
      type: GAME_EVENT_FACT_TYPES.JAIL_RELEASED,
      playerName: actor,
      amount: released.amount,
    });
  } else if (jailOffer) {
    addFact({
      type: GAME_EVENT_FACT_TYPES.JAIL_EXIT_AVAILABLE,
      playerName: actor,
      amount: jailOffer.amount,
    });
  }
  if (moneyReceived) {
    addFact({
      type: GAME_EVENT_FACT_TYPES.START_REWARD,
      playerName: actor,
      amount: moneyReceived.amount,
    });
  }
  if (messages.length === 0 && turnChanged) {
    addFact({
      type: GAME_EVENT_FACT_TYPES.TURN_CHANGE,
      playerName: playerName(turnChanged.nextPlayerId),
    });
  }

  if (messages.length === 0) return null;
  return { id: event.eventId, message: messages.join(" ") };
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
