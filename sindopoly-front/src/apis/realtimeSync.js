const EVENT_TYPES = new Set([
  "LOBBY_UPDATED", "GAME_STARTED", "TURN_UPDATED", "GAME_COMPLETED",
]);
const DETAIL_TYPES = new Set([
  "DICE_ROLLED", "PLAYER_MOVED", "LANDED_ON_TILE", "PROPERTY_AVAILABLE",
  "PROPERTY_PURCHASED", "PROPERTY_DECLINED", "RENT_PAID", "TAX_PAID",
  "CARD_DRAWN", "MONEY_RECEIVED", "TURN_CHANGED", "PLAYER_JAILED",
  "PLAYER_RELEASED", "JAIL_EXIT_AVAILABLE",
]);

export function parseGameEvent(raw, expectedGameId) {
  let value;
  try {
    value = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  const version = Number(value?.stateVersion);
  if (!value || typeof value.eventId !== "string" || !EVENT_TYPES.has(value.eventType) ||
      String(value.gameId) !== String(expectedGameId) ||
      !Number.isSafeInteger(version) || version < 0) return null;
  const actor = value.payload?.actorPlayerId;
  const details = value.payload?.details ?? [];
  if (actor != null && (!Number.isSafeInteger(Number(actor)) || Number(actor) <= 0)) return null;
  if (!Array.isArray(details) || details.length > 12 ||
      details.some(detail => !detail || !DETAIL_TYPES.has(detail.type))) return null;
  return { ...value, stateVersion: version, payload: {
    ...value.payload,
    actorPlayerId: actor == null ? null : Number(actor),
    details,
  } };
}

/** Details are shown once and only when they are not older than accepted authoritative state. */
export function shouldDisplayGameEvent(event, currentVersion, lastDisplayedVersion) {
  return Boolean(event) && event.stateVersion >= (currentVersion ?? -1) &&
    event.stateVersion > lastDisplayedVersion;
}

/** Coalesces event bursts and guarantees one follow-up when a newer event races an HTTP read. */
export function createSnapshotSynchronizer({ gameId, currentVersion, fetchSnapshot, applySnapshot }) {
  let targetVersion = -1;
  let inFlight = null;
  let requestedGeneration = 0;

  const refresh = (target = -1) => {
    targetVersion = Math.max(targetVersion, target);
    requestedGeneration += 1;
    if (inFlight) return inFlight;
    inFlight = (async () => {
      let observedGeneration;
      do {
        observedGeneration = requestedGeneration;
        const snapshot = await fetchSnapshot(gameId);
        if (applySnapshot(gameId, snapshot)) targetVersion = Math.max(targetVersion, snapshot.stateVersion);
      } while (observedGeneration !== requestedGeneration &&
               (currentVersion(gameId) ?? -1) < targetVersion);
    })().finally(() => { inFlight = null; });
    return inFlight;
  };

  return {
    onConnect: () => refresh(currentVersion(gameId) ?? -1),
    onEvent: (raw) => {
      const event = parseGameEvent(raw, gameId);
      if (!event || event.stateVersion <= (currentVersion(gameId) ?? -1)) return Promise.resolve(false);
      return refresh(event.stateVersion).then(() => true);
    },
    refresh,
  };
}
