/* eslint-env node */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const run = promisify(execFile);

test("asset manifest validates every board, dice and pawn GLB within budgets", async () => {
  const { stdout } = await run(process.execPath, ["scripts/validate-assets.mjs"]);
  const report = JSON.parse(stdout);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.frameBudgetMs, 16.67);
  assert.equal(report.assets.length, 6);
  assert.deepEqual(
    report.assets.filter(asset => asset.id.startsWith("pawn-") && asset.maxTriangles === 3000)
      .map(asset => asset.id),
    ["pawn-backpack", "pawn-frappe-cup", "pawn-graduation-cap", "pawn-laptop"],
  );
  for (const asset of report.assets) {
    assert.ok(asset.bytes > 0);
    assert.ok(asset.meshes > 0);
    assert.ok(asset.bytes <= asset.maxBytes);
    assert.ok(asset.triangleCount <= asset.maxTriangles);
  }
});

test("student pawn GLBs preserve the shared mesh, material and scale contract", async () => {
  for (const name of ["Backpack", "FrappeCup", "GraduationCap", "Laptop"]) {
    const buffer = await readFile(new URL(`../assets/models/pawns/${name}.glb`, import.meta.url));
    const jsonLength = buffer.readUInt32LE(12);
    const document = JSON.parse(buffer.toString("utf8", 20, 20 + jsonLength).trim());
    const gltf = await new Promise((resolve, reject) => {
      new GLTFLoader().parse(
        buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
        "",
        resolve,
        reject,
      );
    });
    const materials = new Set();
    gltf.scene.traverse(object => {
      if (object.isMesh) materials.add(object.material.name);
    });
    const bounds = new THREE.Box3().setFromObject(gltf.scene);
    const size = bounds.getSize(new THREE.Vector3());

    assert.deepEqual([...materials].sort(), ["M_Accent", "M_Base", "M_Body", "M_Dark"], name);
    assert.equal(bounds.min.y, 0, `${name}: base must rest at local Y=0`);
    assert.ok(size.x <= 0.95 && size.z <= 0.95, `${name}: four-player footprint`);
    assert.ok(size.y >= 0.8 && size.y <= 1.15, `${name}: compatible height`);
    assert.equal(document.nodes.length, document.meshes.length, `${name}: no empty nodes`);
    assert.ok(document.nodes.every(node => node.mesh != null && !node.translation
      && !node.rotation && !node.scale), `${name}: baked identity transforms`);
    for (const field of ["images", "textures", "animations", "cameras"]) {
      assert.equal(document[field]?.length ?? 0, 0, `${name}: no ${field}`);
    }
    assert.equal(document.extensions?.KHR_lights_punctual?.lights?.length ?? 0, 0, `${name}: no lights`);
    assert.ok((document.buffers ?? []).every(entry => !entry.uri), `${name}: self-contained GLB`);
  }
});

test("scene adapter keeps the bounded animation and renderer frame safeguards", async () => {
  const source = await readFile(new URL("../features/game/board/BoardSceneAdapter.js", import.meta.url), "utf8");
  assert.match(source, /const DICE_PRESENTATION_DURATION_MS = DICE_PRESENTATION_TIMING\.anticipationMs/);
  assert.match(source, /resultHoldMs: 500/);
  assert.match(source, /Math\.min\(pixelRatio \|\| 1, 2\)/);
  assert.match(source, /if \(!this\.mounted \|\| this\.rafId !== null\) return false/);
});
