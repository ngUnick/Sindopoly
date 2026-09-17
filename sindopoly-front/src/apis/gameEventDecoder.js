import { decodeCard, decodeDicePair } from "./transportDecoders.js";
import { invalidPayloadError } from "./transportError.js";

const EVENT_TYPES = new Set([
  "LOBBY_UPDATED", "GAME_STARTED", "TURN_UPDATED", "GAME_COMPLETED",
]);
const EVENT_REASONS = new Set([
  "GAME_CREATED", "PLAYER_JOINED", "PLAYER_LEFT", "PLAYER_KICKED", "GAME_STARTED",
  "ROLL_COMPLETED", "ACTION_RESOLVED", "TURN_TIMED_OUT", "GAME_COMPLETED",
]);
const DETAIL_TYPES = new Set([
  "DICE_ROLLED", "PLAYER_MOVED", "LANDED_ON_TILE", "PROPERTY_AVAILABLE",
  "PROPERTY_PURCHASED", "PROPERTY_DECLINED", "RENT_PAID", "TAX_PAID",
  "CARD_DRAWN", "MONEY_RECEIVED", "TURN_CHANGED", "PLAYER_JAILED",
  "PLAYER_RELEASED", "JAIL_EXIT_AVAILABLE",
]);

export function decodeGameEventBody(raw, expectedGameId) {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch (error) {
      throw invalidPayloadError("gameEvent.body", error);
    }
  }
  return decodeGameEvent(value, expectedGameId);
}

/** Unknown descriptive event values remain bounded recovery signals, never commands. */
export function decodeGameEvent(value, expectedGameId) {
  requireRecord(value, "gameEvent");
  const gameId = positiveInteger(value.gameId, "gameEvent.gameId");
  const expected = positiveInteger(Number(expectedGameId), "gameEvent.expectedGameId");
  if (gameId !== expected) fail("gameEvent.gameId");
  if (typeof value.eventId !== "string" || value.eventId.length === 0) fail("gameEvent.eventId");
  if (typeof value.eventType !== "string" || value.eventType.length === 0) fail("gameEvent.eventType");
  if (typeof value.occurredAt !== "string" || !Number.isFinite(Date.parse(value.occurredAt))) {
    fail("gameEvent.occurredAt");
  }
  requireRecord(value.payload, "gameEvent.payload");
  if (typeof value.payload.reason !== "string" || value.payload.reason.length === 0) {
    fail("gameEvent.payload.reason");
  }
  if (!Array.isArray(value.payload.details) || value.payload.details.length > 12) {
    fail("gameEvent.payload.details");
  }

  const actorPlayerId = value.payload.actorPlayerId === null
    ? null
    : positiveInteger(value.payload.actorPlayerId, "gameEvent.payload.actorPlayerId");
  const unsupportedDetails = [];
  const details = Object.freeze(value.payload.details.map((detail, index) => {
    const decoded = decodeDetail(detail, index);
    if (decoded.unsupported) unsupportedDetails.push(decoded.type);
    return decoded;
  }));
  const unsupported = {
    eventType: EVENT_TYPES.has(value.eventType) ? null : value.eventType,
    reason: EVENT_REASONS.has(value.payload.reason) ? null : value.payload.reason,
    detailTypes: Object.freeze(unsupportedDetails),
  };
  const hasUnsupported = unsupported.eventType != null
    || unsupported.reason != null
    || unsupported.detailTypes.length > 0;

  const decoded = {
    eventId: value.eventId,
    eventType: value.eventType,
    gameId,
    stateVersion: nonNegativeInteger(value.stateVersion, "gameEvent.stateVersion"),
    occurredAt: value.occurredAt,
    payload: Object.freeze({
      reason: value.payload.reason,
      actorPlayerId,
      details,
    }),
  };
  if (hasUnsupported) {
    decoded.unsupported = Object.freeze({
      eventType: unsupported.eventType,
      reason: unsupported.reason,
      detailTypes: unsupported.detailTypes,
    });
  }
  return Object.freeze(decoded);
}

function decodeDetail(value, index) {
  const path = `gameEvent.payload.details[${index}]`;
  requireRecord(value, path);
  if (typeof value.type !== "string" || value.type.length === 0) fail(`${path}.type`);
  if (!DETAIL_TYPES.has(value.type)) {
    return Object.freeze({ type: value.type, unsupported: true });
  }

  switch (value.type) {
    case "DICE_ROLLED":
      {
        const pair = decodeDicePair(value, path);
        const dice = integer(value.dice, `${path}.dice`);
        if (dice !== pair.total) fail(`${path}.dice`);
        return detail(value.type, { dice, ...pair });
      }
    case "PLAYER_MOVED":
      return detail(value.type, {
        fromPosition: nonNegativeInteger(value.fromPosition, `${path}.fromPosition`),
        toPosition: nonNegativeInteger(value.toPosition, `${path}.toPosition`),
      });
    case "LANDED_ON_TILE":
    case "PROPERTY_DECLINED":
    case "PLAYER_JAILED":
      return detail(value.type, { squareId: nonNegativeInteger(value.squareId, `${path}.squareId`) });
    case "PROPERTY_AVAILABLE":
    case "PROPERTY_PURCHASED":
    case "TAX_PAID":
      return detail(value.type, {
        squareId: nonNegativeInteger(value.squareId, `${path}.squareId`),
        amount: integer(value.amount, `${path}.amount`),
      });
    case "RENT_PAID":
      return detail(value.type, {
        squareId: nonNegativeInteger(value.squareId, `${path}.squareId`),
        amount: integer(value.amount, `${path}.amount`),
        counterpartyPlayerId: positiveInteger(
          value.counterpartyPlayerId, `${path}.counterpartyPlayerId`,
        ),
      });
    case "CARD_DRAWN":
      return detail(value.type, {
        squareId: nonNegativeInteger(value.squareId, `${path}.squareId`),
        amount: integer(value.amount, `${path}.amount`),
        card: decodeCard(value.card, `${path}.card`),
      });
    case "MONEY_RECEIVED":
    case "PLAYER_RELEASED":
    case "JAIL_EXIT_AVAILABLE":
      return detail(value.type, { amount: integer(value.amount, `${path}.amount`) });
    case "TURN_CHANGED":
      return detail(value.type, {
        nextPlayerId: positiveInteger(value.nextPlayerId, `${path}.nextPlayerId`),
      });
    default:
      fail(`${path}.type`);
  }
}

function detail(type, fields) {
  return Object.freeze({ type, ...fields });
}

function requireRecord(value, path) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) fail(path);
}

function integer(value, path) {
  if (!Number.isSafeInteger(value)) fail(path);
  return value;
}

function nonNegativeInteger(value, path) {
  const parsed = integer(value, path);
  if (parsed < 0) fail(path);
  return parsed;
}

function positiveInteger(value, path) {
  const parsed = integer(value, path);
  if (parsed <= 0) fail(path);
  return parsed;
}

function fail(path) {
  throw invalidPayloadError(path);
}
