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
  jailedPlayerSnapshot,
  postTimeoutSnapshot,
  purchaseOptionalActionSnapshot,
  turnTimeoutEvent,
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
  assert.equal(harness.scene.calls.movement[0].mode, "FORWARD");
  assert.equal(runtime.getState().controller.acceptedVersion, 3);
  assert.equal(runtime.getState().viewModel.action.kind, ACTION_KINDS.WAITING);
});

test("replayed command response and matching STOMP echo share one deterministic presentation", async () => {
  const afterRoll = { ...inProgressSnapshot, stateVersion: 3 };
  const result = rollResult({ stateVersion: 3, newPosition: 12, replayed: true });
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
  assert.equal(harness.scene.calls.movement.length, 1);
  assert.equal(harness.scene.calls.movement[0].mode, "FORWARD");
  assert.deepEqual(harness.scene.calls.movement[0].route, [7, 8, 9, 10, 11, 12]);
  assert.equal(harness.commands.roll.length, 1);
  assert.equal(runtime.getState().history.entries.length, 1);
});

test("dice-mismatched transport remains DIRECT instead of inventing a forward route", async () => {
  const afterTransport = { ...inProgressSnapshot, stateVersion: 3, playerTurn: 102 };
  const harness = createHarness({ snapshots: [inProgressSnapshot, afterTransport], viewerPlayerId: 102 });
  const runtime = harness.createRuntime();
  runtime.start();
  harness.realtime.subscribed();
  await flush();

  harness.realtime.event(eventAtVersion(3, { fromPosition: 6, toPosition: 30 }));
  await flush(6);

  assert.equal(harness.scene.calls.movement.length, 1);
  assert.equal(harness.scene.calls.movement[0].mode, "DIRECT");
  assert.equal(harness.scene.calls.movement[0].route, null);
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

test("ambiguous command failures require reconciliation without blind retry", async () => {
  for (const code of ["NETWORK", "SERVER", "INVALID_PAYLOAD"]) {
    const failure = Object.assign(new Error(code), { code, retriable: code === "NETWORK" });
    const harness = createHarness({
      snapshots: [inProgressSnapshot, { ...inProgressSnapshot, stateVersion: 3 }],
      roll: () => Promise.reject(failure),
    });
    const runtime = harness.createRuntime();
    runtime.start();
    harness.realtime.subscribed();
    await flush();

    assert.equal(await runtime.primaryAction(), false, code);
    await flush(6);
    assert.equal(harness.commands.roll.length, 1, code);
    assert.equal(harness.snapshotCalls, 2, code);
    assert.equal(runtime.getState().controller.command.status, "IDLE", code);
    runtime.dispose();
  }
});

test("authoritative roll outcomes cover every supported backend square result without rule inference", async () => {
  const scenarios = [
    {
      label: "movement card",
      result: { squareType: 1, data: 6, newPosition: 6, card: card("transport", 6, "Πήγαινε στη ΣΤΑΣΗ ΔΙΠΑΕ.") },
      includes: ["Πήγαινε στη ΣΤΑΣΗ ΔΙΠΑΕ.", "Τετράγωνο 6"],
    },
    {
      label: "money-gain card",
      result: { squareType: 2, data: 50, newPosition: 2, card: card("money", 50, "Κέρδισες υποτροφία.") },
      includes: ["Κέρδισες υποτροφία.", "+50€"],
    },
    {
      label: "money-loss card",
      result: { squareType: 2, data: -30, newPosition: 2, card: card("money", -30, "Πλήρωσε έξοδα.") },
      includes: ["Πλήρωσε έξοδα.", "-30€"],
    },
    {
      label: "rent",
      result: { squareType: 3, data: 25, newPosition: 3 },
      includes: ["25€", "BaselineGuest"],
    },
    {
      label: "purchase offer",
      result: { squareType: 5, data: 101, newPosition: 1 },
      includes: ["ΓΥΜΝΑΣΤΗΡΙΟ", "101€"],
    },
    {
      label: "tax",
      result: { squareType: 6, data: 200, newPosition: 4 },
      includes: ["Τετράγωνο 4", "200€"],
    },
    {
      label: "go to jail",
      result: { squareType: 7, data: -1, newPosition: 10 },
      includes: ["ΦΥΛΑΚΗ"],
    },
    {
      label: "jail visit",
      result: { squareType: 8, data: -1, newPosition: 10 },
      includes: ["ΦΥΛΑΚΗ"],
    },
    {
      label: "free parking",
      result: { squareType: 9, data: -1, newPosition: 20 },
      includes: ["ΝΑΥΤΙΛΟΣ"],
    },
  ];

  for (const scenario of scenarios) {
    const state = await runRollOutcome(scenario.result);
    assert.ok(state.outcome, scenario.label);
    for (const expected of scenario.includes) {
      assert.equal(state.outcome.text.includes(expected), true, scenario.label);
    }
  }
});

test("type-four outcomes distinguish Start from an ordinary no-transaction property landing", async () => {
  const ownProperty = await runRollOutcome({
    squareType: 4, data: -1, newPosition: 1, passedGo: false,
  });
  assert.match(ownProperty.outcome.text, /ΓΥΜΝΑΣΤΗΡΙΟ/u);
  assert.doesNotMatch(ownProperty.outcome.text, /ΑΦΕΤΗΡΙΑ|-1€/u);

  const exactStart = await runRollOutcome({
    squareType: 4, data: 237, newPosition: 0, passedGo: true,
  });
  assert.match(exactStart.outcome.text, /ΑΦΕΤΗΡΙΑ/u);
  assert.match(exactStart.outcome.text, /237€/u);
});

test("passing Start preserves the landing outcome without copying the backend reward amount", async () => {
  const state = await runRollOutcome({
    squareType: 5, data: 101, newPosition: 1, passedGo: true,
  });
  assert.match(state.outcome.text, /ΑΦΕΤΗΡΙΑ/u);
  assert.match(state.outcome.text, /ΓΥΜΝΑΣΤΗΡΙΟ/u);
  assert.match(state.outcome.text, /101€/u);
  assert.doesNotMatch(state.outcome.text, /200€/u);
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

test("jail payment and decline remain server-owned optional actions", async () => {
  const paid = {
    ...jailedPlayerSnapshot,
    stateVersion: 9,
    optionalAction: null,
    players: jailedPlayerSnapshot.players.map(player => player.playerId === 101
      ? { ...player, money: 1390, jailed: false, jailTurnsRemaining: 0 }
      : player),
  };
  const paymentHarness = createHarness({
    snapshots: [jailedPlayerSnapshot, paid],
    resolve: () => actionResult(9),
  });
  const payment = paymentHarness.createRuntime();
  payment.start();
  paymentHarness.realtime.subscribed();
  await flush();

  assert.equal(payment.getState().viewModel.action.kind, ACTION_KINDS.PAY_JAIL_EXIT);
  assert.equal(payment.getState().viewModel.action.cost, 50);
  assert.equal(await payment.primaryAction(), true);
  await flush(6);
  assert.equal(paymentHarness.commands.resolve[0].accept, true);
  assert.equal(payment.getState().viewModel.viewer.player.jailed, false);
  assert.equal(payment.getState().viewModel.viewer.player.money, 1390);
  assert.equal(payment.getState().viewModel.action.kind, ACTION_KINDS.ROLL);

  const declined = {
    ...jailedPlayerSnapshot,
    stateVersion: 9,
    playerTurn: 102,
    optionalAction: null,
  };
  const declineHarness = createHarness({
    snapshots: [jailedPlayerSnapshot, declined],
    pass: () => actionResult(9),
  });
  const decline = declineHarness.createRuntime();
  decline.start();
  declineHarness.realtime.subscribed();
  await flush();
  assert.equal(await decline.secondaryAction(), true);
  await flush(6);
  assert.equal(declineHarness.commands.pass.length, 1);
  assert.equal(decline.getState().viewModel.viewer.player.jailed, true);
  assert.equal(decline.getState().viewModel.activePlayer.playerId, 102);
});

test("timeout event records the fact and reconciles the authoritative handoff", async () => {
  const harness = createHarness({ snapshots: [inProgressSnapshot, postTimeoutSnapshot] });
  const runtime = harness.createRuntime();
  runtime.start();
  harness.realtime.subscribed();
  await flush();

  harness.realtime.event(turnTimeoutEvent);
  await flush(8);

  assert.equal(runtime.getState().controller.acceptedVersion, 9);
  assert.equal(runtime.getState().viewModel.activePlayer.playerId, 102);
  assert.equal(runtime.getState().viewModel.turn.turnDeadlineEpochMs, postTimeoutSnapshot.turnDeadlineEpochMs);
  assert.equal(runtime.getState().history.entries.some(entry => /χρόνος έληξε/u.test(entry.text)), true);
  assert.equal(harness.commands.roll.length + harness.commands.resolve.length + harness.commands.pass.length, 0);
});

test("player removal event reconciles remaining and removed-player views", async () => {
  const afterLeave = {
    ...inProgressSnapshot,
    stateVersion: 3,
    playerTurn: 102,
    players: [inProgressSnapshot.players[1]],
  };
  const leaveEvent = {
    eventId: "event-player-left",
    eventType: "TURN_UPDATED",
    gameId: 101,
    stateVersion: 3,
    occurredAt: "2026-09-01T10:05:00Z",
    payload: {
      reason: "PLAYER_LEFT",
      actorPlayerId: 101,
      details: [{ type: "TURN_CHANGED", nextPlayerId: 102 }],
    },
  };
  const removedHarness = createHarness({ snapshots: [inProgressSnapshot, afterLeave] });
  const remainingHarness = createHarness({
    snapshots: [inProgressSnapshot, afterLeave], viewerPlayerId: 102,
  });
  const removed = removedHarness.createRuntime();
  const remaining = remainingHarness.createRuntime();
  removed.start();
  remaining.start();
  removedHarness.realtime.subscribed();
  remainingHarness.realtime.subscribed();
  await flush();
  removedHarness.realtime.event(leaveEvent);
  remainingHarness.realtime.event(leaveEvent);
  await flush(8);

  assert.equal(removed.getState().viewModel.viewer.present, false);
  assert.equal(removed.getState().viewModel.action.kind, ACTION_KINDS.NONE);
  assert.equal(remaining.getState().viewModel.viewer.present, true);
  assert.equal(remaining.getState().viewModel.action.kind, ACTION_KINDS.ROLL);
  assert.equal(remaining.getState().viewModel.players.length, 1);
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

test("three- and four-player snapshots preserve order, ownership, active turn and pawn facts", async () => {
  const extraPlayers = [
    gamePlayer(103, "Third", 21, 1320, [11]),
    gamePlayer(104, "Fourth", 31, 1280, [15]),
  ];
  for (const playerCount of [3, 4]) {
    const players = [...inProgressSnapshot.players, ...extraPlayers].slice(0, playerCount);
    const activePlayer = players.at(-1);
    const snapshot = {
      ...inProgressSnapshot,
      stateVersion: 10 + playerCount,
      playerTurn: activePlayer.playerId,
      players,
    };
    const harness = createHarness({ snapshots: [snapshot], viewerPlayerId: activePlayer.playerId });
    const runtime = harness.createRuntime();
    runtime.start();
    harness.realtime.subscribed();
    await flush();

    const state = runtime.getState();
    assert.deepEqual(state.viewModel.players.map(player => player.playerId),
      players.map(player => player.playerId));
    assert.equal(state.viewModel.activePlayer.playerId, activePlayer.playerId);
    assert.equal(state.viewModel.action.kind, ACTION_KINDS.ROLL);
    assert.deepEqual(state.viewModel.properties.map(property => property.squareId), [1, 3, 11, 15].slice(0, playerCount));
    assert.deepEqual(harness.scene.calls.setPawnPositions[0], players);
    runtime.dispose();
  }
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
  assert.match(gameSource, /AuthoritativeGame/u);
  assert.doesNotMatch(gameSource, /FIRST_VERTICAL_SLICE_ENABLED|legacyBoard|<Board/u);
  assert.doesNotMatch(boardSource, /TurnAPI|GameAPI|useGameRealtime|setInterval|PresentationCoordinator/u);
  assert.doesNotMatch(runtimeSource, /@stomp|sockjs|three|Redis|MariaDB/u);
  assert.doesNotMatch(hookSource, /calculateRent|purchasePrice|winnerPlayerId|Math\.random/u);
});

function createHarness({
  snapshots = [inProgressSnapshot],
  viewerPlayerId = 101,
  roll = () => rollResult({ stateVersion: 3, newPosition: 12 }),
  resolve = () => actionResult(4),
  pass = () => actionResult(4),
  dice = () => true,
  reducedMotion = false,
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
            return await resolve();
          },
          async pass(gameId, playerId, command) {
            commands.pass.push({ gameId, playerId, command });
            return await pass();
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
        reducedMotion,
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

function card(effect, amount, text) {
  return {
    cardId: 501,
    title: effect === "transport" ? "Chance" : "Community Chest",
    text,
    effect,
    amount,
  };
}

async function runRollOutcome(overrides) {
  const afterRoll = {
    ...inProgressSnapshot,
    stateVersion: 3,
    playerTurn: 102,
    players: inProgressSnapshot.players.map(player => player.playerId === 101
      ? { ...player, position: overrides.newPosition }
      : player),
  };
  const harness = createHarness({
    snapshots: [inProgressSnapshot, afterRoll],
    roll: () => rollResult({ stateVersion: 3, ...overrides }),
    reducedMotion: true,
  });
  const runtime = harness.createRuntime();
  runtime.start();
  harness.realtime.subscribed();
  await flush();
  assert.equal(await runtime.primaryAction(), true);
  await flush(6);
  const state = runtime.getState();
  runtime.dispose();
  return state;
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

function gamePlayer(playerId, nickname, position, money, properties) {
  return {
    playerId,
    nickname,
    position,
    money,
    properties,
    jailed: false,
    jailTurnsRemaining: 0,
    bankrupt: false,
    afk: false,
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
