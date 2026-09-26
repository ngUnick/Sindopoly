import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceRoot = new URL("../", import.meta.url);
const source = path => readFile(new URL(path, sourceRoot), "utf8");
const [shell, styles, login, home, content] = await Promise.all([
  source("features/pregame/PregameShell.jsx"),
  source("features/pregame/PregameShell.css"),
  source("pages/Login/Login.jsx"),
  source("pages/Home/Home.jsx"),
  source("features/game/content/el.js"),
]);

test("shared pregame shell owns the existing background and semantic page hierarchy", () => {
  assert.match(shell, /<main className="pregame-shell">/u);
  assert.match(shell, /<section/u);
  assert.match(shell, /<h1 id=\{titleId\}>\{title\}<\/h1>/u);
  assert.match(styles, /monopoly_bg\.png/u);
  assert.match(styles, /min-height: 100dvh/u);
  assert.match(styles, /width: min\(100%, 34rem\)/u);
  assert.doesNotMatch(styles, /800px/u);
});

test("Login renders one prominent primary action and a Greek nickname dialog", () => {
  assert.match(login, /<PregameShell/u);
  assert.match(login, /className="pregame-primary"/u);
  assert.match(login, /\{LOGIN_CONTENT\.start\}/u);
  assert.match(login, /cancelText=\{LOGIN_CONTENT\.cancel\}/u);
  assert.match(login, /aria-label=\{LOGIN_CONTENT\.nicknamePlaceholder\}/u);
  assert.doesNotMatch(login, /w-\[800px\]|width=\{400\}|bg-\[rgba/u);
  assert.match(content, /cancel: "Ακύρωση"/u);
});

test("Home preserves navigation and gives primary, secondary, and utility actions distinct roles", () => {
  assert.match(home, /className="pregame-primary"/u);
  assert.equal((home.match(/className="pregame-secondary"/gu) ?? []).length, 2);
  assert.match(home, /navigate\("\/searchGame"\)/u);
  assert.match(home, /navigate\("\/statistics"\)/u);
  assert.match(home, /navigate\(`\/lobby\?game_id=\$\{gameId\}&visibility=\$\{visibility\}`\)/u);
  assert.match(home, /onClick=\{logout\}/u);
  assert.match(home, /cancelText=\{HOME_CONTENT\.cancel\}/u);
  assert.doesNotMatch(home, /ConfigProvider|w-\[800px\]|style=\{\{/u);
});

test("pregame styles preserve responsive stacking and scoped Ant overrides", () => {
  assert.match(styles, /\.pregame-modal \.ant-modal-content/u);
  assert.match(styles, /\.pregame-primary\.ant-btn/u);
  assert.match(styles, /@media \(max-width: 520px\)/u);
  assert.match(styles, /grid-template-columns: minmax\(0, 1fr\)/u);
  assert.match(styles, /--control-min-height/u);
  assert.doesNotMatch(styles, /overflow-x:\s*hidden/u);
});
