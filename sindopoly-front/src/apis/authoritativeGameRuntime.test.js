import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  AuthoritativeGameRuntime,
  buildRollPresentationIdentity,
} from "../features/game/controller/AuthoritativeGameRuntime.js";
import { GAME_CONNECTION_STATUS } from "../features/game/controller/gameControllerReducer.js";
import { ACTION_KINDS } from "../features/game/presentation/gameViewModel.js";
import { PRESENTATION_PHASES } from "../features/game/presentation/presentationTransaction.js";
import { createBoardMetadataPayload } from "../test-fixtures/boardMetadataFixtures.js";
import {
  endedGameSnapshot,
  inProgressSnapshot,
  purchaseOptionalActionSnapshot,
  turnUpdatedEvent,
} from "../test-fixtures/gameRealtimeFixtures.js";

test("runtime establishes realtime observation before the first authoritative snapshot", async () => {
  const harness = createHarness();
  const runtime = harness.createRuntime();
  runtime.start();

  assert.deepEqual(harness.order, ["metadata", "realtime:start", "poll:start"]);
  assert.equal(harness.snapshotCalls, 0);
  harness.realtime.subscribed();
  await flush();

  assert.equal(harness.snapshotCalls, 1);
  assert.equal(runtime.getState().controller.snapshot, inProgressSnapshot);
  assert.equal(runtime.getState().viewModel.viewer.playerId, 101);
  assert.equal(runtime.getState().viewModel.action.kind, ACTION_KINDS.ROLL);
  assert.equal(runtime.getState().metadata.status, "READY");
  assert.equal(harness.scene.calls.setPawnPositions.length, 1);
  assert.deepEqual(harness.order.slice(0, 5), [
    "metadata", "realtime:start", "poll:start", "realtime:subscribed", "snapshot",
  ]);
});

test("newer event bursts coalesce reads and late older snapshots cannot roll state back", async () => {
  const firstRefresh = deferred();
  const snapshots = [inProgressSnapshot, firstRefresh.promise, {
    ...inProgressSnapshot,
    stateVersion: 4,
    playerTurn: 102,
  }];
  const harness = createHarness({ snapshots });
  const runtime = harness.createRuntime();
  runtime.start();
  harness.realtime.subscribed();
  await flush();

  harness.realtime.event(eventAtVersion(3));
  harness.realtime.event(eventAtVersion(4));
  await flush();
  assert.equal(harness.snapshotCalls, 2, "one refresh is in flight for the burst");

  firstRefresh.resolve({ ...inProgressSnapshot, stateVersion: 3 });
  await flush(6);
  assert.equal(harness.snapshotCalls, 3, "the newest observed version gets one follow-up read");
  assert.equal(runtime.getState().controller.acceptedVersion, 4);

  assert.equal(runtime.acceptSnapshot({ ...inProgressSnapshot, stateVersion: 2 }), false);
  assert.equal(runtime.getState().controller.acceptedVersion, 4);
});

test("roll uses the accepted version, blocks double activation and reconciles by snapshot", async () => {
  const command = deferred();
  const afterRoll = {
    ...inProgressSnapshot,
    stateVersion: 3,
    playerTurn: 102,
    players: inProgressSnapshot.players.map(player => player.playerId === 101
      ? { ...player, position: 12 }
      : player),
  };
  const harness = createHarness({
    snapshots: [inProgressSnapshot, afterRoll],
    roll: () => command.promise,
  });
  const runtime = harness.createRuntime();
  runtime.start();
  harness.realtime.subscribed();
  await flush();

  const first = runtime.primaryAction();
  const duplicate = await runtime.primaryAction();
  assert.equal(duplicate, false);
  assert.equal(harness.commands.roll.length, 1);
  assert.deepEqual(harness.commands.roll[0].command, {
    commandId: "command-1",
    expectedVersion: 2,
  });
  assert.equal(runtime.getState().viewModel.action.pending, true);

  command.resolve(rollResult({ stateVersion: 3, newPosition: 12 }));
  assert.equal(await first, true);
  await flush(6);

  assert.equal(harness.scene.calls.dice.length, 1);
  assert.equal(harness.scene.calls.movement.length, 1);
  assert.equal(harness.scene.calls.movement[0].mode, "DIRECT");
  assert.equal(runtime.getState().controller.acceptedVersion, 3);
  assert.equal(runtime.getState().viewModel.action.kind, ACTION_KINDS.WAITING);
});

