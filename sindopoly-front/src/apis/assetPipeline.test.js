/* eslint-env node */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import test from "node:test";

const run = promisify(execFile);

test("asset manifest validates every board, dice and pawn GLB within budgets", async () => {
  const { stdout } = await run(process.execPath, ["scripts/validate-assets.mjs"]);
  const report = JSON.parse(stdout);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.frameBudgetMs, 16.67);
  assert.equal(report.assets.length, 6);
  for (const asset of report.assets) {
    assert.ok(asset.bytes > 0);
    assert.ok(asset.meshes > 0);
    assert.ok(asset.bytes <= asset.maxBytes);
    assert.ok(asset.triangleCount <= asset.maxTriangles);
  }
});

test("scene adapter keeps the bounded animation and renderer frame safeguards", async () => {
  const source = await readFile(new URL("../features/game/board/BoardSceneAdapter.js", import.meta.url), "utf8");
  assert.match(source, /const DICE_ANIMATION_DURATION_MS = 760/);
  assert.match(source, /Math\.min\(pixelRatio \|\| 1, 2\)/);
  assert.match(source, /if \(!this\.mounted \|\| this\.rafId !== null\) return false/);
});
