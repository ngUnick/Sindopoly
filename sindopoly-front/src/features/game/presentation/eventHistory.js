import { EVENT_HISTORY_CONTENT } from "../content/el.js";

export const EVENT_HISTORY_LIMIT = 100;
export const EVENT_HISTORY_DEDUP_LIMIT = 256;
export const EVENT_HISTORY_GAP_KIND = "HISTORY_GAP";

/** Creates presentation-only history for one mounted game route. */
export function createEventHistoryState(gameId) {
  return freezeState({
    gameId: isGameId(gameId) ? gameId : null,
    entries: [],
    seenEventIds: [],
  });
}

/** Retains the current session for the same game and clears it for a new game. */
export function setEventHistoryGame(state, gameId) {
  if (!isGameId(gameId)) return createEventHistoryState(null);
  if (isHistoryState(state) && state.gameId === gameId) return state;
  return createEventHistoryState(gameId);
}

/** Explicitly clears entries and deduplication without changing a valid game identity. */
export function clearEventHistory(state) {
  return createEventHistoryState(isHistoryState(state) ? state.gameId : null);
}

/** Adds one FE-REVAMP-008 event projection and never stores its raw event envelope. */
export function applyEventToHistory(state, eventViewModel) {
  if (!isHistoryState(state) || !isEventEntry(eventViewModel)) return state;

  if (state.seenEventIds.includes(eventViewModel.id)) {
    const seenEventIds = touchEventId(state.seenEventIds, eventViewModel.id);
    return seenEventIds === state.seenEventIds
      ? state
      : freezeState({ ...state, seenEventIds });
  }

  const entry = freezeEntry({
    id: eventViewModel.id,
    kind: eventViewModel.kind,
    stateVersion: eventViewModel.stateVersion,
    occurredAt: eventViewModel.occurredAt,
    actorPlayerId: eventViewModel.actorPlayerId,
    text: eventViewModel.text,
    emphasis: eventViewModel.emphasis,
    announceable: true,
  });
  const entries = [...state.entries, entry]
    .sort(compareEntries)
    .slice(-EVENT_HISTORY_LIMIT);
  const seenEventIds = touchEventId(state.seenEventIds, entry.id);
  return freezeState({ ...state, entries, seenEventIds });
}

/** Records proven loss without inventing server events or deriving snapshot narrative. */
export function markEventHistoryGap(state, { stateVersion, occurredAt } = {}) {
  if (!isHistoryState(state) || !isOrderMetadata(stateVersion, occurredAt)) return state;
  const latest = selectLatestHistoryEntry(state);
  if (latest?.kind === EVENT_HISTORY_GAP_KIND) return state;

  const marker = freezeEntry({
    id: null,
    kind: EVENT_HISTORY_GAP_KIND,
    stateVersion,
    occurredAt,
    actorPlayerId: null,
    text: EVENT_HISTORY_CONTENT.gap,
    emphasis: "warning",
    announceable: true,
  });
  const entries = [...state.entries, marker]
    .sort(compareEntries)
    .slice(-EVENT_HISTORY_LIMIT);
  return freezeState({ ...state, entries });
}

export function selectLatestHistoryEntry(state) {
  return isHistoryState(state) && state.entries.length > 0
    ? state.entries[state.entries.length - 1]
    : null;
}

/** Returns only the newest concise update; retained history is not replayed to a live region. */
export function selectLatestAnnounceableEntry(state) {
  if (!isHistoryState(state)) return null;
  for (let index = state.entries.length - 1; index >= 0; index -= 1) {
    if (state.entries[index].announceable) return state.entries[index];
  }
  return null;
}

function compareEntries(left, right) {
  const versionOrder = left.stateVersion - right.stateVersion;
  if (versionOrder !== 0) return versionOrder;
  const timeOrder = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
  if (timeOrder !== 0) return timeOrder;
  return compareText(left.id ?? "", right.id ?? "");
}

function compareText(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function touchEventId(eventIds, eventId) {
  if (eventIds[eventIds.length - 1] === eventId) return eventIds;
  return Object.freeze([
    ...eventIds.filter(candidate => candidate !== eventId),
    eventId,
  ].slice(-EVENT_HISTORY_DEDUP_LIMIT));
}

function isEventEntry(value) {
  return value != null
    && typeof value === "object"
    && hasText(value.id)
    && hasText(value.kind)
    && isOrderMetadata(value.stateVersion, value.occurredAt)
    && (value.actorPlayerId == null || isGameId(value.actorPlayerId))
    && hasText(value.text)
    && hasText(value.emphasis);
}

function isOrderMetadata(stateVersion, occurredAt) {
  return Number.isSafeInteger(stateVersion)
    && stateVersion >= 0
    && typeof occurredAt === "string"
    && Number.isFinite(Date.parse(occurredAt));
}

function isHistoryState(value) {
  return value != null
    && typeof value === "object"
    && isGameId(value.gameId)
    && Array.isArray(value.entries)
    && Array.isArray(value.seenEventIds);
}

function isGameId(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function freezeEntry(entry) {
  return Object.freeze(entry);
}

function freezeState({ gameId, entries, seenEventIds }) {
  return Object.freeze({
    gameId,
    entries: Object.freeze(entries),
    seenEventIds: Object.freeze(seenEventIds),
  });
}
