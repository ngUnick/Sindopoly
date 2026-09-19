export const MUSIC_STORAGE_KEY = "sindopoly.music.enabled";

export function readMusicEnabled(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(MUSIC_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function persistMusicEnabled(enabled, storage = globalThis.localStorage) {
  try {
    storage?.setItem(MUSIC_STORAGE_KEY, String(enabled === true));
  } catch {
    // Storage can be unavailable in privacy modes; audio remains session-local.
  }
}
