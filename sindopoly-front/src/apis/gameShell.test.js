import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sourceRoot = new URL("../", import.meta.url);
const readSource = path => readFile(new URL(path, sourceRoot), "utf8");
const [shell, styles, game] = await Promise.all([
  readSource("features/game/shell/GameShell.jsx"),
  readSource("features/game/shell/GameShell.css"),
  readSource("pages/Game/Game.jsx"),
]);

test("GameShell exports one composition component", () => {
  assert.match(shell, /export default function GameShell/);
});

test("GameShell exposes a main landmark and required board region", () => {
  assert.match(shell, /<main/);
  assert.match(shell, /data-game-shell-region="board"/);
  assert.match(shell, /board: PropTypes\.node\.isRequired/);
});

test("header slot renders only when supplied", () => {
  assert.match(shell, /\{header && \(/);
  assert.match(shell, /data-game-shell-region="header"/);
});

test("players slot renders only when supplied", () => {
  assert.match(shell, /\{players && \(/);
  assert.match(shell, /data-game-shell-region="players"/);
});

test("context slot renders only when supplied", () => {
  assert.match(shell, /\{context && \(/);
  assert.match(shell, /data-game-shell-region="context"/);
});

test("actions slot renders only when supplied", () => {
  assert.match(shell, /\{actions && \(/);
  assert.match(shell, /data-game-shell-region="actions"/);
});

test("every absent optional slot collapses at the render boundary", () => {
  for (const region of ["header", "players", "context", "actions"]) {
    assert.match(shell, new RegExp(`\\{${region} && \\(`));
  }
});

test("slot DOM order stays header, players, board, context, actions", () => {
  const positions = ["header", "players", "board", "context", "actions"].map(
    region => shell.indexOf(`data-game-shell-region="${region}"`),
  );

  assert.ok(positions.every(position => position >= 0));
  assert.deepEqual(positions, [...positions].sort((left, right) => left - right));
});

test("populated slots activate deterministic layout modifiers", () => {
  for (const region of ["header", "players", "context", "actions"]) {
    assert.match(shell, new RegExp(`game-shell--has-${region}`));
  }
});

test("GameShell preserves supplied children without owning commands", () => {
  for (const child of ["header", "players", "board", "context", "actions"]) {
    assert.match(shell, new RegExp(`\\{${child}\\}`));
  }
  assert.doesNotMatch(shell, /onClick|dispatch|sendCommand|publish/);
});

test("GameShell has no gameplay, transport, fetch, or scene dependencies", () => {
  assert.doesNotMatch(shell, /axios|fetch\(|stomp|sockjs|three|gameService/i);
});

test("GameShell introduces no fake future gameplay copy", () => {
  assert.doesNotMatch(shell, /match status|event history|player rail|action tray/i);
});

test("responsive contract defines the wide breakpoint at 1501px", () => {
  assert.match(styles, /@media \(min-width: 1501px\)/);
});

test("responsive contract defines laptop from 1101px through 1500px", () => {
  assert.match(
    styles,
    /@media \(min-width: 1101px\) and \(max-width: 1500px\)/,
  );
});

test("responsive contract fixes the desktop and tablet shell to the viewport", () => {
  const desktopFrameStart = styles.indexOf("@media (min-width: 761px) {");
  const tabletFrameStart = styles.indexOf(
    "@media (min-width: 761px) and (max-width: 1100px)",
  );
  const desktopFrame = styles.slice(desktopFrameStart, tabletFrameStart);

  assert.ok(desktopFrameStart >= 0);
  assert.match(desktopFrame, /height: 100vh;\s+height: 100dvh;\s+min-height: 0;/);
  assert.match(desktopFrame, /grid-template-rows: minmax\(0, 1fr\)/);
  assert.match(
    desktopFrame,
    /\.game-live-board-region,\s+\.game-live-board\s+\{\s+min-height: 0;/,
  );
});

test("responsive contract defines tablet from 761px through 1100px", () => {
  assert.match(
    styles,
    /@media \(min-width: 761px\) and \(max-width: 1100px\)/,
  );
  assert.match(styles, /grid-template-rows: auto minmax\(0, 1fr\)/);
});

test("responsive contract defines phone at 760px", () => {
  assert.match(styles, /@media \(max-width: 760px\)/);
});

test("shell tracks shrink safely and spacing consumes approved tokens", () => {
  assert.match(styles, /minmax\(0, 1fr\)/);
  assert.match(styles, /min-width: 0/);
  assert.match(styles, /var\(--space-[234]\)/);
  assert.doesNotMatch(styles, /800px/);
});

test("board-only layout reserves no desktop side tracks", () => {
  const start = styles.indexOf(".game-shell__layout {");
  const end = styles.indexOf("}", start);
  const baseLayout = styles.slice(start, end);

  assert.match(baseLayout, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.doesNotMatch(baseLayout, /player-rail|context-panel/);
});

test("side regions collapse to one column at tablet and phone widths", () => {
  const combinedSelector =
    ".game-shell--has-players.game-shell--has-context .game-shell__layout";
  assert.equal(styles.split(combinedSelector).length - 1, 3);
});

test("Game route has one authoritative runtime and no legacy branch", () => {
  assert.match(game, /<AuthoritativeGame \/>/);
  assert.doesNotMatch(game, /FIRST_VERTICAL_SLICE_ENABLED|legacyBoard|<Board|GameShell board/u);
  assert.doesNotMatch(game, /w-\[800px\]/);
});
