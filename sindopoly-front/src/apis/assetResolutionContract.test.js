import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendRoot = fileURLToPath(new URL("../../", import.meta.url));
const sourceRoot = fileURLToPath(new URL("../", import.meta.url));

test("dice model uses a Vite-resolved URL for the existing loader", async () => {
  const board = await source("pages/Game/Board.jsx");

  assert.match(
    board,
    /import\s+diceModelUrl\s+from\s+["']\.\.\/\.\.\/assets\/models\/Dice\.glb\?url["']/,
  );
  assert.match(board, /loader2\.load\(diceModelUrl,/);
  assert.doesNotMatch(board, rawAssetPathPattern("models/Dice.glb"));
});

test("background audio has one module-resolved owner and no raw audio element", async () => {
  const board = await source("pages/Game/Board.jsx");

  assert.match(
    board,
    /import\s+honeyJam\s+from\s+["']\.\.\/\.\.\/assets\/audio\/massobeats-honey_jam\.mp3["']/,
  );
  assert.match(board, /new Audio\(honeyJam\)/);
  assert.doesNotMatch(board, rawAssetPathPattern("audio/massobeats-honey_jam.mp3"));
  assert.doesNotMatch(board, /<audio\b/i);
});

test("active frontend source contains neither broken game-asset runtime path", async () => {
  const files = await frontendSourceFiles(sourceRoot);
  const matches = [];

  for (const file of files.filter((candidate) => !candidate.endsWith("assetResolutionContract.test.js"))) {
    const content = await readFile(file, "utf8");
    if (
      rawAssetPathPattern("models/Dice.glb").test(content)
      || rawAssetPathPattern("audio/massobeats-honey_jam.mp3").test(content)
    ) {
      matches.push(file);
    }
  }

  assert.deepEqual(matches, []);
});

test("working board and background asset conventions remain unchanged", async () => {
  const board = await source("pages/Game/Board.jsx");
  const tailwind = await readFile(`${frontendRoot}/tailwind.config.js`, "utf8");

  assert.match(board, /import\s+boardGLB\s+from\s+["']\.\.\/\.\.\/assets\/models\/board\.glb\?url["']/);
  assert.match(board, /loader\.load\(\s*boardGLB,/);
  assert.match(tailwind, /['"]pic['"]:\s*['"]url\(\.\/src\/assets\/images\/monopoly_bg\.png\)['"]/);
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

function rawAssetPathPattern(assetPath) {
  return new RegExp(`["']/?src/assets/${escapeRegExp(assetPath)}["']`, "i");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
