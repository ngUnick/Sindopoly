import assert from "node:assert/strict";
import test from "node:test";

import { continueGameRoute, readCurrentGameResponse } from "./currentGame.js";

test("in-progress response builds a route with authoritative game and legacy player IDs", async () => {
  const current = await readCurrentGameResponse(okResponse({
    gameId: 17, status: "inProgress", stateVersion: 4, visibility: "public",
  }));

  assert.equal(continueGameRoute(current, 9), "/Game?game=17&player=9");
});

test("lobby response builds the existing route with authoritative game ID and visibility", async () => {
  const current = await readCurrentGameResponse(okResponse({
    gameId: 18, status: "lobby", stateVersion: 2, visibility: "private",
  }));

  assert.equal(continueGameRoute(current, 9), "/lobby?game_id=18&visibility=private");
});

test("no-content response produces no continue navigation", async () => {
  const current = await readCurrentGameResponse({ status: 204, ok: true });

  assert.equal(current, null);
  assert.equal(continueGameRoute(current, 9), null);
});

test("failed response rejects instead of becoming no-game", async () => {
  await assert.rejects(
    readCurrentGameResponse({ status: 503, ok: false }),
    (error) => error.status === 503,
  );
});

test("unauthenticated response preserves status for the session flow", async () => {
  await assert.rejects(
    readCurrentGameResponse({ status: 401, ok: false }),
    (error) => error.status === 401,
  );
});

test("missing or invalid game ID fails safely", async () => {
  await assert.rejects(readCurrentGameResponse(okResponse({
    status: "inProgress", stateVersion: 4, visibility: "public",
  })));
  await assert.rejects(readCurrentGameResponse(okResponse({
    gameId: "not-a-game", status: "inProgress", stateVersion: 4, visibility: "public",
  })));
});

test("continue never emits the old player-only Game route", () => {
  assert.equal(continueGameRoute(null, 9), null);
  assert.notEqual(
    continueGameRoute({ gameId: 17, status: "inProgress", stateVersion: 4, visibility: "public" }, 9),
    "/Game?player=9",
  );
});

function okResponse(body) {
  return { status: 200, ok: true, json: async () => body };
}
