export const MUSIC_STORAGE_KEY = "sindopoly.music.enabled";

let inMemoryMusicEnabled;

/**
 * Returns only explicit historic choices so a missing or malformed key can be
 * initialized when, and only when, gameplay begins.
 */
export function readStoredMusicEnabled(storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    const value = target?.getItem(MUSIC_STORAGE_KEY);
    return value === "true" ? true : value === "false" ? false : undefined;
  } catch {
    return undefined;
  }
}

export function readMusicEnabled(storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    const value = target?.getItem(MUSIC_STORAGE_KEY);
    return value === "true" ? true : value === "false" ? false : true;
  } catch {
    return inMemoryMusicEnabled ?? true;
  }
}

export function persistMusicEnabled(enabled, storage) {
  const next = enabled === true;
  try {
    const target = storage ?? globalThis.localStorage;
    target?.setItem(MUSIC_STORAGE_KEY, String(next));
  } catch {
    // Storage can be unavailable in privacy modes; audio remains session-local.
    inMemoryMusicEnabled = next;
  }
}
