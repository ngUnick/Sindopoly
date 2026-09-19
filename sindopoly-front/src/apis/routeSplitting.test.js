import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("route entry uses lazy boundaries and a Greek loading fallback", async () => {
  const app = await source("App.jsx");
  assert.match(app, /lazy\(\(\) => import\(['"]\.\/pages\/Game\/Game\.jsx['"]\)\)/u);
  assert.ok(app.includes("<Suspense fallback={<RouteLoadingFallback />}>") );
  assert.doesNotMatch(app, /import\s+Game\s+from/u);
  assert.doesNotMatch(app, /import\s+.*BoardSceneAdapter|from ['"]three['"]/u);
  assert.match(app, /CONNECTION_CONTENT\.gameLoading/u);
});

test("secondary screens consume the shared Greek content boundary", async () => {
  const [content, login, home, search, lobby, statistics] = await Promise.all([
    source("features/game/content/el.js"),
    source("pages/Login/Login.jsx"),
    source("pages/Home/Home.jsx"),
    source("pages/SearchGame/SearchGame.jsx"),
    source("pages/Lobby/Lobby.jsx"),
    source("pages/Statistics/Statistics.jsx"),
  ]);
  assert.match(content, /export const LOGIN_CONTENT/u);
  assert.match(content, /export const SEARCH_GAME_CONTENT/u);
  assert.match(content, /export const STATISTICS_CONTENT/u);
  for (const [name, screen] of Object.entries({ login, home, search, lobby, statistics })) {
    assert.match(screen, /CONTENT/u, `${name} should render through the Greek content boundary`);
  }
});
