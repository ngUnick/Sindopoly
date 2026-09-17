import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  MOVEMENT_MODES,
  PRESENTATION_PHASES,
  buildPresentationPlan,
  buildPresentationTransaction,
} from "../features/game/presentation/presentationTransaction.js";
import {
  PRESENTATION_RESULTS,
  PresentationCoordinator,
} from "../features/game/presentation/PresentationCoordinator.js";

test("coordinator starts idle and orders dice, movement, then outcome", async () => {
  const dice = deferred();
  const movement = deferred();
  const outcome = deferred();
  const scene = scenePort({ dice: dice.promise, movement: movement.promise });
  const outcomes = [];
  const phases = [];
  const coordinator = new PresentationCoordinator({
    scene,
    presentOutcome(value) {
      outcomes.push(value);
      return outcome.promise;
    },
    onPhaseChanged: phase => phases.push(phase),
  });

  assert.equal(coordinator.phase, PRESENTATION_PHASES.IDLE);
  const result = coordinator.present(transaction({
    movement: { mode: MOVEMENT_MODES.FORWARD, playerId: 7, from: 39, to: 1, slot: 2 },
    outcome: suppliedOutcome(),
  }));
  await flush();

  assert.deepEqual(scene.calls.dice[0], {
    die1: 2, die2: 5, total: 7, presentationId: 10, reducedMotion: false,
  });
  assert.equal(coordinator.phase, PRESENTATION_PHASES.PRESENTING_DICE);
  assert.equal(scene.calls.movement.length, 0);
  dice.resolve(true);
  await flush();

  assert.deepEqual(scene.calls.movement[0], {
    mode: MOVEMENT_MODES.FORWARD,
    playerId: 7,
    from: 39,
    to: 1,
    slot: 2,
    route: [0, 1],
    reducedMotion: false,
  });
  assert.equal(outcomes.length, 0);
  movement.resolve(true);
  await flush();

  assert.deepEqual(outcomes, [suppliedOutcome()]);
  assert.equal(coordinator.phase, PRESENTATION_PHASES.PRESENTING_OUTCOME);
  outcome.resolve(true);

  assert.equal(await result, PRESENTATION_RESULTS.COMPLETED);
  assert.equal(coordinator.phase, PRESENTATION_PHASES.IDLE);
  assert.deepEqual(phases, [
    PRESENTATION_PHASES.PRESENTING_DICE,
    PRESENTATION_PHASES.PRESENTING_MOVEMENT,
    PRESENTATION_PHASES.PRESENTING_OUTCOME,
    PRESENTATION_PHASES.IDLE,
  ]);
});

test("confirmed dice are preserved and reduced motion keeps the same stage order", async () => {
  const scene = scenePort();
  const outcomes = [];
  const coordinator = new PresentationCoordinator({
    scene,
    reducedMotion: true,
    presentOutcome: value => { outcomes.push(value); return true; },
  });

  const result = await coordinator.present(transaction({ outcome: suppliedOutcome() }));

  assert.equal(result, PRESENTATION_RESULTS.COMPLETED);
  assert.deepEqual(scene.calls.dice, [{
    die1: 2, die2: 5, total: 7, presentationId: 10, reducedMotion: true,
  }]);
  assert.deepEqual(outcomes, [suppliedOutcome()]);
});

test("duplicate and older presentations never replay dice", async () => {
  const dice = deferred();
  const scene = scenePort({ dice: dice.promise });
  const coordinator = new PresentationCoordinator({ scene });
  const first = coordinator.present(transaction());
  await flush();

  assert.equal(await coordinator.present(transaction()), PRESENTATION_RESULTS.DUPLICATE);
  assert.equal(await coordinator.present(transaction({
    presentationId: "event:9",
    stateVersion: 9,
  })), PRESENTATION_RESULTS.STALE);
  assert.equal(scene.calls.dice.length, 1);

  dice.resolve(true);
  assert.equal(await first, PRESENTATION_RESULTS.COMPLETED);
});

test("response and STOMP echo share explicit identity and present once", async () => {
  const scene = scenePort();
  const coordinator = new PresentationCoordinator({ scene });
  const response = transaction({ presentationId: "game:4:version:10:roll:7" });
  const stompEcho = transaction({ presentationId: "game:4:version:10:roll:7" });

  assert.equal(await coordinator.present(response), PRESENTATION_RESULTS.COMPLETED);
  assert.equal(await coordinator.present(stompEcho), PRESENTATION_RESULTS.DUPLICATE);
  assert.equal(scene.calls.dice.length, 1);
});

