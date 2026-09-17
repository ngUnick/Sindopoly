import { invalidPayloadError } from "./transportError.js";

const SNAPSHOT_STATUSES = new Set(["lobby", "inProgress", "ended"]);
const CURRENT_GAME_STATUSES = new Set(["lobby", "inProgress"]);
const VISIBILITIES = new Set(["public", "private"]);
const OPTIONAL_ACTION_TYPES = new Set(["PURCHASE_PROPERTY", "PAY_JAIL_EXIT"]);

export function decodeCurrentPlayer(value) {
  requireRecord(value, "currentPlayer");
  return Object.freeze({
    id: positiveId(value.id, "currentPlayer.id"),
    nickname: string(value.nickname, "currentPlayer.nickname"),
  });
}

export function decodeCurrentGame(value) {
  requireRecord(value, "currentGame");
  if (!CURRENT_GAME_STATUSES.has(value.status)) fail("currentGame.status");
  if (!VISIBILITIES.has(value.visibility)) fail("currentGame.visibility");
  return Object.freeze({
    gameId: positiveId(value.gameId, "currentGame.gameId"),
    status: value.status,
    stateVersion: version(value.stateVersion, "currentGame.stateVersion"),
    visibility: value.visibility,
  });
}

/** Validates the current recovery DTO without deriving ownership or game rules. */
export function decodeGameSnapshot(value) {
  requireRecord(value, "snapshot");
  const gameId = positiveId(value.gameId, "snapshot.gameId");
  const stateVersion = version(value.stateVersion, "snapshot.stateVersion");
  if (!SNAPSHOT_STATUSES.has(value.status)) fail("snapshot.status");
  if (!Array.isArray(value.players)) fail("snapshot.players");
  const visibility = value.visibility === undefined
    ? undefined
    : enumValue(value.visibility, VISIBILITIES, "snapshot.visibility");
  const inviteCode = value.inviteCode === undefined
    ? undefined
    : nullableString(value.inviteCode, "snapshot.inviteCode");
  const players = value.players.map((player, index) => decodePlayer(player, index));
  if (new Set(players.map(player => player.playerId)).size !== players.length) {
    fail("snapshot.players.playerId");
  }

  return Object.freeze({
    gameId,
    stateVersion,
    status: value.status,
    playerTurn: nullablePositiveId(value.playerTurn, "snapshot.playerTurn"),
    turnDeadlineEpochMs: nullablePositiveInteger(
      value.turnDeadlineEpochMs,
      "snapshot.turnDeadlineEpochMs",
    ),
    winner: nullablePositiveId(value.winner, "snapshot.winner"),
    visibility,
    inviteCode,
    optionalAction: decodeOptionalAction(value.optionalAction, { gameId, stateVersion }),
    players: Object.freeze(players),
  });
}

export function decodeOptionalAction(value, expected = {}) {
  if (value == null) return null;
  requireRecord(value, "snapshot.optionalAction");
  if (!OPTIONAL_ACTION_TYPES.has(value.type)) fail("snapshot.optionalAction.type");
  const action = {
    type: value.type,
    gameId: positiveId(value.gameId, "snapshot.optionalAction.gameId"),
    playerId: positiveId(value.playerId, "snapshot.optionalAction.playerId"),
    stateVersion: version(value.stateVersion, "snapshot.optionalAction.stateVersion"),
    squareId: value.type === "PAY_JAIL_EXIT"
      ? nullableInteger(value.squareId, "snapshot.optionalAction.squareId")
      : nonNegativeInteger(value.squareId, "snapshot.optionalAction.squareId"),
    cost: positiveInteger(value.cost, "snapshot.optionalAction.cost"),
    declinable: boolean(value.declinable, "snapshot.optionalAction.declinable"),
  };
  if (value.type === "PAY_JAIL_EXIT" && action.squareId !== null) {
    fail("snapshot.optionalAction.squareId");
  }
  if (expected.gameId != null && action.gameId !== expected.gameId) {
    fail("snapshot.optionalAction.gameId");
  }
  if (expected.stateVersion != null && action.stateVersion !== expected.stateVersion) {
    fail("snapshot.optionalAction.stateVersion");
  }
  return Object.freeze(action);
}

export function decodeThrowResult(value) {
  requireRecord(value, "throwResult");
  const dice = nonNegativeInteger(value.dice, "throwResult.dice");
  const squareType = nonNegativeInteger(value.squareType, "throwResult.squareType");
  const noRollJailOffer = squareType === 10 && dice === 0
    && value.die1 == null && value.die2 == null && value.total == null;
  const pair = noRollJailOffer
    ? Object.freeze({ die1: null, die2: null, total: null })
    : decodeDicePair(value, "throwResult");
  if (!noRollJailOffer && dice !== pair.total) fail("throwResult.dice");
  return Object.freeze({
    dice,
    ...pair,
    newPosition: nonNegativeInteger(value.newPosition, "throwResult.newPosition"),
    passedGo: boolean(value.passedGo, "throwResult.passedGo"),
    squareType,
    data: integer(value.data, "throwResult.data"),
    stateVersion: version(value.stateVersion, "throwResult.stateVersion"),
    replayed: boolean(value.replayed, "throwResult.replayed"),
    card: value.card == null ? null : decodeCard(value.card, "throwResult.card"),
  });
}

