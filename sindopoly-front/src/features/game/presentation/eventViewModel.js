import {
  GAMEPLAY_FEEDBACK_CONTENT,
  GAME_EVENT_FACT_TYPES,
  formatDiceResult,
  formatGameEventFact,
} from "../content/el.js";
import { buildDicePresentationModel } from "./dicePresentationModel.js";
import {
  GAMEPLAY_FEEDBACK_SURFACES,
  buildGameplayFeedback,
} from "./gameplayFeedbackModel.js";

/** Projects one validated event; history ownership and ordering remain outside this module. */
export function buildEventViewModel({
  event,
  viewerPlayerId,
  playerName,
  squareName,
} = {}) {
  if (!isPresentableEvent(event) || typeof playerName !== "function") return null;
  const actorPlayerId = event.payload.actorPlayerId;
  const actorName = actorPlayerId == null ? null : playerName(actorPlayerId);
  if (actorPlayerId != null && !hasText(actorName)) return null;

  const details = event.payload.details;
  const byType = type => details.find(detail => detail.type === type);
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
  const textParts = [];
  let emphasis = "neutral";

  const addFact = fact => {
    const text = formatGameEventFact(fact);
    if (text) textParts.push(text);
  };

  if (event.payload.reason === "TURN_TIMED_OUT") {
    addFact({ type: GAME_EVENT_FACT_TYPES.TIMEOUT, playerName: actorName });
    emphasis = "warning";
  } else if (dice) {
    const text = formatDiceResult(
      dice.dice,
      actorPlayerId === viewerPlayerId ? null : actorName,
    );
    if (text) textParts.push(text);
  }

  const destinationId = landed?.squareId ?? moved?.toPosition;
  if (destinationId != null && typeof squareName === "function") {
    addFact({
      type: GAME_EVENT_FACT_TYPES.LANDING,
      playerName: actorName,
      squareName: squareName(destinationId),
    });
  }

  if (card?.card) {
    addFact({
      type: GAME_EVENT_FACT_TYPES.CARD,
      playerName: actorName,
      category: card.card.title,
      cardText: card.card.text,
      amount: card.card.effect === "money" ? card.card.amount : undefined,
      destinationName: card.card.effect === "transport" && moved && typeof squareName === "function"
        ? squareName(moved.toPosition) : undefined,
    });
    emphasis = "highlight";
  } else if (available && typeof squareName === "function") {
    addFact({
      type: GAME_EVENT_FACT_TYPES.PURCHASE_AVAILABLE,
      playerName: actorName,
      squareName: squareName(available.squareId),
      amount: available.amount,
    });
  } else if (purchased && typeof squareName === "function") {
    addFact({
      type: GAME_EVENT_FACT_TYPES.PURCHASE,
      playerName: actorName,
      squareName: squareName(purchased.squareId),
      amount: purchased.amount,
    });
    emphasis = "positive";
  } else if (declined && typeof squareName === "function") {
    addFact({
      type: GAME_EVENT_FACT_TYPES.PURCHASE_DECLINED,
      playerName: actorName,
      squareName: squareName(declined.squareId),
    });
  } else if (rent) {
    addFact({
      type: GAME_EVENT_FACT_TYPES.RENT,
      playerName: actorName,
      amount: rent.amount,
      counterpartyName: playerName(rent.counterpartyPlayerId),
    });
    emphasis = "negative";
  } else if (tax) {
    addFact({ type: GAME_EVENT_FACT_TYPES.TAX, playerName: actorName, amount: tax.amount });
    emphasis = "negative";
  } else if (jailed) {
    addFact({ type: GAME_EVENT_FACT_TYPES.JAIL, playerName: actorName });
    emphasis = "warning";
  } else if (released) {
    addFact({
      type: GAME_EVENT_FACT_TYPES.JAIL_RELEASED,
      playerName: actorName,
      amount: released.amount,
    });
  } else if (jailOffer) {
    addFact({
      type: GAME_EVENT_FACT_TYPES.JAIL_EXIT_AVAILABLE,
      playerName: actorName,
      amount: jailOffer.amount,
    });
  }

  if (moneyReceived) {
    addFact({
      type: GAME_EVENT_FACT_TYPES.START_REWARD,
      playerName: actorName,
      amount: moneyReceived.amount,
    });
    if (emphasis === "neutral") emphasis = "positive";
  }
  if (textParts.length === 0 && turnChanged) {
    addFact({
      type: GAME_EVENT_FACT_TYPES.TURN_CHANGE,
      playerName: playerName(turnChanged.nextPlayerId),
    });
  }

  if (textParts.length === 0) return null;
  const text = textParts.join(" ");
  const feedback = buildEventFeedback({
    event,
    actorName,
    text,
    emphasis,
    card,
    available,
    purchased,
    declined,
    rent,
    tax,
    jailed,
    released,
    jailOffer,
    moneyReceived,
    destinationId,
    playerName,
    squareName,
  });
  return Object.freeze({
    id: event.eventId,
    stateVersion: event.stateVersion,
    occurredAt: event.occurredAt,
    kind: event.payload.reason,
    actorPlayerId,
    text,
    emphasis,
    feedback,
    dice: dice == null ? null : buildDicePresentationModel({
      ...dice,
      presentationId: event.stateVersion,
    }),
  });
}

