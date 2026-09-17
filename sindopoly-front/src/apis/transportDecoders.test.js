import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeActionResult,
  decodeCurrentPlayer,
  decodeGameSnapshot,
  decodeThrowResult,
} from "./transportDecoders.js";
import { TRANSPORT_ERROR_CODES } from "./transportError.js";
import { deriveOwnershipProjection } from "./ownershipProjection.js";
import {
  endedGameSnapshot,
  inProgressSnapshot,
  inProgressViewerScenarios,
  jailedPlayerSnapshot,
  lobbySnapshot,
  purchaseOptionalActionSnapshot,
} from "../test-fixtures/gameRealtimeFixtures.js";

test("decodes valid lobby, in-progress, and ended snapshots", () => {
  for (const fixture of [lobbySnapshot, inProgressSnapshot, endedGameSnapshot]) {
    assert.deepEqual(decodeGameSnapshot(fixture), fixture);
  }
});

test("decodes authoritative deadline values and explicit no-deadline states", () => {
  assert.equal(decodeGameSnapshot(inProgressSnapshot).turnDeadlineEpochMs, 1789661234567);
  assert.equal(decodeGameSnapshot(lobbySnapshot).turnDeadlineEpochMs, null);
  assert.equal(decodeGameSnapshot(endedGameSnapshot).turnDeadlineEpochMs, null);
  assert.equal(
    decodeGameSnapshot({
      ...inProgressSnapshot,
      turnDeadlineEpochMs: Number.MAX_SAFE_INTEGER,
    }).turnDeadlineEpochMs,
    Number.MAX_SAFE_INTEGER,
  );
});

test("decodes an immutable authoritative terminal result and explicit non-terminal null", () => {
  assert.equal(decodeGameSnapshot(inProgressSnapshot).finalResult, null);
  const decoded = decodeGameSnapshot(endedGameSnapshot);
  assert.equal(decoded.finalResult.winnerPlayerId, 101);
  assert.deepEqual(decoded.finalResult.standings, endedGameSnapshot.finalResult.standings);
  assert.equal(Object.isFrozen(decoded.finalResult), true);
  assert.equal(Object.isFrozen(decoded.finalResult.standings), true);
  assert.equal(Object.isFrozen(decoded.finalResult.standings[0]), true);
});

test("rejects winner contradictions, malformed values, arithmetic mismatches, and duplicate identities", () => {
  const mutate = callback => {
    const fixture = structuredClone(endedGameSnapshot);
    callback(fixture);
    assertInvalid(() => decodeGameSnapshot(fixture));
  };
  mutate(fixture => { fixture.finalResult.winnerPlayerId = 102; });
  mutate(fixture => { fixture.finalResult.standings[0].playerId = "101"; });
  mutate(fixture => { fixture.finalResult.standings[0].cash = "5000"; });
  mutate(fixture => { fixture.finalResult.standings[0].propertyValue = -1; });
  mutate(fixture => { fixture.finalResult.standings[0].totalValue += 1; });
  mutate(fixture => { fixture.finalResult.standings[1].playerId = 101; });
  mutate(fixture => { fixture.finalResult.standings = {}; });
  mutate(fixture => { fixture.finalResult.standings[1].winner = true; });
});

test("rejects missing results, invalid ordering and ranks, but tolerates unknown additive fields", () => {
  const missing = structuredClone(endedGameSnapshot);
  delete missing.finalResult;
  assertInvalid(() => decodeGameSnapshot(missing));
  assertInvalid(() => decodeGameSnapshot({ ...inProgressSnapshot, finalResult: endedGameSnapshot.finalResult }));

  const outOfOrder = structuredClone(endedGameSnapshot);
  outOfOrder.finalResult.standings.reverse();
  assertInvalid(() => decodeGameSnapshot(outOfOrder));
  const invalidRank = structuredClone(endedGameSnapshot);
  invalidRank.finalResult.standings[1].rank = 3;
  assertInvalid(() => decodeGameSnapshot(invalidRank));

  const additive = structuredClone(endedGameSnapshot);
  additive.finalResult.futureField = true;
  additive.finalResult.standings[0].futureField = true;
  assert.deepEqual(decodeGameSnapshot(additive), endedGameSnapshot);
});

test("terminal result decoding does not mutate its input", () => {
  const raw = structuredClone(endedGameSnapshot);
  const before = structuredClone(raw);
  decodeGameSnapshot(raw);
  assert.deepEqual(raw, before);
});

test("rejects missing or malformed authoritative deadlines", () => {
  const missing = structuredClone(inProgressSnapshot);
  delete missing.turnDeadlineEpochMs;
  assertInvalid(() => decodeGameSnapshot(missing));
  for (const deadline of ["1789661234567", 1.5, -1, 0, NaN, Infinity]) {
    assertInvalid(() => decodeGameSnapshot({ ...inProgressSnapshot, turnDeadlineEpochMs: deadline }));
  }
});

test("decodes the same snapshot for active and inactive viewers", () => {
  assert.deepEqual(
    decodeGameSnapshot(inProgressViewerScenarios.active.snapshot),
    decodeGameSnapshot(inProgressViewerScenarios.inactive.snapshot),
  );
});

test("decodes current purchase and jail optional actions", () => {
  assert.deepEqual(
    decodeGameSnapshot(purchaseOptionalActionSnapshot).optionalAction,
    purchaseOptionalActionSnapshot.optionalAction,
  );
  assert.deepEqual(
    decodeGameSnapshot(jailedPlayerSnapshot).optionalAction,
    jailedPlayerSnapshot.optionalAction,
  );
});

