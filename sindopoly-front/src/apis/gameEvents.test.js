import test from "node:test";
import assert from "node:assert/strict";
import {
  assignPawnRefsByPlayerId, enqueueNotification, movePawnForPlayer, observerNotification,
  pawnRefForPlayer,
} from "./gameEvents.js";

const names = id => ({ 1: "Άννα", 2: "Νίκος" }[id] ?? `Παίκτης ${id}`);
const squares = id => ({ 2: "ΚΑΡΤΑ ΑΠΟΦΑΣΗΣ", 7: "ΚΑΡΤΑ ΕΝΤΟΛΗΣ", 9: "ΣΤΑΣΗ ΤΕΡΜΑΤΙΚΟΥ" }[id] ?? `#${id}`);

test("renders another player's card text without action authority", () => {
  const event = { eventId: "event-1", stateVersion: 1, occurredAt: "2026-09-01T10:00:00Z", payload: {
    reason: "ROLL_COMPLETED", actorPlayerId: 1, details: [
    { type: "DICE_ROLLED", dice: 7 },
    { type: "LANDED_ON_TILE", squareId: 2 },
    { type: "CARD_DRAWN", card: { title: "Community Chest", text: "Βρήκες ένα τάλιρο.", effect: "money", amount: 5 } },
  ] } };
  const result = observerNotification(event, 2, names, squares);
  assert.match(result.message, /Βρήκες ένα τάλιρο/);
  assert.match(result.message, /\+5€/);
  assert.deepEqual(Object.keys(result).sort(), ["id", "message"]);
  assert.equal(observerNotification(event, 1, names, squares), null);
});

test("observer property offer is informational and contains no controls", () => {
  const event = { eventId: "event-2", stateVersion: 2, occurredAt: "2026-09-01T10:01:00Z", payload: {
    reason: "ROLL_COMPLETED", actorPlayerId: 1, details: [
    { type: "DICE_ROLLED", dice: 4 }, { type: "LANDED_ON_TILE", squareId: 9 },
    { type: "PROPERTY_AVAILABLE", squareId: 9, amount: 120 },
  ] } };
  const result = observerNotification(event, 2, names, squares);
  assert.match(result.message, /διαθέσιμη αγορά/);
  assert.equal("actionable" in result, false);
});

test("movement keeps pawn identity stable when snapshot rows reorder", () => {
  const playerOnePawn = { current: { position: 1 } };
  const playerTwoPawn = { current: { position: 9 } };
  const refs = [playerOnePawn, playerTwoPawn];
  const initial = assignPawnRefsByPlayerId(
    [{ player_id: 1, position: 1 }, { player_id: 2, position: 9 }], refs
  );
  const reordered = assignPawnRefsByPlayerId(
    [{ player_id: 2, position: 9 }, { player_id: 1, position: 1 }], refs, initial
  );
  assert.equal(pawnRefForPlayer(1, reordered), playerOnePawn);
  assert.equal(pawnRefForPlayer(2, reordered), playerTwoPawn);
  assert.equal(playerTwoPawn.current.position, 9);
});

test("fresh reconnect assigns pawns by immutable player identity, not snapshot order", () => {
  const refs = [1, 2, 3, 4].map(id => ({ current: { id } }));
  const forward = assignPawnRefsByPlayerId(
    [11, 22, 33, 44].map(player_id => ({ player_id })), refs
  );
  const reversed = assignPawnRefsByPlayerId(
    [44, 33, 22, 11].map(player_id => ({ player_id })), refs
  );
  assert.deepEqual(
    [11, 22, 33, 44].map(id => pawnRefForPlayer(id, reversed)),
    [11, 22, 33, 44].map(id => pawnRefForPlayer(id, forward))
  );
});

test("P1 movement dispatch cannot animate P2's pawn", () => {
  const playerOnePawn = { current: { name: "P1" } };
  const playerTwoPawn = { current: { name: "P2" } };
  const mapping = new Map([["1", playerOnePawn], ["2", playerTwoPawn]]);
  const calls = [];

  assert.equal(movePawnForPlayer(1, mapping, 7, (pawn, position) => {
    calls.push({ pawn, position });
  }), true);
  assert.deepEqual(calls, [{ pawn: playerOnePawn.current, position: 7 }]);
  assert.notEqual(calls[0].pawn, playerTwoPawn.current);
});

test("assigns stable pawns for all four supported players", () => {
  const refs = [1, 2, 3, 4].map(id => ({ current: { id } }));
  const mapping = assignPawnRefsByPlayerId(
    [11, 22, 33, 44].map(player_id => ({ player_id })), refs
  );
  assert.deepEqual([11, 22, 33, 44].map(id => pawnRefForPlayer(id, mapping)), refs);
});

test("queues rapid events in order, ignores duplicates, and stays bounded", () => {
  let queue = [];
  queue = enqueueNotification(queue, { id: "1", message: "one" }, 2);
  queue = enqueueNotification(queue, { id: "2", message: "two" }, 2);
  queue = enqueueNotification(queue, { id: "2", message: "duplicate" }, 2);
  queue = enqueueNotification(queue, { id: "3", message: "three" }, 2);
  assert.deepEqual(queue.map(item => item.id), ["1", "2"]);
});
