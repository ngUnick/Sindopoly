const versions = new Map();
const refreshRequired = new Set();

export function observeGameVersion(gameId, value) {
  const parsed = Number(value?.stateVersion ?? value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || gameId == null) return;
  const key = String(gameId);
  versions.set(key, Math.max(versions.get(key) ?? 0, parsed));
}

export function expectedGameVersion(gameId) {
  const key = String(gameId);
  if (refreshRequired.has(key)) {
    throw new Error("Game state is stale; refresh before sending another command");
  }
  const version = versions.get(key);
  if (!Number.isSafeInteger(version)) {
    throw new Error("Game state is not synchronized; refresh before sending a command");
  }
  return version;
}

export function observeGameSnapshot(gameId, value) {
  observeGameVersion(gameId, value);
  const parsed = Number(value?.stateVersion ?? value);
  if (Number.isSafeInteger(parsed) && parsed >= 0 && gameId != null) {
    refreshRequired.delete(String(gameId));
  }
}

export function commandHeaders(gameId, expectedVersion = expectedGameVersion(gameId)) {
  return {
    "X-Sindopoly-Command-Id": crypto.randomUUID(),
    "X-Sindopoly-Expected-Version": String(expectedVersion),
  };
}

export async function readCommandResponse(response, gameId) {
  const body = await response.json().catch(() => ({}));
  const resolvedGameId = gameId ?? body.gameId;
  if (!response.ok) {
    if (["STALE_STATE", "STALE_VERSION"].includes(body.reason) && resolvedGameId != null) {
      // A version alone is not a state snapshot. Block later intents until the
      // authoritative state is fetched instead of applying stale UI intent.
      refreshRequired.add(String(resolvedGameId));
    }
    const error = new Error(body.error || "Game command failed");
    error.reason = body.reason;
    error.stateVersion = body.stateVersion;
    // Stale commands require a fresh snapshot. Never blind-retry with a new version.
    throw error;
  }
  observeGameVersion(resolvedGameId, body);
  return body;
}

export function clearGameVersion(gameId) {
  versions.delete(String(gameId));
  refreshRequired.delete(String(gameId));
}