test("newer state supersedes active work and stale completion cannot emit outcome", async () => {
  const firstDice = deferred();
  const secondDice = deferred();
  const scene = scenePort({
    dice: call => call.presentationId === 10 ? firstDice.promise : secondDice.promise,
  });
  const outcomes = [];
  const coordinator = new PresentationCoordinator({
    scene,
    presentOutcome: value => { outcomes.push(value); return true; },
  });
  const oldResult = coordinator.present(transaction({ outcome: suppliedOutcome({ text: "old" }) }));
  await flush();
  const newResult = coordinator.present(transaction({
    presentationId: "event:11",
    stateVersion: 11,
    outcome: suppliedOutcome({ text: "new" }),
  }));

  assert.equal(await oldResult, PRESENTATION_RESULTS.SUPERSEDED);
  assert.deepEqual(scene.calls.cancelDice, [10]);
  firstDice.resolve(true);
  await flush();
  assert.deepEqual(outcomes, []);
  secondDice.resolve(true);
  assert.equal(await newResult, PRESENTATION_RESULTS.COMPLETED);
  assert.deepEqual(outcomes.map(value => value.text), ["new"]);
});

test("same-version distinct identities use one active plus one newest queued slot", async () => {
  const firstDice = deferred();
  const scene = scenePort({ dice: call => call.presentationId === 10 ? firstDice.promise : true });
  const outcomes = [];
  const coordinator = new PresentationCoordinator({
    scene,
    presentOutcome: value => { outcomes.push(value.text); return true; },
  });
  const active = coordinator.present(transaction());
  await flush();
  const replaced = coordinator.present(transaction({
    presentationId: "event:10:fact:a", dice: null, outcome: suppliedOutcome({ text: "a" }),
  }));
  const newest = coordinator.present(transaction({
    presentationId: "event:10:fact:b", dice: null, outcome: suppliedOutcome({ text: "b" }),
  }));

  assert.equal(await replaced, PRESENTATION_RESULTS.COALESCED);
  assert.equal(coordinator.queuedPresentationId, "event:10:fact:b");
  firstDice.resolve(true);
  assert.equal(await active, PRESENTATION_RESULTS.COMPLETED);
  assert.equal(await newest, PRESENTATION_RESULTS.COMPLETED);
  assert.deepEqual(outcomes, ["b"]);
});

test("pure planning honors explicit forward, direct, snap and same-square modes", () => {
  const forward = buildPresentationPlan(transaction({
    dice: null,
    movement: { mode: MOVEMENT_MODES.FORWARD, playerId: 7, from: 38, to: 2, slot: 0 },
  }));
  const direct = buildPresentationPlan(transaction({
    presentationId: "direct",
    dice: null,
    movement: { mode: MOVEMENT_MODES.DIRECT, playerId: 7, from: 8, to: 30, slot: 0 },
  }));
  const snap = buildPresentationPlan(transaction({
    presentationId: "snap",
    dice: null,
    movement: { mode: MOVEMENT_MODES.SNAP, playerId: 7, to: 14, slot: 0 },
  }));
  const sameSquare = buildPresentationPlan(transaction({
    presentationId: "same",
    dice: null,
    movement: { mode: MOVEMENT_MODES.FORWARD, playerId: 7, from: 4, to: 4, slot: 0 },
  }));
  const directSameSquare = buildPresentationPlan(transaction({
    presentationId: "direct-same",
    dice: null,
    movement: { mode: MOVEMENT_MODES.DIRECT, playerId: 7, from: 4, to: 4, slot: 0 },
  }));

  assert.deepEqual(forward.stages[0].movement.route, [39, 0, 1, 2]);
  assert.equal(direct.stages[0].movement.route, null);
  assert.equal(snap.stages[0].movement.route, null);
  assert.deepEqual(sameSquare.stages, []);
  assert.deepEqual(directSameSquare.stages, []);
  assert.equal(buildPresentationPlan(transaction({
    presentationId: "bad",
    dice: null,
    movement: { mode: "INFER", playerId: 7, from: 1, to: 7 },
  })), null);
});

test("movement execution never derives a destination from dice total", async () => {
  const scene = scenePort();
  const coordinator = new PresentationCoordinator({ scene });
  const direct = transaction({
    dice: null,
    movement: { mode: MOVEMENT_MODES.DIRECT, playerId: 7, from: 3, to: 30, slot: 1 },
  });
  const snap = transaction({
    presentationId: "event:11",
    stateVersion: 11,
    dice: null,
    movement: { mode: MOVEMENT_MODES.SNAP, playerId: 7, to: 12, slot: 1 },
  });

  assert.equal(await coordinator.present(direct), PRESENTATION_RESULTS.COMPLETED);
  assert.equal(await coordinator.present(snap), PRESENTATION_RESULTS.COMPLETED);
  assert.deepEqual(scene.calls.movement[0].route, null);
  assert.deepEqual(scene.calls.snap[0], { playerId: 7, position: 12, slot: 1 });
});

