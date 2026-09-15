import assert from "node:assert/strict";
import test from "node:test";
import {
  applyOwnershipToSquares, deriveOwnershipProjection, propertyIdsForPlayer,
} from "./ownershipProjection.js";
import { inProgressSnapshot } from "../test-fixtures/gameRealtimeFixtures.js";

test("empty snapshot has no owners", () => {
  const ownership = deriveOwnershipProjection({ players: [] });

  assert.deepEqual(ownership.ownerBySquareId, {});
  assert.deepEqual(ownership.propertiesByPlayerId, {});
  assert.equal(ownership.isValid, true);
});

test("one player and one property resolve to the authoritative player ID", () => {
  const ownership = deriveOwnershipProjection(snapshot([
    player(101, "Alice", [6]),
  ]));

  assert.deepEqual(ownership.ownerBySquareId[6], { playerId: 101, nickname: "Alice" });
  assert.deepEqual(propertyIdsForPlayer(ownership, 101), [6]);
});

test("multiple players and properties produce deterministic owner lookups", () => {
  const ownership = deriveOwnershipProjection(snapshot([
    player(102, "Guest", [8, 3]),
    player(101, "Host", [6, 1]),
  ]));

  assert.deepEqual(Object.keys(ownership.ownerBySquareId), ["1", "3", "6", "8"]);
  assert.deepEqual(propertyIdsForPlayer(ownership, 101), [1, 6]);
  assert.deepEqual(propertyIdsForPlayer(ownership, 102), [3, 8]);
});

test("nickname changes update display data without changing ownership identity", () => {
  const before = deriveOwnershipProjection(snapshot([player(101, "Before", [6])]));
  const after = deriveOwnershipProjection(snapshot([player(101, "After", [6])]));

  assert.equal(before.ownerBySquareId[6].playerId, after.ownerBySquareId[6].playerId);
  assert.equal(after.ownerBySquareId[6].nickname, "After");
});

test("property IDs remain canonical numbers", () => {
  const ownership = deriveOwnershipProjection(snapshot([player(101, "Alice", [6, 8])]));

  assert.equal(typeof propertyIdsForPlayer(ownership, 101)[0], "number");
  assert.equal(typeof ownership.conflicts[0]?.squareId, "undefined");
});

test("projection and square adaptation do not mutate input arrays or rows", () => {
  const players = [player(101, "Alice", [6])];
  const squares = [{ position: 6, name: "Library", player: null }];
  const originalPlayers = structuredClone(players);
  const originalSquares = structuredClone(squares);
  const ownership = deriveOwnershipProjection(snapshot(players));
  const projectedSquares = applyOwnershipToSquares(squares, ownership);

  assert.deepEqual(players, originalPlayers);
  assert.deepEqual(squares, originalSquares);
  assert.notEqual(projectedSquares[0], squares[0]);
  assert.deepEqual(projectedSquares[0], {
    position: 6, name: "Library", player: "Alice", ownerPlayerId: 101,
  });
  assert.equal(Object.isFrozen(projectedSquares[0]), true);
});

test("malformed property IDs and missing players are filtered and reported", () => {
  const ownership = deriveOwnershipProjection(snapshot([
    player(101, "Alice", [6, "8", -1, 2.5, null]),
    null,
  ]));

  assert.deepEqual(propertyIdsForPlayer(ownership, 101), [6]);
  assert.equal(ownership.invalidPropertyClaims.length, 4);
  assert.deepEqual(ownership.invalidPlayers, [{ playerId: null }]);
  assert.equal(ownership.isValid, false);
});

test("duplicate claims within one player are deduplicated deterministically", () => {
  const ownership = deriveOwnershipProjection(snapshot([
    player(101, "Alice", [6, 6, 6]),
  ]));

  assert.deepEqual(propertyIdsForPlayer(ownership, 101), [6]);
  assert.deepEqual(ownership.duplicatePropertyClaims, [
    { playerId: 101, propertyId: 6 },
    { playerId: 101, propertyId: 6 },
  ]);
  assert.equal(ownership.isValid, false);
});

test("conflicting ownership is reported without choosing an owner by array order", () => {
  const forward = deriveOwnershipProjection(snapshot([
    player(101, "Alice", [6]), player(102, "Bob", [6]),
  ]));
  const reverse = deriveOwnershipProjection(snapshot([
    player(102, "Bob", [6]), player(101, "Alice", [6]),
  ]));

  assert.equal(forward.isValid, false);
  assert.equal(forward.ownerBySquareId[6], undefined);
  assert.deepEqual(forward.conflicts, [{ squareId: 6, playerIds: [101, 102] }]);
  assert.deepEqual(reverse.conflicts, forward.conflicts);
});

test("FE-REVAMP-001 fixture preserves expected ownership and visible labels", () => {
  const ownership = deriveOwnershipProjection(inProgressSnapshot);
  const squares = applyOwnershipToSquares([
    { position: 1, name: "Gym", player: null },
    { position: 3, name: "Library", player: null },
    { position: 6, name: "Stop", player: null },
  ], ownership);

  assert.deepEqual(propertyIdsForPlayer(ownership, 101), [1]);
  assert.deepEqual(propertyIdsForPlayer(ownership, 102), [3]);
  assert.deepEqual(squares.map(({ position, player, ownerPlayerId }) => ({
    position, player, ownerPlayerId,
  })), [
    { position: 1, player: "BaselineHost", ownerPlayerId: 101 },
    { position: 3, player: "BaselineGuest", ownerPlayerId: 102 },
    { position: 6, player: null, ownerPlayerId: null },
  ]);
});

function snapshot(players) {
  return { players };
}

function player(playerId, nickname, properties) {
  return { playerId, nickname, properties };
}
