import test from "node:test";
import assert from "node:assert/strict";
import {
  EVENT_HISTORY_DEDUP_LIMIT,
  EVENT_HISTORY_GAP_KIND,
  EVENT_HISTORY_LIMIT,
  applyEventToHistory,
  clearEventHistory,
  createEventHistoryState,
  markEventHistoryGap,
  selectLatestAnnounceableEntry,
  selectLatestHistoryEntry,
  setEventHistoryGame,
} from "../features/game/presentation/eventHistory.js";
import { buildEventViewModel } from "../features/game/presentation/eventViewModel.js";
import { EVENT_HISTORY_CONTENT } from "../features/game/content/el.js";
import { parseGameEvent } from "./realtimeSync.js";
import { turnUpdatedEvent } from "../test-fixtures/gameRealtimeFixtures.js";

const at = second => `2026-09-01T10:00:${String(second).padStart(2, "0")}Z`;
const eventEntry = ({ id = "event-1", version = 1, occurredAt = at(1), text = "Γεγονός." } = {}) => ({
  id,
  kind: "ROLL_COMPLETED",
  stateVersion: version,
  occurredAt,
  actorPlayerId: 101,
  text,
  emphasis: "neutral",
});
const add = (state, options) => applyEventToHistory(state, eventEntry(options));

test("creates empty history for a valid game", () => {
  const state = createEventHistoryState(101);
  assert.deepEqual(state, { gameId: 101, entries: [], seenEventIds: [] });
});

test("adds the first valid event presentation", () => {
  const state = add(createEventHistoryState(101));
  assert.equal(state.entries.length, 1);
  assert.equal(state.entries[0].id, "event-1");
});

test("adds a second distinct event presentation", () => {
  let state = add(createEventHistoryState(101));
  state = add(state, { id: "event-2", version: 2 });
  assert.deepEqual(state.entries.map(entry => entry.id), ["event-1", "event-2"]);
});

test("decoded event text comes through the event model and Greek content boundary", () => {
  const decoded = parseGameEvent(JSON.stringify(turnUpdatedEvent), 101);
  const viewModel = buildEventViewModel({
    event: decoded,
    viewerPlayerId: 102,
    playerName: id => ({ 101: "Άννα", 102: "Νίκος" })[id],
    squareName: id => ({ 6: "ΒΙΒΛΙΟΘΗΚΗ" })[id],
  });
  const state = applyEventToHistory(createEventHistoryState(101), viewModel);
  assert.equal(state.entries.length, 1);
  assert.equal(state.entries[0].text, viewModel.text);
  assert.match(state.entries[0].text, /Άννα.*ΒΙΒΛΙΟΘΗΚΗ/u);
});

test("one grouped event model produces exactly one history entry", () => {
  const decoded = parseGameEvent(turnUpdatedEvent, 101);
  const viewModel = buildEventViewModel({
    event: decoded,
    viewerPlayerId: 102,
    playerName: id => ({ 101: "Άννα", 102: "Νίκος" })[id],
    squareName: () => "ΒΙΒΛΙΟΘΗΚΗ",
  });
  const state = applyEventToHistory(createEventHistoryState(101), viewModel);
  assert.equal(state.entries.length, 1);
  assert.match(state.entries[0].text, /έφερε 6/u);
  assert.match(state.entries[0].text, /ΒΙΒΛΙΟΘΗΚΗ/u);
});

test("ignores a duplicate event ID", () => {
  let state = add(createEventHistoryState(101));
  state = add(state, { text: "Αλλοιωμένο κείμενο." });
  assert.equal(state.entries.length, 1);
  assert.equal(state.entries[0].text, "Γεγονός.");
});

test("retains different event IDs", () => {
  let state = add(createEventHistoryState(101), { id: "event-a" });
  state = add(state, { id: "event-b" });
  assert.deepEqual(state.entries.map(entry => entry.id), ["event-a", "event-b"]);
});

test("keeps the deduplication LRU bounded to 256 IDs", () => {
  let state = createEventHistoryState(101);
  for (let index = 0; index <= EVENT_HISTORY_DEDUP_LIMIT; index += 1) {
    state = add(state, { id: `event-${index}`, version: index, occurredAt: at(index % 60) });
  }
  assert.equal(state.seenEventIds.length, EVENT_HISTORY_DEDUP_LIMIT);
  assert.equal(state.seenEventIds.includes("event-0"), false);
  assert.equal(state.seenEventIds.at(-1), `event-${EVENT_HISTORY_DEDUP_LIMIT}`);
});

test("touching a duplicate refreshes its LRU position without adding an entry", () => {
  let state = add(createEventHistoryState(101), { id: "event-a" });
  state = add(state, { id: "event-b", version: 2 });
  state = add(state, { id: "event-a" });
  assert.deepEqual(state.entries.map(entry => entry.id), ["event-a", "event-b"]);
  assert.deepEqual(state.seenEventIds, ["event-b", "event-a"]);
});

