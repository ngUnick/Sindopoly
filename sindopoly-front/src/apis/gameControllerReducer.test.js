import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  GAME_COMMAND_STATUS,
  GAME_CONNECTION_STATUS,
  GAME_CONTROLLER_ACTIONS,
  GAME_RECOVERY_REASON,
  canSubmitGameCommand,
  createGameControllerState,
  gameControllerReducer,
  getAcceptedSnapshot,
  getAcceptedVersion,
  getCommandLifecycle,
  getConnectionState,
  getEventGap,
  getExpectedCommandVersion,
  isRecoveryRequired,
  isSnapshotRefreshRequired,
} from "../features/game/controller/gameControllerReducer.js";
import { deriveOwnershipProjection } from "./ownershipProjection.js";
import { decodeGameSnapshot } from "./transportDecoders.js";
import { buildGameViewModel } from "../features/game/presentation/gameViewModel.js";
import {
  createEventHistoryState,
  markEventHistoryGap,
} from "../features/game/presentation/eventHistory.js";
import {
  endedGameSnapshot,
  inProgressSnapshot,
} from "../test-fixtures/gameRealtimeFixtures.js";

const reducerSource = await readFile(
  new URL("../features/game/controller/gameControllerReducer.js", import.meta.url),
  "utf8",
);
const reduce = (state, action) => gameControllerReducer(state, action);
const acceptedSnapshot = (overrides = {}) => decodeGameSnapshot({
  ...inProgressSnapshot,
  ...overrides,
});
const controllerWithSnapshot = (overrides = {}) => {
  let state = createGameControllerState(101);
  state = reduce(state, {
    type: GAME_CONTROLLER_ACTIONS.CONNECTION_CHANGED,
    status: GAME_CONNECTION_STATUS.CONNECTED,
  });
  return reduce(state, {
    type: GAME_CONTROLLER_ACTIONS.SNAPSHOT_ACCEPTED,
    snapshot: acceptedSnapshot(overrides),
  });
};
const startCommand = (state, commandId = "command-a") => reduce(state, {
  type: GAME_CONTROLLER_ACTIONS.COMMAND_STARTED,
  commandId,
  expectedVersion: state.acceptedVersion,
});
const failCommand = (state, code, extra = {}) => reduce(state, {
  type: GAME_CONTROLLER_ACTIONS.COMMAND_FAILED,
  commandId: state.command.commandId,
  error: { code, ...extra },
});
const realtimeEvent = (stateVersion, overrides = {}) => ({
  eventId: `event-${stateVersion}`,
  eventType: "TURN_UPDATED",
  gameId: 101,
  stateVersion,
  occurredAt: `2026-09-01T10:00:${String(stateVersion).padStart(2, "0")}Z`,
  unsupported: null,
  ...overrides,
});

test("initial state has no accepted snapshot or version", () => {
  const state = createGameControllerState(101);
  assert.equal(getAcceptedSnapshot(state), null);
  assert.equal(getAcceptedVersion(state), null);
  assert.equal(canSubmitGameCommand(state), false);
});

test("invalid game identity fails safely at construction", () => {
  for (const gameId of [null, 0, -1, "101", Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createGameControllerState(gameId), TypeError);
  }
});

test("first authoritative snapshot is accepted", () => {
  const snapshot = acceptedSnapshot();
  const state = reduce(createGameControllerState(101), {
    type: GAME_CONTROLLER_ACTIONS.SNAPSHOT_ACCEPTED,
    snapshot,
  });
  assert.equal(state.snapshot, snapshot);
  assert.equal(state.acceptedVersion, 2);
});

test("newer authoritative snapshot replaces accepted truth", () => {
  const previous = controllerWithSnapshot();
  const newer = acceptedSnapshot({ stateVersion: 3 });
  const state = reduce(previous, {
    type: GAME_CONTROLLER_ACTIONS.SNAPSHOT_ACCEPTED,
    snapshot: newer,
  });
  assert.equal(state.snapshot, newer);
  assert.equal(state.acceptedVersion, 3);
});

test("newer authoritative snapshot replaces the accepted turn deadline", () => {
  const previous = controllerWithSnapshot();
  const newer = acceptedSnapshot({ stateVersion: 3, turnDeadlineEpochMs: 1789661294567 });
  const state = reduce(previous, {
    type: GAME_CONTROLLER_ACTIONS.SNAPSHOT_ACCEPTED,
    snapshot: newer,
  });
  assert.equal(state.snapshot.turnDeadlineEpochMs, 1789661294567);
});

