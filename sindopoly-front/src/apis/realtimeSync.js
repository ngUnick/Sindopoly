const EVENT_TYPES = new Set([
  "LOBBY_UPDATED", "GAME_STARTED", "TURN_UPDATED", "GAME_COMPLETED",
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
  return { ...value, stateVersion: version };
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