test("an event ID forgotten by the dedup window is eligible again", () => {
  let state = createEventHistoryState(101);
  for (let index = 0; index <= EVENT_HISTORY_DEDUP_LIMIT; index += 1) {
    state = add(state, { id: `event-${index}`, version: index, occurredAt: at(index % 60) });
  }
  state = add(state, { id: "event-0", version: 999, occurredAt: at(59) });
  assert.equal(state.entries.at(-1).id, "event-0");
  assert.equal(state.seenEventIds.at(-1), "event-0");
});

test("caps visible history at 100 entries", () => {
  let state = createEventHistoryState(101);
  for (let index = 0; index <= EVENT_HISTORY_LIMIT; index += 1) {
    state = add(state, { id: `event-${index}`, version: index, occurredAt: at(index % 60) });
  }
  assert.equal(state.entries.length, EVENT_HISTORY_LIMIT);
});

test("history overflow evicts the oldest ordered entry", () => {
  let state = createEventHistoryState(101);
  for (let index = 0; index <= EVENT_HISTORY_LIMIT; index += 1) {
    state = add(state, { id: `event-${index}`, version: index, occurredAt: at(index % 60) });
  }
  assert.equal(state.entries.some(entry => entry.id === "event-0"), false);
  assert.equal(state.entries[0].id, "event-1");
});

test("history overflow retains the newest ordered entry", () => {
  let state = createEventHistoryState(101);
  for (let index = 0; index <= EVENT_HISTORY_LIMIT; index += 1) {
    state = add(state, { id: `event-${index}`, version: index, occurredAt: at(index % 60) });
  }
  assert.equal(state.entries.at(-1).id, `event-${EVENT_HISTORY_LIMIT}`);
});

test("orders later state versions later", () => {
  let state = add(createEventHistoryState(101), { id: "later", version: 2 });
  state = add(state, { id: "earlier", version: 1 });
  assert.deepEqual(state.entries.map(entry => entry.id), ["earlier", "later"]);
});

test("reconciles out-of-order arrivals by authoritative metadata", () => {
  let state = add(createEventHistoryState(101), { id: "three", version: 3 });
  state = add(state, { id: "one", version: 1 });
  state = add(state, { id: "two", version: 2 });
  assert.deepEqual(state.entries.map(entry => entry.id), ["one", "two", "three"]);
});

test("an older late event does not replace the latest announcement candidate", () => {
  let state = add(createEventHistoryState(101), { id: "newer", version: 3 });
  state = add(state, { id: "older", version: 2 });
  assert.equal(selectLatestAnnounceableEntry(state).id, "newer");
});

test("uses server timestamp when state versions tie", () => {
  let state = add(createEventHistoryState(101), { id: "later", version: 4, occurredAt: at(2) });
  state = add(state, { id: "earlier", version: 4, occurredAt: at(1) });
  assert.deepEqual(state.entries.map(entry => entry.id), ["earlier", "later"]);
});

test("uses event ID as deterministic tie-breaker", () => {
  let state = add(createEventHistoryState(101), { id: "event-b", version: 4 });
  state = add(state, { id: "event-a", version: 4 });
  assert.deepEqual(state.entries.map(entry => entry.id), ["event-a", "event-b"]);
});

test("retains two event IDs that share one state version", () => {
  let state = add(createEventHistoryState(101), { id: "event-a", version: 4 });
  state = add(state, { id: "event-b", version: 4 });
  assert.equal(state.entries.length, 2);
});

test("inserts a non-authoritative gap marker", () => {
  const state = markEventHistoryGap(createEventHistoryState(101), {
    stateVersion: 3,
    occurredAt: at(3),
  });
  assert.deepEqual(state.entries[0], {
    id: null,
    kind: EVENT_HISTORY_GAP_KIND,
    stateVersion: 3,
    occurredAt: at(3),
    actorPlayerId: null,
    text: EVENT_HISTORY_CONTENT.gap,
    emphasis: "warning",
    announceable: true,
  });
});

test("suppresses repeated adjacent gap markers", () => {
  let state = markEventHistoryGap(createEventHistoryState(101), {
    stateVersion: 3,
    occurredAt: at(3),
  });
  const repeated = markEventHistoryGap(state, { stateVersion: 5, occurredAt: at(5) });
  assert.strictEqual(repeated, state);
  assert.equal(repeated.entries.length, 1);
});

test("retains a normal event after a gap marker", () => {
  let state = markEventHistoryGap(createEventHistoryState(101), {
    stateVersion: 3,
    occurredAt: at(3),
  });
  state = add(state, { id: "event-4", version: 4, occurredAt: at(4) });
  assert.deepEqual(state.entries.map(entry => entry.kind), [EVENT_HISTORY_GAP_KIND, "ROLL_COMPLETED"]);
});