test("older snapshot is rejected without state mutation", () => {
  const state = controllerWithSnapshot({ stateVersion: 4 });
  const result = reduce(state, {
    type: GAME_CONTROLLER_ACTIONS.SNAPSHOT_ACCEPTED,
    snapshot: acceptedSnapshot({ stateVersion: 3 }),
  });
  assert.equal(result, state);
});

test("older snapshot cannot roll the accepted turn deadline backward", () => {
  const state = controllerWithSnapshot({ stateVersion: 4, turnDeadlineEpochMs: 1789661414567 });
  const result = reduce(state, {
    type: GAME_CONTROLLER_ACTIONS.SNAPSHOT_ACCEPTED,
    snapshot: acceptedSnapshot({ stateVersion: 3, turnDeadlineEpochMs: 1789661294567 }),
  });
  assert.equal(result, state);
  assert.equal(result.snapshot.turnDeadlineEpochMs, 1789661414567);
});

test("equal-version snapshot is idempotent and cannot replace accepted truth", () => {
  const state = controllerWithSnapshot();
  const changedAtSameVersion = acceptedSnapshot({ playerTurn: 102 });
  const result = reduce(state, {
    type: GAME_CONTROLLER_ACTIONS.SNAPSHOT_ACCEPTED,
    snapshot: changedAtSameVersion,
  });
  assert.equal(result, state);
  assert.equal(result.snapshot.playerTurn, 101);
});

test("equal-version snapshot cannot replace the accepted turn deadline", () => {
  const state = controllerWithSnapshot();
  const result = reduce(state, {
    type: GAME_CONTROLLER_ACTIONS.SNAPSHOT_ACCEPTED,
    snapshot: acceptedSnapshot({ turnDeadlineEpochMs: 1789661294567 }),
  });
  assert.equal(result, state);
  assert.equal(result.snapshot.turnDeadlineEpochMs, 1789661234567);
});

test("wrong-game snapshot is rejected", () => {
  const state = controllerWithSnapshot();
  const result = reduce(state, {
    type: GAME_CONTROLLER_ACTIONS.SNAPSHOT_ACCEPTED,
    snapshot: acceptedSnapshot({ gameId: 202 }),
  });
  assert.equal(result, state);
});

test("accepted decoded snapshot remains immutable", () => {
  const snapshot = acceptedSnapshot();
  const state = reduce(createGameControllerState(101), {
    type: GAME_CONTROLLER_ACTIONS.SNAPSHOT_ACCEPTED,
    snapshot,
  });
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.snapshot), true);
  assert.throws(() => { state.snapshot.status = "ended"; }, TypeError);
});

test("ended snapshot remains accepted but disables command readiness", () => {
  const ended = decodeGameSnapshot(endedGameSnapshot);
  let state = createGameControllerState(101);
  state = reduce(state, {
    type: GAME_CONTROLLER_ACTIONS.CONNECTION_CHANGED,
    status: GAME_CONNECTION_STATUS.CONNECTED,
  });
  state = reduce(state, { type: GAME_CONTROLLER_ACTIONS.SNAPSHOT_ACCEPTED, snapshot: ended });
  assert.equal(state.snapshot.status, "ended");
  assert.equal(canSubmitGameCommand(state), false);
});

test("reset removes snapshot and accepted version", () => {
  const state = reduce(controllerWithSnapshot(), {
    type: GAME_CONTROLLER_ACTIONS.RESET,
    gameId: 202,
  });
  assert.equal(state.gameId, 202);
  assert.equal(state.snapshot, null);
  assert.equal(state.acceptedVersion, null);
});

test("command starts only from a safe controller state", () => {
  const initial = createGameControllerState(101);
  const blocked = startCommand(initial);
  const ready = controllerWithSnapshot();
  const started = startCommand(ready);
  assert.equal(blocked, initial);
  assert.equal(started.command.status, GAME_COMMAND_STATUS.PENDING);
});

test("pending command blocks a second transport command", () => {
  const pending = startCommand(controllerWithSnapshot());
  const result = reduce(pending, {
    type: GAME_CONTROLLER_ACTIONS.COMMAND_STARTED,
    commandId: "command-b",
    expectedVersion: pending.acceptedVersion,
  });
  assert.equal(result, pending);
});

