import test from "node:test";
import assert from "node:assert/strict";
import {
  createSnapshotSynchronizer, parseGameEvent, shouldDisplayGameEvent,
} from "./realtimeSync.js";
import {
  acceptGameSnapshot, clearGameVersion, currentGameVersion, observeGameSnapshot, observeGameVersion,
} from "./gameCommandState.js";

const event = version => ({
  eventId: `event-${version}`,
  eventType: "TURN_UPDATED",
  gameId: 7,
  stateVersion: version,
  occurredAt: "2026-09-01T10:00:00Z",
  payload: { reason: "ROLL_COMPLETED", actorPlayerId: null, details: [] },
});

test("rejects malformed and cross-game notifications", () => {
  assert.equal(parseGameEvent("not-json", 7), null);
  assert.equal(parseGameEvent({ ...event(2), gameId: 8 }, 7), null);
  assert.equal(parseGameEvent({ ...event(2), payload: { details: [] } }, 7), null);
  assert.equal(parseGameEvent({
    ...event(2), payload: { ...event(2).payload, details: [{ type: "DICE_ROLLED", dice: "6" }] },
  }, 7), null);
});

test("ignores duplicate and stale notifications", async () => {
  let version = 4;
  let reads = 0;
  const sync = createSnapshotSynchronizer({ gameId: 7, currentVersion: () => version,
    fetchSnapshot: async () => { reads += 1; return { stateVersion: 5 }; },
    applySnapshot: (_id, snapshot) => { version = snapshot.stateVersion; return true; } });
  assert.equal(await sync.onEvent(event(4)), false);
  assert.equal(reads, 0);
  await sync.onEvent(event(5));
  await sync.onEvent(event(5));
  assert.equal(reads, 1);
});

test("uses a gap as a recovery signal and ignores the later out-of-order event", async () => {
  let version = 10;
  let reads = 0;
  const sync = createSnapshotSynchronizer({ gameId: 7, currentVersion: () => version,
    fetchSnapshot: async () => { reads += 1; return { stateVersion: 13 }; },
    applySnapshot: (_id, snapshot) => { version = snapshot.stateVersion; return true; } });
  await sync.onEvent(event(13));
  assert.equal(version, 13);
  assert.equal(await sync.onEvent(event(12)), false);
  assert.equal(reads, 1);
});

test("displays versions 15 then 17 once and rejects late 16 or duplicate 17", () => {
  let acceptedSnapshotVersion = 14;
  let lastDisplayedVersion = -1;
  assert.equal(shouldDisplayGameEvent(event(15), acceptedSnapshotVersion, lastDisplayedVersion), true);
  lastDisplayedVersion = 15;
  acceptedSnapshotVersion = 15;
  assert.equal(shouldDisplayGameEvent(event(17), acceptedSnapshotVersion, lastDisplayedVersion), true);
  lastDisplayedVersion = 17;
  assert.equal(shouldDisplayGameEvent(event(16), acceptedSnapshotVersion, lastDisplayedVersion), false);
  assert.equal(shouldDisplayGameEvent(event(17), acceptedSnapshotVersion, lastDisplayedVersion), false);
});

test("unsupported event values trigger recovery but never presentation", async () => {
  const unknown = { ...event(2), eventType: "FUTURE_EVENT" };
  const decoded = parseGameEvent(unknown, 7);
  assert.equal(shouldDisplayGameEvent(decoded, 1, -1), false);

  let reads = 0;
  const sync = createSnapshotSynchronizer({
    gameId: 7,
    currentVersion: () => 1,
    fetchSnapshot: async () => { reads += 1; return { stateVersion: 2 }; },
    applySnapshot: () => true,
  });
  assert.equal(await sync.onEvent(unknown), true);
  assert.equal(reads, 1);
});

test("coalesces bursts and follows an event racing an in-flight snapshot", async () => {
  let version = 1;
  let release;
  let reads = 0;
  const first = new Promise(resolve => { release = resolve; });
  const sync = createSnapshotSynchronizer({ gameId: 7, currentVersion: () => version,
    fetchSnapshot: async () => (++reads === 1 ? first : { stateVersion: 3 }),
    applySnapshot: (_id, snapshot) => { version = snapshot.stateVersion; return true; } });
  const pending = sync.onEvent(event(2));
  void sync.onEvent(event(3));
  release({ stateVersion: 2 });
  await pending;
  assert.equal(reads, 2);
  assert.equal(version, 3);
});

test("reconnect always performs a recovery read", async () => {
  let reads = 0;
  const sync = createSnapshotSynchronizer({ gameId: 7, currentVersion: () => 9,
    fetchSnapshot: async () => { reads += 1; return { stateVersion: 9 }; }, applySnapshot: () => true });
  await sync.onConnect();
  assert.equal(reads, 1);
});

test("command response versions do not masquerade as applied snapshots", () => {
  clearGameVersion(7);
  observeGameVersion(7, { stateVersion: 4 });
  assert.equal(currentGameVersion(7), undefined);
  observeGameSnapshot(7, { stateVersion: 4 });
  assert.equal(currentGameVersion(7), 4);
});

test("rejects a late snapshot response after a newer snapshot was accepted", () => {
  clearGameVersion(7);
  assert.equal(acceptGameSnapshot(7, { stateVersion: 15 }), true);
  assert.equal(acceptGameSnapshot(7, { stateVersion: 14 }), false);
  assert.equal(currentGameVersion(7), 15);
});