test("a clean reconnect preserves state and adds no marker", () => {
  const state = add(createEventHistoryState(101));
  const reconnected = setEventHistoryGame(state, 101);
  assert.strictEqual(reconnected, state);
  assert.equal(reconnected.entries.some(entry => entry.kind === EVENT_HISTORY_GAP_KIND), false);
});

test("a page reload starts empty without fabricating a gap", () => {
  const reloaded = createEventHistoryState(101);
  assert.deepEqual(reloaded.entries, []);
});

test("the same game identity retains history and deduplication", () => {
  const state = add(createEventHistoryState(101));
  assert.strictEqual(setEventHistoryGame(state, 101), state);
});

test("a changed game identity clears history and deduplication", () => {
  const changed = setEventHistoryGame(add(createEventHistoryState(101)), 202);
  assert.deepEqual(changed, { gameId: 202, entries: [], seenEventIds: [] });
});

test("an invalid game identity fails closed", () => {
  const state = createEventHistoryState("101");
  assert.deepEqual(state, { gameId: null, entries: [], seenEventIds: [] });
  assert.strictEqual(applyEventToHistory(state, eventEntry()), state);
});

test("explicit clear removes history and deduplication for the current game", () => {
  const cleared = clearEventHistory(add(createEventHistoryState(101)));
  assert.deepEqual(cleared, { gameId: 101, entries: [], seenEventIds: [] });
});

test("ignores a null unsupported event projection", () => {
  const state = createEventHistoryState(101);
  assert.strictEqual(applyEventToHistory(state, null), state);
});

test("a malformed transport event is filtered before history", () => {
  const state = createEventHistoryState(101);
  const decoded = parseGameEvent("not-json", 101);
  const viewModel = buildEventViewModel({ event: decoded, playerName: () => "Άννα" });
  assert.equal(decoded, null);
  assert.equal(viewModel, null);
  assert.strictEqual(applyEventToHistory(state, viewModel), state);
});

test("malformed input does not mutate history", () => {
  const state = add(createEventHistoryState(101));
  assert.strictEqual(applyEventToHistory(state, { id: "raw-event" }), state);
  assert.equal(state.entries.length, 1);
});

test("history transitions do not mutate previous state", () => {
  const previous = add(createEventHistoryState(101));
  const snapshot = structuredClone(previous);
  const next = add(previous, { id: "event-2", version: 2 });
  assert.deepEqual(previous, snapshot);
  assert.notStrictEqual(next.entries, previous.entries);
  assert.notStrictEqual(next.seenEventIds, previous.seenEventIds);
});

test("history transitions do not mutate the supplied event model", () => {
  const model = eventEntry();
  const before = structuredClone(model);
  applyEventToHistory(createEventHistoryState(101), model);
  assert.deepEqual(model, before);
});

test("history copies event fields away from later caller mutation", () => {
  const model = eventEntry();
  const state = applyEventToHistory(createEventHistoryState(101), model);
  model.text = "Μεταγενέστερη αλλαγή.";
  assert.equal(state.entries[0].text, "Γεγονός.");
});

test("returned state, arrays, and entries reject accidental mutation", () => {
  const state = add(createEventHistoryState(101));
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.entries), true);
  assert.equal(Object.isFrozen(state.seenEventIds), true);
  assert.equal(Object.isFrozen(state.entries[0]), true);
  assert.throws(() => state.entries.push(eventEntry()), TypeError);
  assert.throws(() => { state.entries[0].text = "Αλλαγή"; }, TypeError);
});

test("latest-entry selector returns only the newest ordered entry", () => {
  let state = add(createEventHistoryState(101), { id: "newer", version: 2 });
  state = add(state, { id: "older", version: 1 });
  assert.equal(selectLatestHistoryEntry(state).id, "newer");
  assert.equal(selectLatestHistoryEntry(createEventHistoryState(101)), null);
});

test("latest announceable selector returns one concise newest entry", () => {
  let state = add(createEventHistoryState(101), { id: "event-1", version: 1 });
  state = add(state, { id: "event-2", version: 2, text: "Νεότερο γεγονός." });
  assert.deepEqual(selectLatestAnnounceableEntry(state), state.entries[1]);
  assert.equal(selectLatestAnnounceableEntry(createEventHistoryState(101)), null);
});

test("gap marker is a concise safe Greek announcement candidate", () => {
  const state = markEventHistoryGap(createEventHistoryState(101), {
    stateVersion: 3,
    occurredAt: at(3),
  });
  const announcement = selectLatestAnnounceableEntry(state);
  assert.equal(announcement.kind, EVENT_HISTORY_GAP_KIND);
  assert.equal(announcement.text, EVENT_HISTORY_CONTENT.gap);
  assert.doesNotMatch(announcement.text, /exception|stack|redis|stomp/iu);
});

test("invalid gap metadata is ignored without changing state", () => {
  const state = add(createEventHistoryState(101));
  assert.strictEqual(markEventHistoryGap(state, { stateVersion: 2, occurredAt: "invalid" }), state);
});
