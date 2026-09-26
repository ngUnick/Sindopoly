import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildStartGameRequest } from "./gameStartRequest.js";
import { readCommandResponse } from "./gameCommandState.js";
import { TRANSPORT_ERROR_CODES } from "./transportError.js";

test("start request keeps game identity in the route and snapshot version in the header", () => {
  const request = buildStartGameRequest(114, 114, 3);

  assert.equal(request.path, "/api/game-state/114/start?playerId=114");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers["X-Sindopoly-Expected-Version"], "3");
  assert.notEqual(request.options.headers["X-Sindopoly-Expected-Version"], "114");
  assert.match(request.options.headers["X-Sindopoly-Command-Id"], /^[0-9a-f-]{36}$/u);
});

test("start request requires a current non-negative integer version", () => {
  for (const value of [undefined, null, "", -1, 1.5, "not-a-version"]) {
    assert.throws(
      () => buildStartGameRequest(114, 114, value),
      /not synchronized/u,
    );
  }
});

test("a stale start response remains a surfaced conflict and is never retried", async () => {
  let reads = 0;
  const response = {
    status: 409,
    ok: false,
    text: async () => {
      reads += 1;
      return JSON.stringify({ reason: "STALE_STATE", stateVersion: 4 });
    },
  };

  await assert.rejects(
    readCommandResponse(response, 114),
    error => error.code === TRANSPORT_ERROR_CODES.STALE_STATE
      && error.httpStatus === 409
      && error.stateVersion === 4,
  );
  assert.equal(reads, 1);
});

test("GameAPI and lobby preserve the explicit snapshot version call chain", async () => {
  const gameApiPath = fileURLToPath(new URL("./GameAPI.jsx", import.meta.url));
  const lobbyPath = fileURLToPath(new URL("../pages/Lobby/Lobby.jsx", import.meta.url));
  const [gameApiSource, lobbySource] = await Promise.all([
    readFile(gameApiPath, "utf8"), readFile(lobbyPath, "utf8"),
  ]);

  assert.match(gameApiSource, /startGame: async \(gameId, playerId, stateVersion\)/u);
  assert.match(gameApiSource, /buildStartGameRequest\(gameId, playerId, stateVersion\)/u);
  assert.match(lobbySource, /setStateVersion\(snapshot\.stateVersion\)/u);
  assert.match(lobbySource, /GameAPI\.startGame\(gameId, playerId, stateVersion\)/u);
  assert.match(lobbySource, /disabled=\{!canStart\}/u);
});