test("command response and matching STOMP echo share one deterministic presentation", async () => {
  const afterRoll = { ...inProgressSnapshot, stateVersion: 3 };
  const result = rollResult({ stateVersion: 3, newPosition: 12 });
  const event = eventAtVersion(3, { fromPosition: 6, toPosition: 12 });
  const harness = createHarness({ snapshots: [inProgressSnapshot, afterRoll], roll: () => result });
  const runtime = harness.createRuntime();
  runtime.start();
  harness.realtime.subscribed();
  await flush();

  await runtime.primaryAction();
  harness.realtime.event(event);
  await flush(6);

  assert.equal(buildRollPresentationIdentity({
    gameId: 101, stateVersion: 3, actorPlayerId: 101, die1: 2, die2: 4,
  }), "roll:101:3:101:2:4");
  assert.equal(harness.scene.calls.dice.length, 1);
  assert.equal(runtime.getState().history.entries.length, 1);
});

test("observer event presents confirmed dice once, records history and wakes reconciliation", async () => {
  const afterRoll = { ...inProgressSnapshot, stateVersion: 3, playerTurn: 102 };
  const harness = createHarness({ snapshots: [inProgressSnapshot, afterRoll], viewerPlayerId: 102 });
  const runtime = harness.createRuntime();
  runtime.start();
  harness.realtime.subscribed();
  await flush();

  const event = eventAtVersion(3);
  harness.realtime.event(event);
  harness.realtime.event(event);
  await flush(6);

  assert.equal(harness.scene.calls.dice.length, 1);
  assert.equal(runtime.getState().history.entries.length, 1);
  assert.equal(runtime.getState().controller.acceptedVersion, 3);
  assert.equal(runtime.getState().viewModel.viewer.playerId, 102);
  assert.equal(runtime.getState().viewModel.action.kind, ACTION_KINDS.ROLL);
});

test("stale command is never retried and fresh reconciliation restores readiness", async () => {
  const stale = Object.assign(new Error("stale"), {
    code: "STALE_STATE", httpStatus: 409, stateVersion: 3, retriable: false,
  });
  const fresh = { ...inProgressSnapshot, stateVersion: 3 };
  const harness = createHarness({ snapshots: [inProgressSnapshot, fresh], roll: () => Promise.reject(stale) });
  const runtime = harness.createRuntime();
  runtime.start();
  harness.realtime.subscribed();
  await flush();

  assert.equal(await runtime.primaryAction(), false);
  await flush(6);

  assert.equal(harness.commands.roll.length, 1);
  assert.equal(harness.snapshotCalls, 2);
  assert.equal(runtime.getState().controller.acceptedVersion, 3);
  assert.equal(runtime.getState().viewModel.action.enabled, true);
});

test("ambiguous command failure requires reconciliation without blind retry", async () => {
  const network = Object.assign(new Error("network"), {
    code: "NETWORK", retriable: true,
  });
  const harness = createHarness({
    snapshots: [inProgressSnapshot, { ...inProgressSnapshot, stateVersion: 3 }],
    roll: () => Promise.reject(network),
  });
  const runtime = harness.createRuntime();
  runtime.start();
  harness.realtime.subscribed();
  await flush();

  assert.equal(await runtime.primaryAction(), false);
  await flush(6);
  assert.equal(harness.commands.roll.length, 1);
  assert.equal(harness.snapshotCalls, 2);
  assert.equal(runtime.getState().controller.command.status, "IDLE");
});