test("active command identity is retained", () => {
  const state = startCommand(controllerWithSnapshot(), "command-identity");
  assert.equal(state.command.commandId, "command-identity");
});

test("command expected version is retained from accepted truth", () => {
  const state = startCommand(controllerWithSnapshot());
  assert.equal(state.command.expectedVersion, 2);
  assert.equal(getExpectedCommandVersion(state), 2);
});

test("command with a divergent expected version is rejected", () => {
  const ready = controllerWithSnapshot();
  const result = reduce(ready, {
    type: GAME_CONTROLLER_ACTIONS.COMMAND_STARTED,
    commandId: "bad-version",
    expectedVersion: 99,
  });
  assert.equal(result, ready);
});

test("matching command result awaits authoritative snapshot", () => {
  const pending = startCommand(controllerWithSnapshot());
  const state = reduce(pending, {
    type: GAME_CONTROLLER_ACTIONS.COMMAND_SUCCEEDED,
    commandId: "command-a",
    stateVersion: 3,
  });
  assert.equal(state.command.status, GAME_COMMAND_STATUS.AWAITING_SNAPSHOT);
  assert.equal(state.command.resultVersion, 3);
  assert.equal(isSnapshotRefreshRequired(state), true);
});

test("late mismatched command result is ignored", () => {
  const pending = startCommand(controllerWithSnapshot(), "command-b");
  const result = reduce(pending, {
    type: GAME_CONTROLLER_ACTIONS.COMMAND_SUCCEEDED,
    commandId: "command-a",
    stateVersion: 3,
  });
  assert.equal(result, pending);
});

test("command result never advances accepted game version", () => {
  const pending = startCommand(controllerWithSnapshot());
  const state = reduce(pending, {
    type: GAME_CONTROLLER_ACTIONS.COMMAND_SUCCEEDED,
    commandId: "command-a",
    stateVersion: 8,
  });
  assert.equal(state.acceptedVersion, 2);
  assert.equal(getExpectedCommandVersion(state), 2);
});

test("snapshot below command result target keeps reconciliation blocked", () => {
  let state = startCommand(controllerWithSnapshot());
  state = reduce(state, {
    type: GAME_CONTROLLER_ACTIONS.COMMAND_SUCCEEDED,
    commandId: "command-a",
    stateVersion: 4,
  });
  state = reduce(state, {
    type: GAME_CONTROLLER_ACTIONS.SNAPSHOT_ACCEPTED,
    snapshot: acceptedSnapshot({ stateVersion: 3 }),
  });
  assert.equal(state.command.status, GAME_COMMAND_STATUS.AWAITING_SNAPSHOT);
  assert.equal(state.snapshotRefreshRequired, true);
});

test("snapshot reaching command result target returns command to idle", () => {
  let state = startCommand(controllerWithSnapshot());
  state = reduce(state, {
    type: GAME_CONTROLLER_ACTIONS.COMMAND_SUCCEEDED,
    commandId: "command-a",
    stateVersion: 3,
  });
  state = reduce(state, {
    type: GAME_CONTROLLER_ACTIONS.SNAPSHOT_ACCEPTED,
    snapshot: acceptedSnapshot({ stateVersion: 3 }),
  });
  assert.equal(state.command.status, GAME_COMMAND_STATUS.IDLE);
  assert.equal(state.snapshotRefreshRequired, false);
});

test("ordinary conflict preserves accepted state and permits a new intent", () => {
  const failed = failCommand(startCommand(controllerWithSnapshot()), "CONFLICT");
  assert.equal(failed.command.status, GAME_COMMAND_STATUS.FAILED);
  assert.equal(failed.recovery.required, false);
  assert.equal(canSubmitGameCommand(failed), true);
});

test("validation failure preserves controller readiness", () => {
  const failed = failCommand(startCommand(controllerWithSnapshot()), "VALIDATION");
  assert.equal(failed.command.error.code, "VALIDATION");
  assert.equal(canSubmitGameCommand(failed), true);
});

for (const code of ["NETWORK", "SERVER", "INVALID_PAYLOAD", "UNKNOWN"]) {
  test(`${code} command failure requires authoritative reconciliation`, () => {
    const failed = failCommand(startCommand(controllerWithSnapshot()), code);
    assert.equal(failed.command.status, GAME_COMMAND_STATUS.FAILED);
    assert.equal(failed.recovery.reason, GAME_RECOVERY_REASON.COMMAND_OUTCOME_UNKNOWN);
    assert.equal(failed.snapshotRefreshRequired, true);
    assert.equal(canSubmitGameCommand(failed), false);
  });
}

