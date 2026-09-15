import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("Board consumes the structured ownership projection without property string parsing", async () => {
  const board = await source("pages/Game/Board.jsx");

  assert.match(board, /deriveOwnershipProjection\(snapshot\)/);
  assert.match(board, /applyOwnershipToSquares\(positions, ownership\)/);
  assert.doesNotMatch(board, /currentProperties\.split/);
  assert.doesNotMatch(board, /JSON\.parse\(p\.properties\)/);
  assert.doesNotMatch(board, /updateProperties\(board\)/);
});

test("Board scene cleanup bounds active window listeners and the render RAF", async () => {
  const board = await source("pages/Game/Board.jsx");

  for (const event of ["mousedown", "mousemove", "mouseup", "resize"]) {
    assert.match(board, new RegExp(`window\\.addEventListener\\(["']${event}["']`));
    assert.match(board, new RegExp(`window\\.removeEventListener\\(["']${event}["']`));
  }
  assert.match(board, /cancelAnimationFrame\(animationFrameId\)/);
  assert.doesNotMatch(board, /window\.addEventListener\(["']resize["'],\s*\(\)\s*=>/);
});

test("legacy board adapter remains only as the current non-ownership compatibility boundary", async () => {
  const board = await source("pages/Game/Board.jsx");
  const gamePlayApi = await source("apis/GamePlayAPI.jsx");

  assert.match(gamePlayApi, /export function boardFromSnapshot/);
  assert.match(gamePlayApi, /properties:\s*JSON\.stringify\(p\.properties \?\? \[\]\)/);
  assert.match(gamePlayApi, /getSnapshot:\s*getAcceptedSnapshot/);
  assert.match(board, /boardFromSnapshot\(snapshot\)/);
});

test("ownership and lifecycle work preserves stabilized game assets", async () => {
  const board = await source("pages/Game/Board.jsx");

  assert.match(board, /new Audio\(honeyJam\)/);
  assert.match(board, /loader\.load\(\s*boardGLB,/);
  assert.match(board, /loader2\.load\(diceModelUrl,/);
});

async function source(relativePath) {
  return readFile(fileURLToPath(new URL(relativePath, new URL("../", import.meta.url))), "utf8");
}