test("server-owned purchase choice uses ActionTray intent and explicit command authority", async () => {
  const resolved = {
    ...purchaseOptionalActionSnapshot,
    stateVersion: 4,
    optionalAction: null,
    playerTurn: 102,
  };
  const harness = createHarness({ snapshots: [purchaseOptionalActionSnapshot, resolved] });
  const runtime = harness.createRuntime();
  runtime.start();
  harness.realtime.subscribed();
  await flush();

  assert.equal(runtime.getState().viewModel.action.kind, ACTION_KINDS.PURCHASE_PROPERTY);
  assert.equal(await runtime.primaryAction(), true);
  await flush(6);
  assert.deepEqual(harness.commands.resolve[0].command, {
    commandId: "command-1", expectedVersion: 3,
  });
  assert.equal(harness.commands.resolve[0].accept, true);
});

test("decline uses the single secondary command owner and observer gets no control", async () => {
  const resolved = {
    ...purchaseOptionalActionSnapshot,
    stateVersion: 4,
    optionalAction: null,
    playerTurn: 102,
  };
  const activeHarness = createHarness({ snapshots: [purchaseOptionalActionSnapshot, resolved] });
  const active = activeHarness.createRuntime();
  active.start();
  activeHarness.realtime.subscribed();
  await flush();
  assert.equal(await active.secondaryAction(), true);
  await flush(6);
  assert.equal(activeHarness.commands.pass.length, 1);
  assert.deepEqual(activeHarness.commands.pass[0].command, {
    commandId: "command-1", expectedVersion: 3,
  });

  const observerHarness = createHarness({
    snapshots: [purchaseOptionalActionSnapshot], viewerPlayerId: 102,
  });
  const observer = observerHarness.createRuntime();
  observer.start();
  observerHarness.realtime.subscribed();
  await flush();
  assert.equal(observer.getState().viewModel.action.kind, ACTION_KINDS.WAITING);
  assert.equal(await observer.primaryAction(), false);
  assert.equal(await observer.secondaryAction(), false);
  assert.equal(observerHarness.commands.resolve.length + observerHarness.commands.pass.length, 0);
});

test("two isolated clients converge after one roll and present the same pair once", async () => {
  const afterRoll = {
    ...inProgressSnapshot,
    stateVersion: 3,
    playerTurn: 102,
    players: inProgressSnapshot.players.map(player => player.playerId === 101
      ? { ...player, position: 12 }
      : player),
  };
  const hostHarness = createHarness({ snapshots: [inProgressSnapshot, afterRoll] });
  const guestHarness = createHarness({
    snapshots: [inProgressSnapshot, afterRoll], viewerPlayerId: 102,
  });
  const host = hostHarness.createRuntime();
  const guest = guestHarness.createRuntime();
  host.start();
  guest.start();
  hostHarness.realtime.subscribed();
  guestHarness.realtime.subscribed();
  await flush();

  assert.equal(host.getState().viewModel.action.kind, ACTION_KINDS.ROLL);
  assert.equal(guest.getState().viewModel.action.kind, ACTION_KINDS.WAITING);
  assert.equal(await host.primaryAction(), true);
  const event = eventAtVersion(3);
  hostHarness.realtime.event(event);
  guestHarness.realtime.event(event);
  await flush(8);

  assert.equal(hostHarness.commands.roll.length, 1);
  assert.equal(guestHarness.commands.roll.length, 0);
  assert.deepEqual(hostHarness.scene.calls.dice[0], guestHarness.scene.calls.dice[0]);
  assert.equal(hostHarness.scene.calls.dice.length, 1);
  assert.equal(guestHarness.scene.calls.dice.length, 1);
  assert.equal(host.getState().controller.acceptedVersion, 3);
  assert.equal(guest.getState().controller.acceptedVersion, 3);
  assert.equal(host.getState().viewModel.activePlayer.playerId, 102);
  assert.equal(guest.getState().viewModel.activePlayer.playerId, 102);
});

