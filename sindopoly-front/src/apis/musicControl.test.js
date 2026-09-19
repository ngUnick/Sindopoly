import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MUSIC_STORAGE_KEY, persistMusicEnabled, readMusicEnabled } from "../features/game/hud/musicPreference.js";

function storage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("music preference is opt-in and persists only the user choice", () => {
  const target = storage();
  assert.equal(readMusicEnabled(target), false);
  persistMusicEnabled(true, target);
  assert.equal(target.getItem(MUSIC_STORAGE_KEY), "true");
  assert.equal(readMusicEnabled(target), true);
  persistMusicEnabled(false, target);
  assert.equal(readMusicEnabled(target), false);
});

test("music control is gesture-gated, looped, and safe without Audio", async () => {
  const source = await readFile(new URL("../features/game/hud/MusicControl.js", import.meta.url), "utf8");
  assert.match(source, /onClick: toggle/);
  assert.match(source, /audioRef\.current\.play\(\)/);
  assert.match(source, /audioRef\.current\.loop = true/);
  assert.match(source, /if \(!globalThis\.Audio\) return/);
  assert.match(source, /audioRef\.current\?\.pause\(\)/);
});
