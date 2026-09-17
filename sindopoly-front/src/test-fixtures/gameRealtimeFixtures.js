/**
 * Sanitized FE-REVAMP-001 fixtures for the current public snapshot/event contracts.
 * IDs and names are synthetic; field names and value types mirror the current DTOs.
 */

const host = {
  playerId: 101,
  nickname: "BaselineHost",
  position: 6,
  money: 1440,
  properties: [1],
  jailed: false,
  jailTurnsRemaining: 0,
  bankrupt: false,
  afk: false,
};

const guest = {
  playerId: 102,
  nickname: "BaselineGuest",
  position: 10,
  money: 1560,
  properties: [3],
  jailed: false,
  jailTurnsRemaining: 0,
  bankrupt: false,
  afk: false,
};

export const lobbySnapshot = {
  gameId: 101,
  stateVersion: 1,
  status: "lobby",
  playerTurn: null,
  turnDeadlineEpochMs: null,
  winner: null,
  visibility: "public",
  inviteCode: null,
  optionalAction: null,
  players: [
    { ...host, position: 0, money: 1500, properties: [] },
    { ...guest, position: 0, money: 1500, properties: [] },
  ],
};

export const inProgressSnapshot = {
  gameId: 101,
  stateVersion: 2,
  status: "inProgress",
  playerTurn: 101,
  turnDeadlineEpochMs: 1789661234567,
  winner: null,
  visibility: "public",
  inviteCode: null,
  optionalAction: null,
  players: [host, guest],
};

// Viewer identity is session context; active and inactive members receive the same snapshot shape.
export const inProgressViewerScenarios = {
  active: { viewerPlayerId: 101, snapshot: inProgressSnapshot },
  inactive: { viewerPlayerId: 102, snapshot: inProgressSnapshot },
};

export const purchaseOptionalActionSnapshot = {
  ...inProgressSnapshot,
  stateVersion: 3,
  turnDeadlineEpochMs: 1789661294567,
  optionalAction: {
    type: "PURCHASE_PROPERTY",
    gameId: 101,
    playerId: 101,
    stateVersion: 3,
    squareId: 6,
    cost: 100,
    declinable: true,
  },
};

export const jailedPlayerSnapshot = {
  ...inProgressSnapshot,
  stateVersion: 8,
  turnDeadlineEpochMs: 1789661594567,
  optionalAction: {
    type: "PAY_JAIL_EXIT",
    gameId: 101,
    playerId: 101,
    stateVersion: 8,
    squareId: null,
    cost: 50,
    declinable: true,
  },
  players: [
    { ...host, position: 10, jailed: true, jailTurnsRemaining: 3 },
    guest,
  ],
};

export const endedGameSnapshot = {
  ...inProgressSnapshot,
  stateVersion: 21,
  status: "ended",
  playerTurn: 102,
  turnDeadlineEpochMs: null,
  winner: 101,
  optionalAction: null,
  players: [
    { ...host, money: 5000, properties: [1, 5] },
    guest,
  ],
};

export const postTimeoutSnapshot = {
  ...inProgressSnapshot,
  stateVersion: 9,
  playerTurn: 102,
  turnDeadlineEpochMs: 1789661654567,
};

export const turnUpdatedEvent = {
  eventId: "00000000-0000-4000-8000-000000000001",
  eventType: "TURN_UPDATED",
  gameId: 101,
  stateVersion: 2,
  occurredAt: "2026-09-01T10:00:00Z",
  payload: {
    reason: "ROLL_COMPLETED",
    actorPlayerId: 101,
    details: [
      { type: "DICE_ROLLED", dice: 6, die1: 2, die2: 4, total: 6 },
      { type: "PLAYER_MOVED", fromPosition: 0, toPosition: 6 },
      { type: "LANDED_ON_TILE", squareId: 6 },
      { type: "TURN_CHANGED", nextPlayerId: 102 },
    ],
  },
};

export const cardEvent = {
  eventId: "00000000-0000-4000-8000-000000000002",
  eventType: "TURN_UPDATED",
  gameId: 101,
  stateVersion: 5,
  occurredAt: "2026-09-01T10:01:00Z",
  payload: {
    reason: "ROLL_COMPLETED",
    actorPlayerId: 101,
    details: [
      { type: "DICE_ROLLED", dice: 2, die1: 1, die2: 1, total: 2 },
      { type: "PLAYER_MOVED", fromPosition: 0, toPosition: 2 },
      { type: "LANDED_ON_TILE", squareId: 2 },
      {
        type: "CARD_DRAWN",
        squareId: 2,
        amount: -50,
        card: {
          cardId: 5,
          title: "Community Chest",
          text: "Έληξε η κάρτα του ΟΑΣΘ. Πλήρωσε €50.",
          effect: "money",
          amount: -50,
        },
      },
      { type: "TURN_CHANGED", nextPlayerId: 102 },
    ],
  },
};

export const rentEvent = {
  eventId: "00000000-0000-4000-8000-000000000003",
  eventType: "TURN_UPDATED",
  gameId: 101,
  stateVersion: 6,
  occurredAt: "2026-09-01T10:02:00Z",
  payload: {
    reason: "ROLL_COMPLETED",
    actorPlayerId: 101,
    details: [
      { type: "DICE_ROLLED", dice: 2, die1: 1, die2: 1, total: 2 },
      { type: "PLAYER_MOVED", fromPosition: 39, toPosition: 1 },
      { type: "LANDED_ON_TILE", squareId: 1 },
      { type: "RENT_PAID", squareId: 1, amount: 100, counterpartyPlayerId: 102 },
      { type: "TURN_CHANGED", nextPlayerId: 102 },
    ],
  },
};

export const taxEvent = {
  eventId: "00000000-0000-4000-8000-000000000004",
  eventType: "TURN_UPDATED",
  gameId: 101,
  stateVersion: 7,
  occurredAt: "2026-09-01T10:03:00Z",
  payload: {
    reason: "ROLL_COMPLETED",
    actorPlayerId: 101,
    details: [
      { type: "DICE_ROLLED", dice: 4, die1: 1, die2: 3, total: 4 },
      { type: "PLAYER_MOVED", fromPosition: 0, toPosition: 4 },
      { type: "LANDED_ON_TILE", squareId: 4 },
      { type: "TAX_PAID", squareId: 4, amount: 200 },
      { type: "TURN_CHANGED", nextPlayerId: 102 },
    ],
  },
};

export const turnTimeoutEvent = {
  eventId: "00000000-0000-4000-8000-000000000005",
  eventType: "TURN_UPDATED",
  gameId: 101,
  stateVersion: 9,
  occurredAt: "2026-09-01T10:04:00Z",
  payload: {
    reason: "TURN_TIMED_OUT",
    actorPlayerId: 101,
    details: [{ type: "TURN_CHANGED", nextPlayerId: 102 }],
  },
};

export const snapshotFixtures = [
  lobbySnapshot,
  inProgressSnapshot,
  purchaseOptionalActionSnapshot,
  jailedPlayerSnapshot,
  postTimeoutSnapshot,
  endedGameSnapshot,
];

export const eventFixtures = [
  turnUpdatedEvent,
  cardEvent,
  rentEvent,
  taxEvent,
  turnTimeoutEvent,
];
