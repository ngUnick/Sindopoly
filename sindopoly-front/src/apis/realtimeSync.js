import { decodeGameEventBody } from "./gameEventDecoder.js";

export function parseGameEvent(raw, expectedGameId) {
  try {
    return decodeGameEventBody(raw, expectedGameId);
  } catch {
    return null;
  }
}

/** Details are shown once and only when they are not older than accepted authoritative state. */
export function shouldDisplayGameEvent(event, currentVersion, lastDisplayedVersion) {
  return Boolean(event) && event.unsupported == null &&
    event.stateVersion >= (currentVersion ?? -1) &&
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