for (const code of ["FORBIDDEN", "UNAUTHENTICATED", "NOT_FOUND"]) {
  test(`${code} command failure blocks later gameplay commands`, () => {
    const failed = failCommand(startCommand(controllerWithSnapshot()), code);
    assert.equal(failed.command.status, GAME_COMMAND_STATUS.BLOCKED);
    assert.equal(canSubmitGameCommand(failed), false);
  });
}

test("stale conflict blocks commands and requests recovery", () => {
  const stale = failCommand(startCommand(controllerWithSnapshot()), "STALE_STATE", {
    stateVersion: 3,
    reason: "STALE_STATE",
  });
  assert.equal(stale.command.status, GAME_COMMAND_STATUS.STALE);
  assert.equal(stale.recovery.reason, GAME_RECOVERY_REASON.STALE_STATE);
  assert.equal(stale.snapshotRefreshRequired, true);
  assert.equal(canSubmitGameCommand(stale), false);
});

test("fresh recovery snapshot clears stale command block", () => {
  let state = failCommand(startCommand(controllerWithSnapshot()), "STALE_STATE");
  state = reduce(state, {
    type: GAME_CONTROLLER_ACTIONS.SNAPSHOT_ACCEPTED,
    snapshot: acceptedSnapshot({ stateVersion: 3 }),
  });
  assert.equal(state.command.status, GAME_COMMAND_STATUS.IDLE);
  assert.equal(state.recovery.required, false);
  assert.equal(canSubmitGameCommand(state), true);
});

test("equal-version recovery read may clear stale lifecycle without replacing truth", () => {
  let state = failCommand(startCommand(controllerWithSnapshot()), "STALE_STATE");
  const originalSnapshot = state.snapshot;
  state = reduce(state, {
    type: GAME_CONTROLLER_ACTIONS.SNAPSHOT_ACCEPTED,
    snapshot: acceptedSnapshot({ playerTurn: 102 }),
  });
  assert.equal(state.snapshot, originalSnapshot);
  assert.equal(state.command.status, GAME_COMMAND_STATUS.IDLE);
  assert.equal(state.recovery.required, false);
});

test("stale state never causes a blind retry", () => {
  const stale = failCommand(startCommand(controllerWithSnapshot()), "STALE_STATE");
  const result = reduce(stale, {
    type: GAME_CONTROLLER_ACTIONS.COMMAND_STARTED,
    commandId: "automatic-retry",
    expectedVersion: 3,
  });
  assert.equal(result, stale);
  assert.equal(result.command.commandId, "command-a");
});

test("connected state becomes command-safe only with an accepted snapshot", () => {
  let state = createGameControllerState(101);
  state = reduce(state, {
    type: GAME_CONTROLLER_ACTIONS.CONNECTION_CHANGED,
    status: GAME_CONNECTION_STATUS.CONNECTED,
  });
  assert.equal(canSubmitGameCommand(state), false);
  state = reduce(state, {
    type: GAME_CONTROLLER_ACTIONS.SNAPSHOT_ACCEPTED,
    snapshot: acceptedSnapshot(),
  });
  assert.equal(canSubmitGameCommand(state), true);
});

test("degraded connection disables commands and requests recovery", () => {
  const state = reduce(controllerWithSnapshot(), {
    type: GAME_CONTROLLER_ACTIONS.CONNECTION_CHANGED,
    status: GAME_CONNECTION_STATUS.DEGRADED,
  });
  assert.equal(canSubmitGameCommand(state), false);
  assert.equal(state.recovery.reason, GAME_RECOVERY_REASON.CONNECTION_RECOVERY);
});

test("reconnecting disables commands", () => {
  const state = reduce(controllerWithSnapshot(), {
    type: GAME_CONTROLLER_ACTIONS.CONNECTION_CHANGED,
    status: GAME_CONNECTION_STATUS.RECONNECTING,
  });
  assert.equal(state.connection.status, GAME_CONNECTION_STATUS.RECONNECTING);
  assert.equal(canSubmitGameCommand(state), false);
});

test("offline disables commands", () => {
  const state = reduce(controllerWithSnapshot(), {
    type: GAME_CONTROLLER_ACTIONS.CONNECTION_CHANGED,
    status: GAME_CONNECTION_STATUS.OFFLINE,
  });
  assert.equal(canSubmitGameCommand(state), false);
});

