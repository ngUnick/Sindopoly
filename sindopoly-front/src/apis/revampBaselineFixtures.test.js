import test from "node:test";
import assert from "node:assert/strict";
import { parseGameEvent } from "./realtimeSync.js";
import {
  eventFixtures,
  inProgressSnapshot,
  inProgressViewerScenarios,
  jailedPlayerSnapshot,
  purchaseOptionalActionSnapshot,
  snapshotFixtures,
} from "../test-fixtures/gameRealtimeFixtures.js";

const snapshotKeys = [
  "gameId", "inviteCode", "optionalAction", "playerTurn", "players",
  "stateVersion", "status", "turnDeadlineEpochMs", "visibility", "winner",
];
const playerKeys = [
  "afk", "bankrupt", "jailTurnsRemaining", "jailed", "money", "nickname",
  "playerId", "position", "properties",
];

test("baseline snapshots preserve the current DTO shape with only the deadline projection", () => {
  for (const snapshot of snapshotFixtures) {
    assert.deepEqual(Object.keys(snapshot).sort(), snapshotKeys);
    assert.equal("die1" in snapshot, false);
    assert.equal("die2" in snapshot, false);
    assert.equal("turnDeadlineEpochMs" in snapshot, true);
    assert.equal("finalResult" in snapshot, false);
    snapshot.players.forEach(player => assert.deepEqual(Object.keys(player).sort(), playerKeys));
  }
});

test("baseline deadline fixtures preserve backend lifecycle semantics", () => {
  assert.equal(snapshotFixtures[0].turnDeadlineEpochMs, null);
  assert.equal(inProgressSnapshot.turnDeadlineEpochMs, 1789661234567);
  assert.equal(purchaseOptionalActionSnapshot.turnDeadlineEpochMs, 1789661294567);
  assert.equal(jailedPlayerSnapshot.turnDeadlineEpochMs, 1789661594567);
  assert.equal(snapshotFixtures.at(-1).turnDeadlineEpochMs, null);
});

test("baseline optional actions retain current server-owned identity and value types", () => {
  assert.deepEqual(purchaseOptionalActionSnapshot.optionalAction, {
    type: "PURCHASE_PROPERTY",
    gameId: 101,
    playerId: 101,
    stateVersion: 3,
    squareId: 6,
    cost: 100,
    declinable: true,
  });
  assert.equal(jailedPlayerSnapshot.optionalAction.type, "PAY_JAIL_EXIT");
  assert.equal(jailedPlayerSnapshot.optionalAction.squareId, null);
  assert.equal(jailedPlayerSnapshot.players[0].jailTurnsRemaining, 3);
});

test("baseline events validate and viewer context does not alter the snapshot contract", () => {
  eventFixtures.forEach(event => assert.deepEqual(parseGameEvent(event, 101), event));
  assert.equal(inProgressViewerScenarios.active.snapshot, inProgressViewerScenarios.inactive.snapshot);
  assert.deepEqual(inProgressSnapshot.players[0].properties, [1]);
  assert.equal(inProgressSnapshot.players[1].playerId, 102);
});