test("polling is one bounded fallback, never polls metadata, and cleans up", async () => {
  const harness = createHarness({ snapshots: [inProgressSnapshot, inProgressSnapshot] });
  const runtime = harness.createRuntime();
  runtime.start();
  assert.equal(harness.polls.length, 1);
  assert.equal(harness.metadataCalls, 1);

  await harness.polls[0].callback();
  assert.equal(harness.snapshotCalls, 1, "offline fallback can obtain authority");
  assert.equal(harness.metadataCalls, 1);

  harness.realtime.subscribed();
  await flush();
  const connectedCalls = harness.snapshotCalls;
  await harness.polls[0].callback();
  assert.equal(harness.snapshotCalls, connectedCalls, "connected transport suppresses fallback reads");

  runtime.dispose();
  assert.equal(harness.polls[0].cleared, true);
  assert.equal(harness.realtime.disposeCalls, 1);
});

test("reconnect cancels transient work, snaps accepted positions and adds no false gap", async () => {
  const dice = deferred();
  const harness = createHarness({
    snapshots: [
      inProgressSnapshot,
      inProgressSnapshot,
      { ...inProgressSnapshot, stateVersion: 3 },
    ],
    dice: () => dice.promise,
  });
  const runtime = harness.createRuntime();
  runtime.start();
  harness.realtime.subscribed();
  await flush();
  harness.realtime.event(eventAtVersion(3));
  await flush();

  harness.realtime.connection(GAME_CONNECTION_STATUS.RECONNECTING);
  harness.realtime.subscribed();
  await flush(6);
  dice.resolve(true);
  await flush();

  assert.ok(harness.scene.calls.cancelDice.length >= 1);
  assert.ok(harness.scene.calls.snap.length >= 2);
  assert.equal(runtime.getState().history.entries.some(entry => entry.kind === "HISTORY_GAP"), false);
});

test("dispose suppresses late reads, outcome callbacks and duplicate remount resources", async () => {
  const snapshot = deferred();
  const harness = createHarness({ snapshots: [snapshot.promise] });
  const runtime = harness.createRuntime();
  let notifications = 0;
  runtime.subscribe(() => { notifications += 1; });
  runtime.start();
  harness.realtime.subscribed();
  await flush();
  runtime.dispose();
  const afterDispose = notifications;
  snapshot.resolve(inProgressSnapshot);
  await flush(6);

  assert.equal(notifications, afterDispose);
  assert.equal(runtime.getState().presentationPhase, PRESENTATION_PHASES.IDLE);
  assert.equal(harness.polls[0].cleared, true);
  assert.equal(harness.realtime.disposeCalls, 1);
});

test("terminal and deadline facts survive the live controller path", async () => {
  const harness = createHarness({ snapshots: [endedGameSnapshot] });
  const runtime = harness.createRuntime();
  runtime.start();
  harness.realtime.subscribed();
  await flush();

  assert.equal(runtime.getState().viewModel.completion.available, true);
  assert.equal(runtime.getState().viewModel.completion.winnerPlayerId, 101);
  assert.equal(runtime.getState().viewModel.turn.turnDeadlineEpochMs, null);
});