test("recovered connection becomes safe after authoritative recovery read", () => {
  let state = reduce(controllerWithSnapshot(), {
    type: GAME_CONTROLLER_ACTIONS.CONNECTION_CHANGED,
    status: GAME_CONNECTION_STATUS.RECONNECTING,
  });
  state = reduce(state, {
    type: GAME_CONTROLLER_ACTIONS.SNAPSHOT_ACCEPTED,
    snapshot: acceptedSnapshot(),
  });
  state = reduce(state, {
    type: GAME_CONTROLLER_ACTIONS.CONNECTION_CHANGED,
    status: GAME_CONNECTION_STATUS.RECOVERED,
  });
  assert.equal(canSubmitGameCommand(state), true);
});

test("connection transition does not alter accepted snapshot", () => {
  const state = controllerWithSnapshot();
  const snapshot = state.snapshot;
  const changed = reduce(state, {
    type: GAME_CONTROLLER_ACTIONS.CONNECTION_CHANGED,
    status: GAME_CONNECTION_STATUS.RECONNECTING,
  });
  assert.equal(changed.snapshot, snapshot);
});

test("connection transition does not alter accepted version", () => {
  const state = controllerWithSnapshot();
  const changed = reduce(state, {
    type: GAME_CONTROLLER_ACTIONS.CONNECTION_CHANGED,
    status: GAME_CONNECTION_STATUS.OFFLINE,
  });
  assert.equal(changed.acceptedVersion, state.acceptedVersion);
});

test("connection status alone cannot clear recovery", () => {
  let state = reduce(controllerWithSnapshot(), {
    type: GAME_CONTROLLER_ACTIONS.CONNECTION_CHANGED,
    status: GAME_CONNECTION_STATUS.RECONNECTING,
  });
  state = reduce(state, {
    type: GAME_CONTROLLER_ACTIONS.CONNECTION_CHANGED,
    status: GAME_CONNECTION_STATUS.CONNECTED,
  });
  assert.equal(state.recovery.required, true);
  assert.equal(canSubmitGameCommand(state), false);
});

test("same and older realtime events are ignored", () => {
  const state = controllerWithSnapshot();
  assert.equal(reduce(state, {
    type: GAME_CONTROLLER_ACTIONS.REALTIME_EVENT_RECEIVED,
    event: realtimeEvent(2),
  }), state);
  assert.equal(reduce(state, {
    type: GAME_CONTROLLER_ACTIONS.REALTIME_EVENT_RECEIVED,
    event: realtimeEvent(1),
  }), state);
});

test("next-version event requests an authoritative snapshot refresh", () => {
  const state = reduce(controllerWithSnapshot(), {
    type: GAME_CONTROLLER_ACTIONS.REALTIME_EVENT_RECEIVED,
    event: realtimeEvent(3),
  });
  assert.equal(state.latestObservedEventVersion, 3);
  assert.equal(state.snapshotRefreshRequired, true);
  assert.equal(state.recovery.eventGap, null);
});

test("larger event-version jump records a proven gap", () => {
  const state = reduce(controllerWithSnapshot(), {
    type: GAME_CONTROLLER_ACTIONS.REALTIME_EVENT_RECEIVED,
    event: realtimeEvent(5),
  });
  assert.equal(state.recovery.reason, GAME_RECOVERY_REASON.EVENT_GAP);
  assert.deepEqual(getEventGap(state), {
    stateVersion: 5,
    occurredAt: realtimeEvent(5).occurredAt,
  });
});

test("wrong-game realtime event is rejected", () => {
  const state = controllerWithSnapshot();
  const result = reduce(state, {
    type: GAME_CONTROLLER_ACTIONS.REALTIME_EVENT_RECEIVED,
    event: realtimeEvent(3, { gameId: 202 }),
  });
  assert.equal(result, state);
});

test("realtime event never replaces authoritative snapshot", () => {
  const state = controllerWithSnapshot();
  const snapshot = state.snapshot;
  const changed = reduce(state, {
    type: GAME_CONTROLLER_ACTIONS.REALTIME_EVENT_RECEIVED,
    event: realtimeEvent(3),
  });
  assert.equal(changed.snapshot, snapshot);
  assert.equal(changed.acceptedVersion, 2);
});