function buildEventFeedback({
  event,
  actorName,
  text,
  emphasis,
  card,
  available,
  purchased,
  declined,
  rent,
  tax,
  jailed,
  released,
  jailOffer,
  moneyReceived,
  destinationId,
  playerName,
  squareName,
}) {
  const contextual = (kind, title, body = text, tone = emphasis) => buildGameplayFeedback({
    kind,
    title,
    body,
    tone,
    surface: GAMEPLAY_FEEDBACK_SURFACES.CONTEXTUAL,
  });
  const toast = kind => buildGameplayFeedback({ kind, body: text, tone: emphasis });
  const startText = moneyReceived && formatGameEventFact({
    type: GAME_EVENT_FACT_TYPES.START_REWARD,
    playerName: actorName,
    amount: moneyReceived.amount,
  });

  if (event.payload.reason === "TURN_TIMED_OUT") {
    return contextual("TURN_TIMEOUT", GAMEPLAY_FEEDBACK_CONTENT.timeout);
  }
  if (purchased && typeof squareName === "function") {
    const purchaseText = formatGameEventFact({
      type: GAME_EVENT_FACT_TYPES.PURCHASE,
      playerName: actorName,
      squareName: squareName(purchased.squareId),
      amount: purchased.amount,
    });
    return contextual("PURCHASE", GAMEPLAY_FEEDBACK_CONTENT.purchase,
      [purchaseText, startText].filter(Boolean).join(" "), "positive");
  }
  if (rent) {
    const rentText = formatGameEventFact({
      type: GAME_EVENT_FACT_TYPES.RENT,
      playerName: actorName,
      amount: rent.amount,
      counterpartyName: playerName(rent.counterpartyPlayerId),
    });
    return contextual("RENT", GAMEPLAY_FEEDBACK_CONTENT.rent,
      [rentText, startText].filter(Boolean).join(" "), "negative");
  }
  if (tax) {
    const taxText = formatGameEventFact({
      type: GAME_EVENT_FACT_TYPES.TAX,
      playerName: actorName,
      amount: tax.amount,
    });
    return contextual("TAX", GAMEPLAY_FEEDBACK_CONTENT.tax,
      [taxText, startText].filter(Boolean).join(" "), "negative");
  }
  if (moneyReceived) {
    return contextual("START_REWARD", GAMEPLAY_FEEDBACK_CONTENT.start, startText, "positive");
  }
  // Card and jail-specific visuals are intentionally deferred; their confirmed text remains readable.
  if (card || jailed || released || jailOffer) {
    return contextual(event.payload.reason, GAMEPLAY_FEEDBACK_CONTENT.contextualEvent);
  }
  if (available || declined || destinationId != null) return toast(event.payload.reason);
  return toast(event.payload.reason);
}

function isPresentableEvent(event) {
  return event != null
    && typeof event === "object"
    && event.unsupported == null
    && typeof event.eventId === "string"
    && Number.isSafeInteger(event.stateVersion)
    && typeof event.occurredAt === "string"
    && event.payload != null
    && typeof event.payload === "object"
    && typeof event.payload.reason === "string"
    && Array.isArray(event.payload.details);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}
