import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const sourceRoot = fileURLToPath(new URL("../", import.meta.url));

test("supported nickname creation establishes and verifies the server session", async () => {
  const login = await source("pages/Login/Login.jsx");

  assert.match(login, /apiFetch\("\/api\/player-state\/create"/);
  assert.match(login, /csrf:\s*false/);
  assert.match(login, /AuthAPI\.getCurrentPlayer\(\)/);
  assert.doesNotMatch(login, legacyRoutePattern());
});

test("AuthContext restores identity through the current-player session API", async () => {
  const authContext = await source("AuthContext/AuthContext.jsx");

  assert.match(authContext, /AuthAPI\.getCurrentPlayer\(\)/);
  assert.match(authContext, /\.then\(\(player\)\s*=>\s*login\(player\)\)/);
  assert.match(authContext, /\.catch\(\(\)\s*=>\s*clearLocalIdentity\(\)\)/);
});

test("router retains every supported route and removes the stale token callback", async () => {
  const app = await source("App.jsx");
  for (const route of ["/login", "/", "/searchGame", "/lobby", "/Game", "/endgame", "/statistics"]) {
    assert.match(app, new RegExp(`path=["']${escapeRegExp(route)}["']`));
  }

  assert.doesNotMatch(app, legacyRoutePattern());
  assert.doesNotMatch(app, legacyComponentPattern());
});

test("active frontend source contains no stale token-exchange helper", async () => {
  const files = await frontendSourceFiles(sourceRoot);
  const matches = [];
  for (const file of files.filter((candidate) => !candidate.endsWith("authSessionContract.test.js"))) {
    const content = await readFile(file, "utf8");
    if (legacyHelperPattern().test(content) || legacyComponentPattern().test(content)) matches.push(file);
  }

  assert.deepEqual(matches, []);
});

test("FE-REVAMP-002 current-game session lookup remains wired", async () => {
  const authApi = await source("apis/AuthAPI.jsx");
  const home = await source("pages/Home/Home.jsx");

  assert.match(authApi, /getCurrentGame:\s*async/);
  assert.match(authApi, /\/api\/session\/current-game/);
  assert.match(home, /AuthAPI\.getCurrentGame\(\)/);
});

async function source(relativePath) {
  return readFile(fileURLToPath(new URL(relativePath, new URL("../", import.meta.url))), "utf8");
}

async function frontendSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return frontendSourceFiles(path);
    return /\.(js|jsx)$/.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

function legacyRoutePattern() {
  return new RegExp(`/get${"Token"}`, "i");
}

function legacyComponentPattern() {
  return new RegExp(`Get${"Token"}`);
}

function legacyHelperPattern() {
  return new RegExp(`exchangeCodeWith${"Token"}`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
