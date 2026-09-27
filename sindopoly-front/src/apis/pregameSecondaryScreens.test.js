import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceRoot = new URL("../", import.meta.url);
const readSource = relativePath => readFile(new URL(relativePath, sourceRoot), "utf8");
const [search, lobby, statistics, styles, content] = await Promise.all([
  readSource("pages/SearchGame/SearchGame.jsx"),
  readSource("pages/Lobby/Lobby.jsx"),
  readSource("pages/Statistics/Statistics.jsx"),
  readSource("features/pregame/PregameShell.css"),
  readSource("features/game/content/el.js"),
]);

test("SearchGame uses the pregame shell with compact join rows and Greek state feedback", () => {
  assert.match(search, /<PregameShell/u);
  assert.match(search, /pregame-game-list/u);
  assert.match(search, /GameAPI\.joinGame\(game\.GameId, game\.StateVersion\)/u);
  assert.match(search, /SEARCH_GAME_CONTENT\.noGames/u);
  assert.match(search, /cancelText=\{SEARCH_GAME_CONTENT\.cancel\}/u);
  assert.doesNotMatch(search, /ConfigProvider|min-w-\[700px\]|bg-\[rgba/u);
});

test("Lobby preserves snapshot-version start behavior while distinguishing owner and waiting states", () => {
  assert.match(lobby, /setStateVersion\(snapshot\.stateVersion\)/u);
  assert.match(lobby, /GameAPI\.startGame\(gameId, playerId, stateVersion\)/u);
  assert.match(lobby, /disabled=\{!canStart\}/u);
  assert.match(lobby, /players\.length >= 2/u);
  assert.match(lobby, /LOBBY_CONTENT\.requiresPlayers/u);
  assert.match(lobby, /isOwner \? \(/u);
  assert.match(lobby, /LOBBY_CONTENT\.ownerWaiting/u);
  assert.match(lobby, /pregame-player-list/u);
  assert.doesNotMatch(lobby, /w-\[600px\]|bg-\[rgba|style=\{\{/u);
});

test("Statistics retains existing data fields in a readable pregame table and semantic personal summary", () => {
  assert.match(statistics, /<PregameShell/u);
  assert.match(statistics, /StatisticsAPI\.getLeaderboard\(\)/u);
  assert.match(statistics, /StatisticsAPI\.getUserStats\(playerId\)/u);
  assert.match(statistics, /<dl className="pregame-stat-grid">/u);
  assert.match(statistics, /className="pregame-table"/u);
  assert.match(statistics, /STATISTICS_CONTENT\.noLeaderboard/u);
  assert.doesNotMatch(statistics, /min-w-\[520px\]|bg-\[rgba|style=\{\{/u);
});

test("shared pregame styles provide reusable list, status, utility, and table primitives without global overflow masking", () => {
  assert.match(styles, /\.pregame-list__row/u);
  assert.match(styles, /\.pregame-empty/u);
  assert.match(styles, /\.pregame-table-wrap/u);
  assert.match(styles, /\.pregame-utility--destructive/u);
  assert.doesNotMatch(styles, /overflow-x:\s*hidden/u);
  assert.match(content, /title: "Βρες ένα παιχνίδι"/u);
  assert.match(content, /title: "Στατιστικά"/u);
  assert.match(content, /ownerWaiting: "Ο ιδιοκτήτης/u);
});