test("contiguous burst tracks newest event without inventing a gap", () => {
  let state = controllerWithSnapshot();
  state = reduce(state, {
    type: GAME_CONTROLLER_ACTIONS.REALTIME_EVENT_RECEIVED,
    event: realtimeEvent(3),
  });
  state = reduce(state, {
    type: GAME_CONTROLLER_ACTIONS.REALTIME_EVENT_RECEIVED,
    event: realtimeEvent(4),
  });
  assert.equal(state.latestObservedEventVersion, 4);
  assert.equal(state.recovery.eventGap, null);
});

test("unsupported but validated event still wakes snapshot recovery", () => {
  const state = reduce(controllerWithSnapshot(), {
    type: GAME_CONTROLLER_ACTIONS.REALTIME_EVENT_RECEIVED,
    event: realtimeEvent(3, { eventType: "FUTURE_EVENT", unsupported: "FUTURE_EVENT" }),
  });
  assert.equal(state.snapshotRefreshRequired, true);
  assert.equal(state.latestObservedEventVersion, 3);
});

test("defensively malformed event is ignored", () => {
  const state = controllerWithSnapshot();
  const result = reduce(state, {
    type: GAME_CONTROLLER_ACTIONS.REALTIME_EVENT_RECEIVED,
    event: { gameId: 101, stateVersion: 3 },
  });
  assert.equal(result, state);
});

test("snapshot catching observed event clears refresh signal", () => {
  let state = reduce(controllerWithSnapshot(), {
    type: GAME_CONTROLLER_ACTIONS.REALTIME_EVENT_RECEIVED,
    event: realtimeEvent(3),
  });
  state = reduce(state, {
    type: GAME_CONTROLLER_ACTIONS.SNAPSHOT_ACCEPTED,
    snapshot: acceptedSnapshot({ stateVersion: 3 }),
  });
  assert.equal(state.snapshotRefreshRequired, false);
  assert.equal(state.recovery.required, false);
});

test("partial snapshot catch-up retains later event refresh signal", () => {
  let state = reduce(controllerWithSnapshot(), {
    type: GAME_CONTROLLER_ACTIONS.REALTIME_EVENT_RECEIVED,
    event: realtimeEvent(4),
  });
  state = reduce(state, {
    type: GAME_CONTROLLER_ACTIONS.SNAPSHOT_ACCEPTED,
    snapshot: acceptedSnapshot({ stateVersion: 3 }),
  });
  assert.equal(state.latestObservedEventVersion, 4);
  assert.equal(state.snapshotRefreshRequired, true);
  assert.equal(state.recovery.required, true);
});

test("explicit recovery requests a snapshot without performing side effects", () => {
  const state = reduce(controllerWithSnapshot(), {
    type: GAME_CONTROLLER_ACTIONS.RECOVERY_STARTED,
    reason: GAME_RECOVERY_REASON.EXPLICIT,
  });
  assert.equal(isRecoveryRequired(state), true);
  assert.equal(isSnapshotRefreshRequired(state), true);
});

test("reset clears command lifecycle", () => {
  const state = reduce(startCommand(controllerWithSnapshot()), {
    type: GAME_CONTROLLER_ACTIONS.RESET,
    gameId: 101,
  });
  assert.equal(state.command.status, GAME_COMMAND_STATUS.IDLE);
  assert.equal(state.command.commandId, null);
});

test("reset clears recovery lifecycle", () => {
  const recovering = reduce(controllerWithSnapshot(), {
    type: GAME_CONTROLLER_ACTIONS.RECOVERY_STARTED,
  });
  const state = reduce(recovering, { type: GAME_CONTROLLER_ACTIONS.RESET, gameId: 101 });
  assert.equal(state.recovery.required, false);
  assert.equal(state.snapshotRefreshRequired, false);
});

test("reset clears observed event metadata", () => {
  const observed = reduce(controllerWithSnapshot(), {
    type: GAME_CONTROLLER_ACTIONS.REALTIME_EVENT_RECEIVED,
    event: realtimeEvent(3),
  });
  const state = reduce(observed, { type: GAME_CONTROLLER_ACTIONS.RESET, gameId: 101 });
  assert.equal(state.latestObservedEventVersion, null);
  assert.equal(state.recovery.eventGap, null);
});