/** Validates a server-confirmed pair without deriving or repairing any value. */
export function decodeDicePair(value, path = "dicePair") {
  requireRecord(value, path);
  const die1 = boundedInteger(value.die1, 1, 6, `${path}.die1`);
  const die2 = boundedInteger(value.die2, 1, 6, `${path}.die2`);
  const total = boundedInteger(value.total, 2, 12, `${path}.total`);
  if (total !== die1 + die2) fail(`${path}.total`);
  return Object.freeze({ die1, die2, total });
}

export function decodeActionResult(value) {
  requireRecord(value, "actionResult");
  if (!Array.isArray(value.acquiredProperties)) fail("actionResult.acquiredProperties");
  return Object.freeze({
    newBalance: integer(value.newBalance, "actionResult.newBalance"),
    acquiredProperties: Object.freeze(value.acquiredProperties.map((propertyId, index) =>
      nonNegativeInteger(propertyId, `actionResult.acquiredProperties[${index}]`))),
    nextPlayerId: positiveId(value.nextPlayerId, "actionResult.nextPlayerId"),
    stateVersion: version(value.stateVersion, "actionResult.stateVersion"),
    replayed: boolean(value.replayed, "actionResult.replayed"),
  });
}

/** Current lobby commands have varied flat results but share version/replay safety fields. */
export function decodeVersionedCommandResult(value) {
  requireRecord(value, "commandResult");
  return Object.freeze({
    ...value,
    stateVersion: version(value.stateVersion, "commandResult.stateVersion"),
    replayed: boolean(value.replayed, "commandResult.replayed"),
  });
}

export function decodeInviteMetadata(value) {
  requireRecord(value, "inviteMetadata");
  return Object.freeze({
    gameId: positiveId(value.gameId, "inviteMetadata.gameId"),
    stateVersion: version(value.stateVersion, "inviteMetadata.stateVersion"),
  });
}

export function decodeRecordPayload(value) {
  requireRecord(value, "payload");
  return Object.freeze({ ...value });
}

export function decodeArrayPayload(value) {
  if (!Array.isArray(value)) fail("payload");
  return Object.freeze(value.map(item =>
    item != null && typeof item === "object" && !Array.isArray(item)
      ? Object.freeze({ ...item })
      : item));
}

export function decodeBooleanPayload(value) {
  return boolean(value, "payload");
}

function decodePlayer(value, index) {
  const path = `snapshot.players[${index}]`;
  requireRecord(value, path);
  if (!Array.isArray(value.properties)) fail(`${path}.properties`);
  return Object.freeze({
    playerId: positiveId(value.playerId, `${path}.playerId`),
    nickname: string(value.nickname, `${path}.nickname`),
    position: nonNegativeInteger(value.position, `${path}.position`),
    money: integer(value.money, `${path}.money`),
    properties: Object.freeze(value.properties.map((propertyId, propertyIndex) =>
      nonNegativeInteger(propertyId, `${path}.properties[${propertyIndex}]`))),
    jailed: boolean(value.jailed, `${path}.jailed`),
    jailTurnsRemaining: nonNegativeInteger(value.jailTurnsRemaining, `${path}.jailTurnsRemaining`),
    bankrupt: boolean(value.bankrupt, `${path}.bankrupt`),
    afk: boolean(value.afk, `${path}.afk`),
  });
}

export function decodeCard(value, path = "card") {
  requireRecord(value, path);
  return Object.freeze({
    cardId: positiveId(value.cardId, `${path}.cardId`),
    title: string(value.title, `${path}.title`),
    text: string(value.text, `${path}.text`),
    effect: string(value.effect, `${path}.effect`),
    amount: integer(value.amount, `${path}.amount`),
  });
}

function requireRecord(value, path) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) fail(path);
}

function enumValue(value, allowed, path) {
  if (!allowed.has(value)) fail(path);
  return value;
}

function string(value, path) {
  if (typeof value !== "string") fail(path);
  return value;
}

function nullableString(value, path) {
  return value === null ? null : string(value, path);
}

function boolean(value, path) {
  if (typeof value !== "boolean") fail(path);
  return value;
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

function boundedInteger(value, minimum, maximum, path) {
  const parsed = integer(value, path);
  if (parsed < minimum || parsed > maximum) fail(path);
  return parsed;
}

function positiveId(value, path) {
  return positiveInteger(value, path);
}

function nullableInteger(value, path) {
  return value === null ? null : integer(value, path);
}

function nullablePositiveId(value, path) {
  return value === null ? null : positiveId(value, path);
}

function nullablePositiveInteger(value, path) {
  return value === null ? null : positiveInteger(value, path);
}

function version(value, path) {
  return nonNegativeInteger(value, path);
}

function fail(path) {
  throw invalidPayloadError(path);
}