test("rejects malformed snapshot identity, version, and players", () => {
  assertInvalid(() => decodeGameSnapshot({ ...inProgressSnapshot, gameId: "101" }));
  assertInvalid(() => decodeGameSnapshot({ ...inProgressSnapshot, stateVersion: -1 }));
  assertInvalid(() => decodeGameSnapshot({ ...inProgressSnapshot, players: {} }));
  assertInvalid(() => decodeGameSnapshot({
    ...inProgressSnapshot,
    players: [inProgressSnapshot.players[0], inProgressSnapshot.players[0]],
  }));
});

test("rejects malformed canonical property IDs", () => {
  const malformed = structuredClone(inProgressSnapshot);
  malformed.players[0].properties = [1, "6"];

  assertInvalid(() => decodeGameSnapshot(malformed));
});

test("ignores unknown additive snapshot and player fields", () => {
  const additive = structuredClone(inProgressSnapshot);
  additive.futureSnapshotField = { any: "value" };
  additive.players[0].futurePlayerField = true;

  assert.deepEqual(decodeGameSnapshot(additive), inProgressSnapshot);
});

test("fails closed for unknown snapshot status and optional-action type", () => {
  assertInvalid(() => decodeGameSnapshot({ ...inProgressSnapshot, status: "paused" }));
  assertInvalid(() => decodeGameSnapshot({
    ...inProgressSnapshot,
    optionalAction: { ...purchaseOptionalActionSnapshot.optionalAction, type: "BUILD_HOUSE" },
  }));
});

test("returns immutable copies without mutating raw snapshot data", () => {
  const raw = structuredClone(inProgressSnapshot);
  const before = structuredClone(raw);
  const decoded = decodeGameSnapshot(raw);

  assert.deepEqual(raw, before);
  assert.notEqual(decoded, raw);
  assert.notEqual(decoded.players, raw.players);
  assert.notEqual(decoded.players[0].properties, raw.players[0].properties);
  assert.equal(Object.isFrozen(decoded), true);
  assert.equal(Object.isFrozen(decoded.players), true);
});

test("decoded snapshots remain directly compatible with ownership projection", () => {
  const ownership = deriveOwnershipProjection(decodeGameSnapshot(inProgressSnapshot));

  assert.equal(ownership.ownerBySquareId[1].playerId, 101);
  assert.equal(ownership.ownerBySquareId[3].playerId, 102);
});

test("decodes the current session player without accepting string IDs", () => {
  assert.deepEqual(decodeCurrentPlayer({ id: 7, nickname: "Player" }), {
    id: 7, nickname: "Player",
  });
  assertInvalid(() => decodeCurrentPlayer({ id: "7", nickname: "Player" }));
});

test("decodes valid and replayed throw responses", () => {
  const result = {
    dice: 7, die1: 3, die2: 4, total: 7,
    newPosition: 12, passedGo: false, squareType: 5, data: 200,
    stateVersion: 8, replayed: false, card: null,
  };

  assert.deepEqual(decodeThrowResult(result), result);
  assert.equal(decodeThrowResult({ ...result, replayed: true }).replayed, true);
});

test("decodes current card data in a throw response", () => {
  const result = {
    dice: 7, die1: 3, die2: 4, total: 7,
    newPosition: 6, passedGo: true, squareType: 1, data: 6,
    stateVersion: 8, replayed: false,
    card: { cardId: 5, title: "Chance", text: "Move.", effect: "transport", amount: 6 },
  };

  assert.deepEqual(decodeThrowResult(result), result);
});

test("rejects malformed throw responses", () => {
  const result = {
    dice: 7, die1: 3, die2: 4, total: 7,
    newPosition: 12, passedGo: false, squareType: 5, data: 200,
    stateVersion: 8, replayed: false, card: null,
  };
  for (const malformed of [
    { ...result, dice: "7" },
    { ...result, die1: 0 },
    { ...result, die2: 7 },
    { ...result, die1: 3.5 },
    { ...result, die2: "4" },
    { ...result, total: 8 },
    { ...result, dice: 8 },
  ]) {
    assertInvalid(() => decodeThrowResult(malformed));
  }
});

test("decodes authoritative minimum, maximum, and no-roll jail-offer results", () => {
  const base = {
    newPosition: 10, passedGo: false, squareType: 8, data: -1,
    stateVersion: 8, replayed: false, card: null,
  };
  assert.deepEqual(decodeThrowResult({
    ...base, dice: 2, die1: 1, die2: 1, total: 2,
  }).total, 2);
  assert.deepEqual(decodeThrowResult({
    ...base, dice: 12, die1: 6, die2: 6, total: 12,
  }).total, 12);
  assert.deepEqual(decodeThrowResult({
    ...base, dice: 0, squareType: 10, data: 50,
  }), {
    ...base, dice: 0, die1: null, die2: null, total: null, squareType: 10, data: 50,
  });
});

test("decodes valid action responses and rejects malformed ones", () => {
  const result = {
    newBalance: 1300, acquiredProperties: [6], nextPlayerId: 102,
    stateVersion: 9, replayed: false,
  };

  assert.deepEqual(decodeActionResult(result), result);
  assertInvalid(() => decodeActionResult({ ...result, acquiredProperties: ["6"] }));
});

function assertInvalid(operation) {
  assert.throws(operation, error => error.code === TRANSPORT_ERROR_CODES.INVALID_PAYLOAD);
}