test("reducer leaves previous state unchanged", () => {
  const previous = controllerWithSnapshot();
  const before = structuredClone(previous);
  reduce(previous, {
    type: GAME_CONTROLLER_ACTIONS.REALTIME_EVENT_RECEIVED,
    event: realtimeEvent(3),
  });
  assert.deepEqual(previous, before);
});

test("reducer leaves input snapshot unchanged", () => {
  const snapshot = acceptedSnapshot({ stateVersion: 3 });
  const before = structuredClone(snapshot);
  reduce(controllerWithSnapshot(), {
    type: GAME_CONTROLLER_ACTIONS.SNAPSHOT_ACCEPTED,
    snapshot,
  });
  assert.deepEqual(snapshot, before);
});

test("reducer leaves input error unchanged and stores bounded safe facts", () => {
  const error = {
    code: "NETWORK",
    httpStatus: null,
    retriable: true,
    cause: { secret: "not-controller-state" },
  };
  const before = structuredClone(error);
  const state = reduce(startCommand(controllerWithSnapshot()), {
    type: GAME_CONTROLLER_ACTIONS.COMMAND_FAILED,
    commandId: "command-a",
    error,
  });
  assert.deepEqual(error, before);
  assert.equal("cause" in state.command.error, false);
  assert.equal(Object.isFrozen(state.command.error), true);
});

test("reducer leaves input realtime event unchanged", () => {
  const event = realtimeEvent(3);
  const before = structuredClone(event);
  reduce(controllerWithSnapshot(), {
    type: GAME_CONTROLLER_ACTIONS.REALTIME_EVENT_RECEIVED,
    event,
  });
  assert.deepEqual(event, before);
});

test("selectors expose the bounded controller lifecycle", () => {
  const state = startCommand(controllerWithSnapshot());
  assert.equal(getAcceptedSnapshot(state), state.snapshot);
  assert.equal(getAcceptedVersion(state), 2);
  assert.equal(getExpectedCommandVersion(state), 2);
  assert.equal(getCommandLifecycle(state), state.command);
  assert.equal(getConnectionState(state), state.connection);
  assert.equal(isRecoveryRequired(state), false);
});

test("accepted controller snapshot feeds ownership and GameViewModel unchanged", () => {
  const state = controllerWithSnapshot();
  const ownership = deriveOwnershipProjection(state.snapshot);
  const model = buildGameViewModel({
    snapshot: state.snapshot,
    viewerPlayerId: 101,
    ownership,
    commandState: { pending: false, errorCode: null },
    connectionState: state.connection.status,
  });
  assert.equal(model.gameId, 101);
  assert.equal(model.stateVersion, 2);
  assert.equal(model.players.length, 2);
  assert.equal(model.action.enabled, true);
});

test("pending controller command maps into existing presentation contract", () => {
  const state = startCommand(controllerWithSnapshot());
  const model = buildGameViewModel({
    snapshot: state.snapshot,
    viewerPlayerId: 101,
    ownership: deriveOwnershipProjection(state.snapshot),
    commandState: { pending: state.command.status === GAME_COMMAND_STATUS.PENDING },
    connectionState: state.connection.status,
  });
  assert.equal(model.action.pending, true);
  assert.equal(model.action.enabled, false);
});

test("event gap metadata can drive presentation history without storing it", () => {
  const controller = reduce(controllerWithSnapshot(), {
    type: GAME_CONTROLLER_ACTIONS.REALTIME_EVENT_RECEIVED,
    event: realtimeEvent(5),
  });
  const history = markEventHistoryGap(createEventHistoryState(101), getEventGap(controller));
  assert.equal(history.entries.length, 1);
  assert.equal(controller.recovery.eventGap.stateVersion, 5);
  assert.equal("entries" in controller, false);
});

test("reducer has no React, transport, scene, DOM, content, CSS, or backend dependency", () => {
  assert.doesNotMatch(
    reducerSource,
    /from\s+["'][^"']*(react|apiClient|stomp|sockjs|three|content|\.css|redis|backend)/i,
  );
  assert.doesNotMatch(reducerSource, /fetch\(|document\.|window\./);
});

test("reducer contains no game-rule, winner, rent, or price calculation", () => {
  assert.doesNotMatch(reducerSource, /calculate|afford|winner|rent|price|capital/i);
});

test("reducer contains no timers, promises, random IDs, or side-effect factories", () => {
  assert.doesNotMatch(
    reducerSource,
    /setTimeout|setInterval|Promise|randomUUID|crypto\.|new\s+WebSocket|new\s+Client/,
  );
});