test("recovery cancels transient presentation and performs only explicit snaps", async () => {
  const dice = deferred();
  const scene = scenePort({ dice: dice.promise });
  const outcomes = [];
  const coordinator = new PresentationCoordinator({
    scene,
    presentOutcome: value => { outcomes.push(value); return true; },
  });
  const active = coordinator.present(transaction({
    movement: { mode: MOVEMENT_MODES.FORWARD, playerId: 7, from: 1, to: 8, slot: 0 },
    outcome: suppliedOutcome(),
  }));
  await flush();

  assert.equal(await coordinator.recover({
    stateVersion: 12,
    snaps: [
      { playerId: 7, position: 8, slot: 0 },
      { playerId: 9, position: 12, slot: 1 },
    ],
  }), PRESENTATION_RESULTS.RECOVERED);
  assert.equal(await active, PRESENTATION_RESULTS.RECOVERY_CANCELED);
  assert.deepEqual(scene.calls.snap, [
    { playerId: 7, position: 8, slot: 0 },
    { playerId: 9, position: 12, slot: 1 },
  ]);
  assert.equal(scene.calls.movement.length, 0);
  assert.deepEqual(outcomes, []);
  dice.resolve(true);
  await flush();
  assert.equal(coordinator.phase, PRESENTATION_PHASES.IDLE);
  assert.equal(await coordinator.present(transaction({
    presentationId: "event:11",
    stateVersion: 11,
  })), PRESENTATION_RESULTS.STALE);
  assert.equal(scene.calls.dice.length, 1);
});

test("explicit cancellation settles active work and suppresses late stages", async () => {
  const dice = deferred();
  const scene = scenePort({ dice: dice.promise });
  const outcomes = [];
  const coordinator = new PresentationCoordinator({
    scene,
    presentOutcome: value => { outcomes.push(value); return true; },
  });
  const pending = coordinator.present(transaction({ outcome: suppliedOutcome() }));
  await flush();

  assert.equal(coordinator.cancel(), true);
  assert.equal(await pending, PRESENTATION_RESULTS.CANCELED);
  assert.equal(coordinator.cancel(), false);
  dice.resolve(true);
  await flush();
  assert.deepEqual(outcomes, []);
  assert.equal(coordinator.phase, PRESENTATION_PHASES.IDLE);
});

test("supplied card outcome remains presentational and dismissal submits nothing", async () => {
  const input = transaction({
    dice: null,
    outcome: suppliedOutcome({
      kind: "CARD",
      text: "Προχώρησε στην επόμενη σχολή.",
      dismissible: true,
    }),
  });
  const original = structuredClone(input);
  const received = [];
  const dismissal = deferred();
  const coordinator = new PresentationCoordinator({
    scene: scenePort(),
    presentOutcome(value) {
      received.push(value);
      return dismissal.promise;
    },
  });
  const result = coordinator.present(input);
  await flush();

  assert.equal(coordinator.phase, PRESENTATION_PHASES.PRESENTING_OUTCOME);
  assert.deepEqual(received[0], input.outcome);
  assert.ok(Object.isFrozen(received[0]));
  dismissal.resolve(true);
  assert.equal(await result, PRESENTATION_RESULTS.COMPLETED);
  assert.deepEqual(input, original);
});

test("decorative port failure is reported and settles without rejecting", async () => {
  const failures = [];
  const scene = scenePort({ dice: Promise.reject(new Error("WebGL unavailable")) });
  const coordinator = new PresentationCoordinator({
    scene,
    onFailure: failure => failures.push(failure),
  });

  assert.equal(await coordinator.present(transaction()), PRESENTATION_RESULTS.FAILED);
  assert.equal(coordinator.phase, PRESENTATION_PHASES.IDLE);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].presentationId, "event:10");
  assert.equal(failures[0].phase, PRESENTATION_PHASES.PRESENTING_DICE);
});

test("dispose is idempotent and prevents pending or future callbacks", async () => {
  const dice = deferred();
  const phases = [];
  const outcomes = [];
  const scene = scenePort({ dice: dice.promise });
  const coordinator = new PresentationCoordinator({
    scene,
    onPhaseChanged: phase => phases.push(phase),
    presentOutcome: value => { outcomes.push(value); return true; },
  });
  const pending = coordinator.present(transaction({ outcome: suppliedOutcome() }));
  await flush();

  assert.equal(coordinator.dispose(), true);
  assert.equal(coordinator.dispose(), false);
  const callbackCount = phases.length;
  dice.resolve(true);
  await flush();

  assert.equal(await pending, PRESENTATION_RESULTS.DISPOSED);
  assert.equal(await coordinator.present(transaction({
    presentationId: "event:11", stateVersion: 11,
  })), PRESENTATION_RESULTS.DISPOSED);
  assert.equal(phases.length, callbackCount);
  assert.deepEqual(outcomes, []);
  assert.equal(new PresentationCoordinator({ scene: scenePort() }).phase, PRESENTATION_PHASES.IDLE);
});

