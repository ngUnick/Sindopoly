import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("snapshot, command, and STOMP boundaries invoke transport decoders", async () => {
  const gameApi = await source("GameAPI.jsx");
  const turnApi = await source("TurnAPI.jsx");
  const realtime = await source("realtimeSync.js");

  assert.match(gameApi, /decodeGameSnapshot/);
  assert.match(turnApi, /decodeThrowResult/);
  assert.match(turnApi, /decodeActionResult/);
  assert.match(realtime, /decodeGameEventBody/);
});

test("target API boundaries do not parse raw JSON directly", async () => {
  for (const path of [
    "AuthAPI.jsx", "GameAPI.jsx", "GamePlayAPI.jsx", "TurnAPI.jsx",
    "currentGame.js", "gameCommandState.js",
  ]) {
    assert.doesNotMatch(await source(path), /\.json\(\)/, path);
  }
});

test("ownership remains downstream from decoded structured snapshots", async () => {
  const gameApi = await source("GameAPI.jsx");
  const ownership = await source("ownershipProjection.js");

  assert.match(gameApi, /decodeGameSnapshot/);
  assert.match(ownership, /snapshot\?\.players/);
  assert.doesNotMatch(ownership, /JSON\.parse|fetch|STOMP|rent|afford/i);
});

test("current-game keeps its dedicated 204-compatible validation boundary", async () => {
  const currentGame = await source("currentGame.js");

  assert.match(currentGame, /allowNoContent:\s*true/);
  assert.match(currentGame, /decodeCurrentGame/);
});

async function source(relativePath) {
  return readFile(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}
