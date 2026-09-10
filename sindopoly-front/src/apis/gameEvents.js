const outcomeAmount = amount => amount > 0 ? `+€${amount}` : `−€${Math.abs(amount)}`;

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

  let message = "";
  if (dice && landed) {
    message = `${actor} έριξε ${dice.dice} και βρέθηκε στο ${squareName(landed.squareId)}.`;
  } else if (moved) {
    message = `${actor} μετακινήθηκε στο ${squareName(moved.toPosition)}.`;
  }

  if (card?.card) {
    const label = card.card.title === "Chance" ? "Κάρτα Εντολής" :
      card.card.title === "Community Chest" ? "Κάρτα Απόφασης" : card.card.title;
    message += ` ${actor} τράβηξε ${label}: ${card.card.text}`;
    if (card.card.effect === "money") message += ` (${outcomeAmount(card.card.amount)})`;
    else if (card.card.effect === "transport" && moved) {
      message += ` Μετακινήθηκε στο ${squareName(moved.toPosition)}.`;
    }
  } else if (available) {
    message += ` Μπορεί να αγοράσει το ${squareName(available.squareId)} για €${available.amount}.`;
  } else if (purchased) {
    message = `${actor} αγόρασε το ${squareName(purchased.squareId)} για €${purchased.amount}.`;
  } else if (declined) {
    message = `${actor} δεν αγόρασε το ${squareName(declined.squareId)}.`;
  } else if (rent) {
    message += ` Πλήρωσε €${rent.amount} ενοίκιο στον ${playerName(rent.counterpartyPlayerId)}.`;
  } else if (tax) {
    message += ` Πλήρωσε φόρο €${tax.amount}.`;
  } else if (jailed) {
    message += ` Οδηγήθηκε στη ΦΥΛΑΚΗ.`;
  } else if (released) {
    message = `${actor} πλήρωσε €${released.amount} και βγήκε από τη ΦΥΛΑΚΗ.`;
  } else if (jailOffer) {
    message = `${actor} μπορεί να πληρώσει €${jailOffer.amount} για να βγει από τη ΦΥΛΑΚΗ.`;
  }
  if (moneyReceived) message += ` Πέρασε από την ΑΦΕΤΗΡΙΑ και πήρε €${moneyReceived.amount}.`;

  if (!message.trim()) return null;
  return { id: event.eventId, message: message.trim() };
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
