import { decodeVersionedCommandResult } from "./transportDecoders.js";
import { readJsonResponse, TRANSPORT_ERROR_CODES } from "./transportError.js";

const versions = new Map();
const snapshotVersions = new Map();
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
    const key = String(gameId);
    snapshotVersions.set(key, Math.max(snapshotVersions.get(key) ?? 0, parsed));
    refreshRequired.delete(String(gameId));
  }
}

export function currentGameVersion(gameId) {
  return snapshotVersions.get(String(gameId));
}

/** Apply snapshots monotonically so a late HTTP response cannot roll the UI back. */
export function acceptGameSnapshot(gameId, value) {
  const parsed = Number(value?.stateVersion);
  const current = currentGameVersion(gameId);
  if (!Number.isSafeInteger(parsed) || parsed < 0 ||
      (Number.isSafeInteger(current) && parsed < current)) return false;
  observeGameSnapshot(gameId, value);
  return true;
}

export function commandHeaders(gameId, expectedVersion = expectedGameVersion(gameId)) {
  return {
    "X-Sindopoly-Command-Id": crypto.randomUUID(),
    "X-Sindopoly-Expected-Version": String(expectedVersion),
  };
}

export async function readCommandResponse(
  response, gameId, decoder = decodeVersionedCommandResult,
) {
  let body;
  try {
    body = await readJsonResponse(response, { decoder });
  } catch (error) {
    if (error.code === TRANSPORT_ERROR_CODES.STALE_STATE && gameId != null) {
      // A version alone is not a state snapshot. Block later intents until the
      // authoritative state is fetched instead of applying stale UI intent.
      refreshRequired.add(String(gameId));
    }
    // Stale commands require a fresh snapshot. Never blind-retry with a new version.
    throw error;
  }
  const resolvedGameId = gameId ?? body.gameId;
  observeGameVersion(resolvedGameId, body);
  return body;
}

export function clearGameVersion(gameId) {
  versions.delete(String(gameId));
  snapshotVersions.delete(String(gameId));
  refreshRequired.delete(String(gameId));
}