test("dispose while idle or awaiting outcome is safe and requests local outcome cleanup", async () => {
  const idle = new PresentationCoordinator({ scene: scenePort() });
  assert.equal(idle.dispose(), true);
  assert.equal(idle.dispose(), false);

  const dismissal = deferred();
  const canceledOutcomes = [];
  const coordinator = new PresentationCoordinator({
    scene: scenePort(),
    presentOutcome: () => dismissal.promise,
    cancelOutcome: presentationId => canceledOutcomes.push(presentationId),
  });
  const pending = coordinator.present(transaction({ dice: null, outcome: suppliedOutcome() }));
  await flush();
  assert.equal(coordinator.phase, PRESENTATION_PHASES.PRESENTING_OUTCOME);

  coordinator.dispose();
  assert.equal(await pending, PRESENTATION_RESULTS.DISPOSED);
  assert.deepEqual(canceledOutcomes, ["event:10"]);
  dismissal.resolve(true);
  await flush();
  assert.equal(coordinator.phase, PRESENTATION_PHASES.IDLE);
});

test("normalized inputs are immutable and coordinator sources have no authority dependencies", async () => {
  const input = transaction({ outcome: suppliedOutcome() });
  const normalized = buildPresentationTransaction(input);
  assert.ok(Object.isFrozen(normalized));
  assert.ok(Object.isFrozen(normalized.dice));
  assert.ok(Object.isFrozen(normalized.outcome));

  const [coordinatorSource, transactionSource, boardSource] = await Promise.all([
    readFile(new URL("../features/game/presentation/PresentationCoordinator.js", import.meta.url), "utf8"),
    readFile(new URL("../features/game/presentation/presentationTransaction.js", import.meta.url), "utf8"),
    readFile(new URL("../pages/Game/Board.jsx", import.meta.url), "utf8"),
  ]);
  const source = `${coordinatorSource}\n${transactionSource}`;
  assert.doesNotMatch(
    source,
    /(?:from|import)\s*(?:[^"']*\sfrom\s*)?["'][^"']*(?:apiClient|BoardAPI|GameAPI|GamePlayAPI|TurnAPI|stomp|sockjs|react|\.css)[^"']*["']/iu,
  );
  assert.doesNotMatch(source, /Redis|MariaDB/iu);
  assert.doesNotMatch(source, /Math\.random|calculateRent|purchasePrice|turnDeadlineEpochMs|winnerPlayerId|fetch\s*\(/u);
  assert.doesNotMatch(source, /eventHistory|setTimeout|setInterval|requestAnimationFrame/iu);
  assert.doesNotMatch(boardSource, /PresentationCoordinator|presentationTransaction/u);
});

test("deduplication memory remains bounded independently of the single queue slot", async () => {
  const coordinator = new PresentationCoordinator({
    scene: scenePort(),
    dedupLimit: 2,
    presentOutcome: () => true,
  });
  for (let version = 1; version <= 4; version += 1) {
    assert.equal(await coordinator.present(transaction({
      presentationId: `event:${version}`,
      stateVersion: version,
      dice: null,
      outcome: suppliedOutcome({ text: `event ${version}` }),
    })), PRESENTATION_RESULTS.COMPLETED);
  }
  assert.equal(coordinator.seenIds.size, 2);
  assert.equal(coordinator.queuedPresentationId, null);
});

function transaction(overrides = {}) {
  return {
    presentationId: "event:10",
    stateVersion: 10,
    actorPlayerId: 7,
    dice: { die1: 2, die2: 5, total: 7 },
    movement: null,
    outcome: null,
    ...overrides,
  };
}

function suppliedOutcome(overrides = {}) {
  return {
    kind: "ROLL_RESOLVED",
    text: "Ο παίκτης έφερε 7.",
    emphasis: "neutral",
    dismissible: false,
    ...overrides,
  };
}

function scenePort(results = {}) {
  const calls = { dice: [], movement: [], snap: [], cancelDice: [] };
  return {
    calls,
    presentDiceRollAndWait(value) {
      calls.dice.push(value);
      return resolveResult(results.dice, value);
    },
    presentPawnMovement(value) {
      calls.movement.push(value);
      return resolveResult(results.movement, value);
    },
    snapPawnPosition(value) {
      calls.snap.push(value);
      return resolveResult(results.snap, value);
    },
    cancelDicePresentation(presentationId) {
      calls.cancelDice.push(presentationId);
      return true;
    },
  };
}

function resolveResult(result, value) {
  if (typeof result === "function") return result(value);
  return result ?? true;
}

function deferred() {
  let resolve;
  const promise = new Promise(settle => { resolve = settle; });
  return { promise, resolve };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}
