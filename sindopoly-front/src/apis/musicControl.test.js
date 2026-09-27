import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { GameplayMusicController } from "../features/game/hud/GameplayMusicController.js";
import {
  MUSIC_STORAGE_KEY,
  persistMusicEnabled,
  readMusicEnabled,
  readStoredMusicEnabled,
} from "../features/game/hud/musicPreference.js";

function storage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

function documentTarget() {
  const handlers = new Map();
  return {
    addEventListener: (type, handler) => handlers.set(type, handler),
    removeEventListener: (type, handler) => {
      if (handlers.get(type) === handler) handlers.delete(type);
    },
    dispatch: type => handlers.get(type)?.(),
    has: type => handlers.has(type),
  };
}

function audioConstructor(outcomes = []) {
  const instances = [];
  class AudioMock {
    constructor(source) {
      this.source = source;
      this.playCalls = 0;
      this.pauseCalls = 0;
      instances.push(this);
    }

    play() {
      this.playCalls += 1;
      return outcomes.shift() ?? Promise.resolve();
    }

    pause() {
      this.pauseCalls += 1;
    }
  }
  return { AudioMock, instances };
}

test("music preference defaults ON, honors explicit values, and persists only at gameplay start", () => {
  const target = storage();
  assert.equal(readStoredMusicEnabled(target), undefined);
  assert.equal(readMusicEnabled(target), true);
  persistMusicEnabled(true, target);
  assert.equal(target.getItem(MUSIC_STORAGE_KEY), "true");
  assert.equal(readMusicEnabled(target), true);
  persistMusicEnabled(false, target);
  assert.equal(readMusicEnabled(target), false);
});

test("first game starts one looping track and persists ON", async () => {
  const target = storage();
  const { AudioMock, instances } = audioConstructor();
  const controller = new GameplayMusicController({ source: "track", storage: target, AudioConstructor: AudioMock, documentTarget: documentTarget() });
  controller.start();
  await Promise.resolve();
  assert.equal(target.getItem(MUSIC_STORAGE_KEY), "true");
  assert.equal(controller.getEnabled(), true);
  assert.equal(instances.length, 1);
  assert.equal(instances[0].playCalls, 1);
  assert.equal(instances[0].loop, true);
  assert.equal(instances[0].volume, 0.5);
  controller.start();
  assert.equal(instances.length, 1);
});

test("stored OFF remains silent, while mute and unmute immediately persist and control playback", async () => {
  const target = storage();
  persistMusicEnabled(false, target);
  const { AudioMock, instances } = audioConstructor();
  const controller = new GameplayMusicController({ source: "track", storage: target, AudioConstructor: AudioMock, documentTarget: documentTarget() });
  controller.start();
  assert.equal(instances.length, 0);
  assert.equal(controller.toggle(), true);
  await Promise.resolve();
  assert.equal(target.getItem(MUSIC_STORAGE_KEY), "true");
  assert.equal(instances[0].playCalls, 1);
  assert.equal(controller.toggle(), false);
  assert.equal(target.getItem(MUSIC_STORAGE_KEY), "false");
  assert.equal(instances[0].pauseCalls, 1);
});

test("autoplay rejection preserves ON, retries once after interaction, and cleans up", async () => {
  const target = storage();
  const documentMock = documentTarget();
  const { AudioMock, instances } = audioConstructor([Promise.reject(new Error("blocked")), Promise.resolve()]);
  const controller = new GameplayMusicController({ source: "track", storage: target, AudioConstructor: AudioMock, documentTarget: documentMock });
  controller.start();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(controller.getEnabled(), true);
  assert.equal(target.getItem(MUSIC_STORAGE_KEY), "true");
  assert.equal(documentMock.has("pointerdown"), true);
  documentMock.dispatch("pointerdown");
  await Promise.resolve();
  assert.equal(instances[0].playCalls, 2);
  assert.equal(documentMock.has("pointerdown"), false);
  assert.equal(documentMock.has("keydown"), false);
});

test("mute before an autoplay retry and leaving gameplay prevent unexpected playback", async () => {
  const target = storage();
  const documentMock = documentTarget();
  const { AudioMock, instances } = audioConstructor([Promise.reject(new Error("blocked"))]);
  const controller = new GameplayMusicController({ source: "track", storage: target, AudioConstructor: AudioMock, documentTarget: documentMock });
  controller.start();
  await Promise.resolve();
  await Promise.resolve();
  controller.toggle();
  documentMock.dispatch("pointerdown");
  assert.equal(instances[0].playCalls, 1);
  assert.equal(instances[0].pauseCalls, 1);
  controller.stop();
  assert.equal(instances[0].pauseCalls, 2);
});

test("storage failures retain the usable in-memory preference", () => {
  const brokenStorage = {
    getItem: () => { throw new Error("unavailable"); },
    setItem: () => { throw new Error("unavailable"); },
  };
  const controller = new GameplayMusicController({ source: "track", storage: brokenStorage, AudioConstructor: null, documentTarget: documentTarget() });
  controller.start();
  assert.equal(controller.getEnabled(), true);
  assert.equal(controller.toggle(), false);
  assert.equal(readMusicEnabled(brokenStorage), false);
});

test("music control mounts only in authoritative gameplay and preserves accessible toggle semantics", async () => {
  const source = await readFile(new URL("../features/game/hud/MusicControl.js", import.meta.url), "utf8");
  const gameSource = await readFile(new URL("../pages/Game/AuthoritativeGame.jsx", import.meta.url), "utf8");
  assert.match(source, /onClick: toggle/);
  assert.match(source, /"aria-pressed": enabled/);
  assert.match(gameSource, /<MusicControl \/>/);
});