test("production source has one enabled owner and preserves layer boundaries", async () => {
  const [runtimeSource, hookSource, gameSource, boardSource] = await Promise.all([
    readFile(new URL("../features/game/controller/AuthoritativeGameRuntime.js", import.meta.url), "utf8"),
    readFile(new URL("../hooks/useAuthoritativeGame.js", import.meta.url), "utf8"),
    readFile(new URL("../pages/Game/Game.jsx", import.meta.url), "utf8"),
    readFile(new URL("../pages/Game/GameBoard.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(gameSource, /FIRST_VERTICAL_SLICE_ENABLED\s*=\s*true/u);
  assert.match(gameSource, /AuthoritativeGame/u);
  assert.doesNotMatch(boardSource, /TurnAPI|GameAPI|useGameRealtime|setInterval|PresentationCoordinator/u);
  assert.doesNotMatch(runtimeSource, /@stomp|sockjs|three|Redis|MariaDB/u);
  assert.doesNotMatch(hookSource, /calculateRent|purchasePrice|winnerPlayerId|Math\.random/u);
});

function createHarness({
  snapshots = [inProgressSnapshot],
  viewerPlayerId = 101,
  roll = () => rollResult({ stateVersion: 3, newPosition: 12 }),
  dice = () => true,
} = {}) {
  const order = [];
  const queue = [...snapshots];
  const commands = { roll: [], resolve: [], pass: [] };
  const scene = scenePort({ dice });
  const realtime = realtimeHarness(order);
  const polls = [];
  let snapshotCalls = 0;
  let metadataCalls = 0;
  let commandSequence = 0;

  const harness = {
    order,
    commands,
    scene,
    realtime,
    polls,
    get snapshotCalls() { return snapshotCalls; },
    get metadataCalls() { return metadataCalls; },
    createRuntime() {
      return new AuthoritativeGameRuntime({
        gameId: 101,
        viewerPlayerId,
        scene,
        fetchSnapshot: async () => {
          snapshotCalls += 1;
          order.push("snapshot");
          const value = queue.length > 1 ? queue.shift() : queue[0];
          return await value;
        },
        fetchBoardMetadata: async () => {
          metadataCalls += 1;
          order.push("metadata");
          return createBoardMetadataPayload();
        },
        createRealtime: callbacks => realtime.connect(callbacks),
        commands: {
          async roll(gameId, playerId, command) {
            commands.roll.push({ gameId, playerId, command });
            return await roll();
          },
          async resolve(gameId, playerId, accept, command) {
            commands.resolve.push({ gameId, playerId, accept, command });
            return actionResult(4);
          },
          async pass(gameId, playerId, command) {
            commands.pass.push({ gameId, playerId, command });
            return actionResult(4);
          },
        },
        createCommandId: () => `command-${++commandSequence}`,
        setPollInterval(callback, milliseconds) {
          order.push("poll:start");
          const poll = { callback, milliseconds, cleared: false };
          polls.push(poll);
          return poll;
        },
        clearPollInterval(poll) { poll.cleared = true; },
        reducedMotion: false,
      });
    },
  };
  return harness;
}

function realtimeHarness(order) {
  let callbacks;
  return {
    disposeCalls: 0,
    connect(value) {
      callbacks = value;
      return {
        start: () => order.push("realtime:start"),
        dispose: () => { this.disposeCalls += 1; },
      };
    },
    subscribed() {
      order.push("realtime:subscribed");
      return callbacks.onSubscribed();
    },
    event(value) { return callbacks.onEvent(value); },
    connection(value) { return callbacks.onConnectionChanged(value); },
  };
}

function scenePort({ dice }) {
  const calls = {
    dice: [], movement: [], snap: [], setPawnPositions: [], cancelDice: [], cancelPawn: [],
  };
  return {
    calls,
    presentDiceRollAndWait(value) { calls.dice.push(value); return dice(value); },
    presentPawnMovement(value) { calls.movement.push(value); return true; },
    snapPawnPosition(value) { calls.snap.push(value); return true; },
    setPawnPositions(value) { calls.setPawnPositions.push(value); return true; },
    orientCameraForPosition() { return true; },
    cancelDicePresentation(value) { calls.cancelDice.push(value); return true; },
    cancelPawnPresentation(value) { calls.cancelPawn.push(value); return true; },
  };
}

function rollResult(overrides = {}) {
  return {
    dice: 6,
    die1: 2,
    die2: 4,
    total: 6,
    newPosition: 12,
    passedGo: false,
    squareType: 9,
    data: 0,
    stateVersion: 3,
    replayed: false,
    card: null,
    ...overrides,
  };
}

function actionResult(stateVersion) {
  return {
    newBalance: 1400,
    acquiredProperties: [6],
    nextPlayerId: 102,
    stateVersion,
    replayed: false,
  };
}

function eventAtVersion(stateVersion, movement = { fromPosition: 6, toPosition: 12 }) {
  return {
    ...structuredClone(turnUpdatedEvent),
    eventId: `event-${stateVersion}`,
    stateVersion,
    payload: {
      ...structuredClone(turnUpdatedEvent.payload),
      details: turnUpdatedEvent.payload.details.map(detail => detail.type === "PLAYER_MOVED"
        ? { ...detail, ...movement }
        : detail),
    },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

async function flush(times = 3) {
  for (let index = 0; index < times; index += 1) await Promise.resolve();
}
