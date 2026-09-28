import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import {
  BOARD_ARTWORK_COLOR_MULTIPLIER,
  BOARD_SURFACE_Y,
  BoardSceneAdapter,
  CAMERA_ZOOM_BOUNDS,
  DEFAULT_CAMERA_STATE,
  DICE_FACE_ORIENTATIONS,
  DICE_PRESENTATION_TIMING,
  DICE_SURFACE_CLEARANCE,
  PAWN_MOVEMENT_TIMING,
  disposeObjectGraph,
  disposeObjectGraphs,
  calibrateBoardArtworkMaterials,
} from "../features/game/board/BoardSceneAdapter.js";
import { PAWN_SLOT_ASSETS } from "../features/game/board/pawnAssets.js";
import { getPawnAnchor } from "../features/game/board/boardCalibration.js";

const DICE_MOTION_DURATION_MS = DICE_PRESENTATION_TIMING.anticipationMs
  + DICE_PRESENTATION_TIMING.rollMs
  + DICE_PRESENTATION_TIMING.settleMs;
const DICE_PRESENTATION_DURATION_MS = DICE_MOTION_DURATION_MS
  + DICE_PRESENTATION_TIMING.resultHoldMs;
const DICE_CAMERA_RESTORE_AT_MS = DICE_MOTION_DURATION_MS
  + DICE_PRESENTATION_TIMING.cameraRestoreDelayMs;

test("mount creates one scene, renderer, canvas, frame and listener set", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();

  assert.equal(adapter.mount(harness.container), true);
  assert.ok(adapter.scene instanceof THREE.Scene);
  assert.equal(harness.renderers.length, 1);
  assert.equal(harness.container.children.length, 1);
  assert.equal(harness.environment.pendingFrames.size, 1);
  assert.equal(harness.environment.listenerCount("resize"), 1);
  assertCanvasListeners(harness.renderers[0].domElement, 1);
  assert.equal(harness.renderers[0].outputColorSpace, THREE.SRGBColorSpace);
  assert.equal(harness.renderers[0].shadowMap.enabled, true);
  assert.equal(harness.renderers[0].shadowMap.type, THREE.PCFSoftShadowMap);

  harness.environment.runNextFrame();
  assert.equal(harness.renderers[0].renderCalls, 1);
  assert.equal(harness.environment.pendingFrames.size, 0, "the adapter must have no permanent idle RAF");
});

test("resize updates renderer, camera projection and schedules no extra listeners", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  harness.environment.runNextFrame();
  const previousProjection = adapter.camera.projectionMatrix.clone();

  assert.equal(adapter.resize(800, 400, 3), true);
  assert.deepEqual(harness.renderers[0].sizes.at(-1), [800, 400]);
  assert.equal(harness.renderers[0].pixelRatios.at(-1), 2);
  assert.equal(adapter.camera.aspect, 2);
  assert.notDeepEqual(adapter.camera.projectionMatrix, previousProjection);
  adapter.resize(900, 600, 1);
  assert.equal(harness.environment.listenerCount("resize"), 1);
  assertCanvasListeners(harness.renderers[0].domElement, 1);
  assert.equal(harness.environment.pendingFrames.size, 1, "resize invalidations coalesce");
});

test("mount and container resize stay bounded to the shell board region", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();

  adapter.mount(harness.container);
  assert.deepEqual(harness.renderers[0].sizes[0], [640, 480]);
  assert.equal(harness.environment.resizeObservers.length, 1);
  assert.deepEqual(harness.environment.resizeObservers[0].targets, [harness.container]);

  harness.container.clientWidth = 500;
  harness.container.clientHeight = 360;
  harness.environment.emitContainerResize();
  assert.deepEqual(harness.renderers[0].sizes.at(-1), [500, 360]);

  adapter.dispose();
  assert.equal(harness.environment.resizeObservers[0].disconnected, true);
});

test("pointer orbit remains bounded to the mounted listener lifecycle", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  harness.environment.runNextFrame();

  const canvas = harness.renderers[0].domElement;
  let prevented = 0;
  canvas.emit("pointerdown", {
    button: 0,
    pointerId: 7,
    clientX: 10,
    preventDefault: () => { prevented += 1; },
  });
  canvas.emit("pointermove", { pointerId: 7, clientX: 20 });
  canvas.emit("pointerup", { pointerId: 7 });

  assert.notEqual(adapter.camera.position.z, 0);
  assert.deepEqual(canvas.capturedPointers, [7]);
  assert.deepEqual(canvas.releasedPointers, [7]);
  assert.equal(prevented, 1, "an intentional canvas drag cannot scroll an overflowing page");
  assert.equal(harness.environment.pendingFrames.size, 1);
});

test("lighting uses one soft board-sized key shadow with readable ambient fill", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  const ambient = adapter.scene.children.find(object => object.isAmbientLight);
  const directional = adapter.scene.children.find(object => object.isDirectionalLight);

  assert.equal(ambient.intensity, 2);
  assert.equal(directional.intensity, 3.75);
  assert.deepEqual(directional.position.toArray(), [18, 36, -16]);
  assert.equal(directional.castShadow, true);
  assert.equal(directional.shadow.mapSize.x, 1024);
  assert.equal(directional.shadow.mapSize.y, 1024);
  assert.deepEqual({
    left: directional.shadow.camera.left,
    right: directional.shadow.camera.right,
    top: directional.shadow.camera.top,
    bottom: directional.shadow.camera.bottom,
    near: directional.shadow.camera.near,
    far: directional.shadow.camera.far,
  }, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 80 });
  assert.equal(directional.shadow.bias, -0.00015);
  assert.equal(directional.shadow.normalBias, 0.025);
  assert.ok(adapter.pawns.every(pawn => pawn.userData.primitiveFallback.castShadow
    && pawn.userData.primitiveFallback.receiveShadow));
});

test("camera interaction begins only on the canvas and pointer cancellation cannot stick", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  harness.environment.runNextFrame();
  const initial = adapter.camera.position.toArray();

  harness.environment.emit("pointerdown", { button: 0, pointerId: 1, clientX: 10 });
  harness.environment.emit("pointermove", { pointerId: 1, clientX: 80 });
  assert.deepEqual(adapter.camera.position.toArray(), initial, "HUD/window input cannot orbit the canvas");

  const canvas = harness.renderers[0].domElement;
  canvas.emit("pointerdown", { button: 0, pointerId: 2, clientX: 10 });
  canvas.emit("pointercancel", { pointerId: 2 });
  canvas.emit("pointermove", { pointerId: 2, clientX: 80 });
  assert.deepEqual(adapter.camera.position.toArray(), initial);
});

test("canvas wheel zoom is bounded and HUD wheel input is ignored", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter({ reducedMotion: true });
  adapter.mount(harness.container);
  harness.environment.runNextFrame();
  const canvas = harness.renderers[0].domElement;
  let prevented = 0;

  harness.environment.emit("wheel", { deltaY: -10_000 });
  assert.equal(adapter.camera.position.length(), new THREE.Vector3(...DEFAULT_CAMERA_STATE.position).length());
  canvas.emit("wheel", { deltaY: -10_000, preventDefault: () => { prevented += 1; } });
  assert.ok(Math.abs(adapter.camera.position.distanceTo(adapter.cameraTarget) - CAMERA_ZOOM_BOUNDS.minimum) < 0.001);
  canvas.emit("wheel", { deltaY: 10_000, preventDefault: () => { prevented += 1; } });
  assert.ok(Math.abs(adapter.camera.position.distanceTo(adapter.cameraTarget) - CAMERA_ZOOM_BOUNDS.maximum) < 0.001);
  assert.equal(prevented, 2);
});

test("reset restores the canonical camera state and reduced motion snaps", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter({ reducedMotion: true });
  adapter.mount(harness.container);
  harness.environment.runNextFrame();
  adapter.camera.position.set(-10, 45, 12);
  adapter.cameraTarget.set(2, 0, 3);

  assert.equal(adapter.resetCamera(), true);
  assert.deepEqual(adapter.camera.position.toArray(), [...DEFAULT_CAMERA_STATE.position]);
  assert.deepEqual(adapter.cameraTarget.toArray(), [...DEFAULT_CAMERA_STATE.target]);
  assert.equal(adapter.camera.fov, DEFAULT_CAMERA_STATE.fov);
  assert.equal(adapter.cameraTransition, null);
});

test("newer camera transitions replace older work and settle back to idle", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  harness.environment.runNextFrame();

  adapter.transitionCamera({ position: [0, 32, 42], duration: 400 });
  const first = adapter.cameraTransition;
  adapter.transitionCamera({ position: [-42, 32, 0], duration: 400 });
  assert.notEqual(adapter.cameraTransition, first);
  harness.environment.runNextFrame(100);
  harness.environment.runNextFrame(500);
  assert.deepEqual(adapter.camera.position.toArray(), [-42, 32, 0]);
  assert.equal(adapter.cameraTransition, null);
  assert.equal(harness.environment.pendingFrames.size, 0, "camera animation must return to idle invalidation");
});

test("manual input cancels reset motion and disposal cancels pending camera RAF safely", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  harness.environment.runNextFrame();
  adapter.camera.position.set(0, 32, 42);
  adapter.resetCamera();
  const canvas = harness.renderers[0].domElement;
  canvas.emit("pointerdown", { button: 0, pointerId: 4, clientX: 20 });
  assert.equal(adapter.cameraTransition, null);
  const pending = adapter.rafId;

  adapter.dispose();
  assert.ok(harness.environment.cancelledFrames.includes(pending));
  assert.equal(harness.environment.pendingFrames.size, 0);
  assertCanvasListeners(canvas, 0);
});

test("dispose cancels RAF, removes listeners, canvas and all retained resources", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  const geometryDispose = spyDispose(adapter.pawns[0].userData.primitiveFallback.geometry);
  const materialDispose = spyDispose(adapter.pawns[0].userData.primitiveFallback.material);
  const renderer = harness.renderers[0];
  const pendingFrame = adapter.rafId;

  adapter.dispose();

  assert.deepEqual(harness.environment.cancelledFrames, [pendingFrame]);
  assert.equal(harness.environment.listenerCount("resize"), 0);
  assertCanvasListeners(renderer.domElement, 0);
  assert.equal(geometryDispose.count, 1);
  assert.equal(materialDispose.count, 1);
  assert.equal(renderer.disposeCalls, 1);
  assert.equal(renderer.renderListDisposeCalls, 1);
  assert.equal(harness.container.children.length, 0);
  assert.equal(adapter.container, null);
  assert.equal(adapter.scene, null);
  assert.equal(adapter.camera, null);
  assert.equal(adapter.renderer, null);
  assert.equal(adapter.boardModel, null);
  assert.deepEqual(adapter.diceModels, []);
  assert.deepEqual(adapter.pawns, []);
  assert.equal(adapter.pawnsByPlayerId.size, 0);

  assert.doesNotThrow(() => adapter.dispose());
  assert.equal(renderer.disposeCalls, 1);
});

test("scene disposal handles nested graphs, material arrays, textures and shared resources once", () => {
  const root = new THREE.Group();
  const nested = new THREE.Group();
  const sharedGeometry = new THREE.BoxGeometry();
  const sharedTexture = new THREE.Texture();
  const sharedMaterial = new THREE.MeshBasicMaterial({ map: sharedTexture });
  const secondMaterial = new THREE.MeshPhongMaterial();
  const geometryDispose = spyDispose(sharedGeometry);
  const textureDispose = spyDispose(sharedTexture);
  const materialDispose = spyDispose(sharedMaterial);
  const secondMaterialDispose = spyDispose(secondMaterial);
  root.add(new THREE.Mesh(sharedGeometry, [sharedMaterial, secondMaterial]));
  nested.add(new THREE.Mesh(sharedGeometry, sharedMaterial));
  root.add(nested);

  const disposed = disposeObjectGraph(root);

  assert.equal(geometryDispose.count, 1);
  assert.equal(textureDispose.count, 1);
  assert.equal(materialDispose.count, 1);
  assert.equal(secondMaterialDispose.count, 1);
  assert.equal(disposed.geometries.size, 1);
  assert.equal(disposed.materials.size, 2);
  assert.equal(disposed.textures.size, 1);
});

test("loaded board-like and Dice-like graphs are disposed with the adapter", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  const board = trackedModel();
  const dice = trackedModel();
  harness.completeLoad("board.glb", board.root);
  harness.completeLoad("Dice.glb", dice.root);

  assert.equal(adapter.boardModel.parent, adapter.scene);
  assert.equal(adapter.diceModels.length, 2);
  assert.ok(adapter.diceModels.every(model => model.visible === false));
  assert.ok(adapter.boardModel.children[0].receiveShadow);
  assert.equal(adapter.boardModel.children[0].castShadow, false);
  assert.ok(adapter.diceModels.every(model => model.children[0].castShadow && model.children[0].receiveShadow));
  adapter.dispose();

  assert.equal(board.geometryDispose.count, 1);
  assert.equal(board.materialDispose.count, 1);
  assert.equal(dice.geometryDispose.count, 1, "two Dice clones share one geometry");
  assert.equal(dice.materialDispose.count, 1, "two Dice clones share one material");
});

test("Dice GLB is loaded once and its existing clone pair is reused for presentations", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  harness.environment.runNextFrame();
  harness.completeLoad("Dice.glb", trackedModel().root);
  const pair = [...adapter.diceModels];

  assert.equal(harness.loads.filter(load => load.url === "Dice.glb").length, 1);
  assert.equal(adapter.presentDiceRoll({
    die1: 2, die2: 5, total: 7, presentationId: 1, reducedMotion: true,
  }), true);
  assert.deepEqual(adapter.diceModels, pair);
  assert.ok(pair.every(die => die.visible));
  assert.ok(pair.every(die => die.scale.equals(new THREE.Vector3(11.5, 11.5, 11.5))));
  assert.equal(harness.loads.filter(load => load.url === "Dice.glb").length, 1);
});

test("all six calibrated Dice.glb face rotations settle both dice deterministically", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  harness.environment.runNextFrame();
  harness.completeLoad("Dice.glb", trackedModel().root);

  assert.deepEqual(Object.keys(DICE_FACE_ORIENTATIONS), ["1", "2", "3", "4", "5", "6"]);
  for (let value = 1; value <= 6; value += 1) {
    assert.equal(adapter.presentDiceRoll({
      die1: value,
      die2: value,
      total: value * 2,
      presentationId: value,
      reducedMotion: true,
    }), true);
    for (const die of adapter.diceModels) {
      assert.deepEqual([die.rotation.x, die.rotation.y, die.rotation.z], DICE_FACE_ORIENTATIONS[value]);
      assertDiceAboveBoard(die);
    }
  }
});

test("board artwork corrects the GLB metallic default without changing color space or shadows", () => {
  const root = new THREE.Group();
  const sharedArtwork = new THREE.MeshStandardMaterial({
    name: "01_-_Default",
    color: 0xffffff,
    map: new THREE.Texture(),
    normalMap: new THREE.Texture(),
    roughness: 0.8929713368415833,
    metalness: 1,
  });
  sharedArtwork.map.colorSpace = THREE.SRGBColorSpace;
  const border = new THREE.MeshStandardMaterial({ name: "02_-_Default", color: 0x000000 });
  const first = new THREE.Mesh(new THREE.PlaneGeometry(), sharedArtwork);
  const second = new THREE.Mesh(new THREE.PlaneGeometry(), sharedArtwork);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(), border);
  root.add(first, second, edge);

  const calibrated = calibrateBoardArtworkMaterials(root);
  const artwork = first.material;

  assert.equal(BOARD_ARTWORK_COLOR_MULTIPLIER, 0.90, "the board brightness calibration stays a restrained lift");
  assert.equal(calibrated.size, 1);
  assert.ok(artwork.isMeshStandardMaterial);
  assert.notEqual(artwork, sharedArtwork, "runtime calibration cannot mutate a shared source material");
  assert.equal(second.material, artwork, "multiple artwork meshes share one owned calibrated clone");
  assert.equal(edge.material, border, "untextured board trim remains physically lit only");
  assert.equal(artwork.map, sharedArtwork.map, "no duplicate texture is allocated");
  assert.equal(artwork.map.colorSpace, THREE.SRGBColorSpace);
  assert.equal(artwork.normalMap, sharedArtwork.normalMap);
  assert.equal(artwork.roughness, sharedArtwork.roughness);
  assert.equal(artwork.metalness, 0, "printed board artwork must retain a diffuse PBR response");
  assert.equal(sharedArtwork.metalness, 1, "source material remains untouched");
  assert.equal(artwork.color.r, BOARD_ARTWORK_COLOR_MULTIPLIER);
  assert.equal(artwork.color.g, BOARD_ARTWORK_COLOR_MULTIPLIER);
  assert.equal(artwork.color.b, BOARD_ARTWORK_COLOR_MULTIPLIER);
  assert.equal(artwork.emissive.getHexString(), "000000");
  assert.equal(artwork.emissiveMap, null);
  assert.equal(first.castShadow, false);
  first.receiveShadow = true;
  assert.equal(first.receiveShadow, true, "material lift does not alter board shadow reception");

  const artworkDispose = spyDispose(artwork);
  const artworkMapDispose = spyDispose(artwork.map);
  disposeObjectGraph(root);
  assert.equal(artworkDispose.count, 1, "the isolated material is released with its board graph");
  assert.equal(artworkMapDispose.count, 1, "the reused artwork texture is released once");
});

test("dice geometry stays above the board through anticipation, roll, both impacts and rest", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  harness.completeLoad("Dice.glb", trackedModel().root);
  const anticipationEnd = DICE_PRESENTATION_TIMING.anticipationMs;
  const rollEnd = anticipationEnd + DICE_PRESENTATION_TIMING.rollMs;
  const settleEnd = rollEnd + DICE_PRESENTATION_TIMING.settleMs;
  const sampleTimes = [
    0,
    anticipationEnd * 0.5,
    anticipationEnd,
    ...Array.from({ length: 25 }, (_, index) => anticipationEnd
      + (DICE_PRESENTATION_TIMING.rollMs * index / 24)),
    rollEnd + (DICE_PRESENTATION_TIMING.settleMs * 0.25),
    rollEnd + (DICE_PRESENTATION_TIMING.settleMs * 0.5),
    rollEnd + (DICE_PRESENTATION_TIMING.settleMs * 0.75),
    settleEnd,
    DICE_PRESENTATION_DURATION_MS,
  ];
  const presentations = [
    { die1: 1, die2: 2, total: 3, presentationId: 31, reducedMotion: false },
    { die1: 3, die2: 5, total: 8, presentationId: 32, reducedMotion: false },
    { die1: 6, die2: 6, total: 12, presentationId: 33, reducedMotion: false },
  ];

  for (const presentation of presentations) {
    for (const elapsed of sampleTimes) {
      adapter.applyDiceAnimationFrame(presentation, elapsed);
      for (const die of adapter.diceModels) assertDiceAboveBoard(die);
    }
  }
});

test("both authored settle impacts rebound without sacrificing floor clearance", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  harness.completeLoad("Dice.glb", trackedModel().root);
  const presentation = {
    die1: 2, die2: 5, total: 7, presentationId: 34, reducedMotion: false,
  };
  const settleStart = DICE_PRESENTATION_TIMING.anticipationMs + DICE_PRESENTATION_TIMING.rollMs;
  const minimumY = elapsed => {
    adapter.applyDiceAnimationFrame(presentation, elapsed);
    return diceWorldMinimumY(adapter.diceModels[0]);
  };
  const floorY = minimumY(settleStart);
  const firstImpactReboundY = minimumY(settleStart + DICE_PRESENTATION_TIMING.settleMs * 0.25);
  const betweenImpactsY = minimumY(settleStart + DICE_PRESENTATION_TIMING.settleMs * 0.5);
  const secondImpactReboundY = minimumY(settleStart + DICE_PRESENTATION_TIMING.settleMs * 0.75);

  assert.ok(firstImpactReboundY > floorY);
  assert.ok(secondImpactReboundY > betweenImpactsY);
  assertDiceAboveBoard(adapter.diceModels[0]);
});

test("authored dice paths vary decoratively without changing the authoritative result", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  harness.environment.runNextFrame();
  harness.completeLoad("Dice.glb", trackedModel().root);
  const first = Object.freeze({
    die1: 2, die2: 5, total: 7, presentationId: 21, reducedMotion: false,
  });
  const second = Object.freeze({ ...first, presentationId: 22 });
  const midRoll = DICE_PRESENTATION_TIMING.anticipationMs
    + (DICE_PRESENTATION_TIMING.rollMs * 0.5);

  adapter.applyDiceAnimationFrame(first, midRoll);
  const firstPath = adapter.diceModels.map(die => ({
    position: die.position.toArray(),
    quaternion: die.quaternion.toArray(),
  }));
  adapter.applyDiceAnimationFrame(second, midRoll);
  const secondPath = adapter.diceModels.map(die => ({
    position: die.position.toArray(),
    quaternion: die.quaternion.toArray(),
  }));

  assert.notDeepEqual(firstPath, secondPath);
  adapter.applyDiceAnimationFrame(second, Number.POSITIVE_INFINITY);
  assert.deepEqual(diceRotations(adapter), [
    DICE_FACE_ORIENTATIONS[2], DICE_FACE_ORIENTATIONS[5],
  ]);
  assert.deepEqual(adapter.diceModels.map(die => [die.position.x, die.position.z]), [
    [-2.65, 0.85], [2.35, -0.65],
  ]);
  for (const die of adapter.diceModels) assertDiceAboveBoard(die);
});

test("dice camera emphasis restores the exact pre-roll view before presentation completion", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  harness.environment.runNextFrame();
  harness.completeLoad("Dice.glb", trackedModel().root);
  harness.environment.runNextFrame();
  adapter.camera.position.set(-30, 35, 20);
  adapter.cameraTarget.set(1, 0, 2);
  adapter.camera.fov = 58;
  const original = {
    position: adapter.camera.position.toArray(),
    target: adapter.cameraTarget.toArray(),
    fov: adapter.camera.fov,
  };

  adapter.presentDiceRoll({ die1: 6, die2: 1, total: 7, presentationId: 23 });
  assert.equal(adapter.cameraTransition.owner, "dice-emphasis");
  harness.environment.runNextFrame(0);
  harness.environment.runNextFrame(DICE_PRESENTATION_TIMING.cameraEmphasisMs);
  assert.ok(adapter.camera.position.distanceTo(adapter.cameraTarget)
    < new THREE.Vector3(...original.position).distanceTo(new THREE.Vector3(...original.target)));
  harness.environment.runNextFrame(DICE_CAMERA_RESTORE_AT_MS);
  assert.equal(adapter.cameraTransition.owner, "dice-restore");
  harness.environment.runNextFrame(DICE_CAMERA_RESTORE_AT_MS + 1);
  harness.environment.runNextFrame(DICE_CAMERA_RESTORE_AT_MS
    + DICE_PRESENTATION_TIMING.cameraRestoreMs + 1);

  assert.deepEqual(adapter.camera.position.toArray(), original.position);
  assert.deepEqual(adapter.cameraTarget.toArray(), original.target);
  assert.equal(adapter.camera.fov, original.fov);
  assert.ok(adapter.diceAnimation, "camera choreography must not gate the result hold");
  harness.environment.runNextFrame(DICE_PRESENTATION_DURATION_MS);
  assert.equal(adapter.diceAnimation, null);
  assert.equal(harness.environment.pendingFrames.size, 0);
});

test("manual board input cancels only dice camera choreography", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  harness.environment.runNextFrame();
  harness.completeLoad("Dice.glb", trackedModel().root);
  harness.environment.runNextFrame();
  adapter.presentDiceRoll({ die1: 4, die2: 6, total: 10, presentationId: 24 });
  const canvas = harness.renderers[0].domElement;

  canvas.emit("pointerdown", { button: 0, pointerId: 24, clientX: 20, preventDefault: () => {} });
  canvas.emit("pointerup", { pointerId: 24 });
  assert.equal(adapter.cameraTransition, null);
  assert.equal(adapter.diceCameraPresentation, null);
  assert.ok(adapter.diceAnimation);

  adapter.presentDiceRoll({ die1: 2, die2: 5, total: 7, presentationId: 25 });
  canvas.emit("wheel", { deltaY: -20, preventDefault: () => {} });
  assert.equal(adapter.cameraTransition.owner, null, "the user's zoom replaces dice-owned camera work");
  assert.equal(adapter.diceCameraPresentation, null);
  assert.equal(adapter.diceAnimation.presentation.presentationId, 25);

  adapter.presentDiceRoll({ die1: 4, die2: 6, total: 10, presentationId: 26 });
  adapter.resetCamera({ reducedMotion: true });
  assert.equal(adapter.cameraTransition, null);
  assert.equal(adapter.diceCameraPresentation, null);
  assert.equal(adapter.diceAnimation.presentation.presentationId, 26);
  harness.environment.runNextFrame(0);
  harness.environment.runNextFrame(DICE_PRESENTATION_DURATION_MS);

  assert.equal(adapter.diceAnimation, null);
  assert.deepEqual(diceRotations(adapter), [
    DICE_FACE_ORIENTATIONS[4], DICE_FACE_ORIENTATIONS[6],
  ]);
  assert.equal(harness.environment.pendingFrames.size, 0);
});

test("dice animation uses bounded RAF and drains back to zero after settling", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  harness.environment.runNextFrame();
  harness.completeLoad("Dice.glb", trackedModel().root);
  harness.environment.runNextFrame();

  assert.equal(adapter.presentDiceRoll({
    die1: 1, die2: 6, total: 7, presentationId: 4,
  }), true);
  assert.equal(harness.environment.pendingFrames.size, 1);
  harness.environment.runNextFrame(100);
  assert.equal(harness.environment.pendingFrames.size, 1);
  harness.environment.runNextFrame(100 + DICE_PRESENTATION_DURATION_MS);

  assert.equal(adapter.diceAnimation, null);
  assert.equal(harness.environment.pendingFrames.size, 1, "camera restoration may outlive the dice hold");
  harness.environment.runNextFrame(101 + DICE_PRESENTATION_DURATION_MS);
  harness.environment.runNextFrame(101 + DICE_PRESENTATION_DURATION_MS
    + DICE_PRESENTATION_TIMING.cameraRestoreMs);
  assert.equal(harness.environment.pendingFrames.size, 0);
  assert.deepEqual(diceRotations(adapter), [
    DICE_FACE_ORIENTATIONS[1], DICE_FACE_ORIENTATIONS[6],
  ]);
});

test("reduced motion snaps faces, holds the result briefly and skips camera choreography", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  harness.environment.runNextFrame();
  harness.completeLoad("Dice.glb", trackedModel().root);
  harness.environment.runNextFrame();

  assert.equal(adapter.presentDiceRoll({
    die1: 3, die2: 4, total: 7, presentationId: 5, reducedMotion: true,
  }), true);
  assert.ok(adapter.diceAnimation);
  assert.equal(adapter.cameraTransition, null);
  assert.deepEqual(diceRotations(adapter), [
    DICE_FACE_ORIENTATIONS[3], DICE_FACE_ORIENTATIONS[4],
  ]);
  assert.equal(harness.environment.pendingFrames.size, 1);
  harness.environment.runNextFrame(0);
  harness.environment.runNextFrame(DICE_PRESENTATION_TIMING.resultHoldMs - 1);
  assert.ok(adapter.diceAnimation);
  harness.environment.runNextFrame(DICE_PRESENTATION_TIMING.resultHoldMs);
  assert.equal(adapter.diceAnimation, null);
  assert.equal(harness.environment.pendingFrames.size, 0);
});

test("completion-aware dice resolves only after the accepted visual settles", async () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  harness.environment.runNextFrame();
  harness.completeLoad("Dice.glb", trackedModel().root);
  harness.environment.runNextFrame();
  let settled = false;

  const completion = adapter.presentDiceRollAndWait({
    die1: 2, die2: 4, total: 6, presentationId: 6,
  }).then(value => { settled = true; return value; });
  await Promise.resolve();
  assert.equal(settled, false);
  harness.environment.runNextFrame(100);
  await Promise.resolve();
  assert.equal(settled, false);
  harness.environment.runNextFrame(99 + DICE_PRESENTATION_DURATION_MS);
  await Promise.resolve();
  assert.equal(settled, false, "the authoritative result remains readable for the full hold");
  harness.environment.runNextFrame(100 + DICE_PRESENTATION_DURATION_MS);

  assert.equal(await completion, true);
  harness.environment.runNextFrame(101 + DICE_PRESENTATION_DURATION_MS);
  harness.environment.runNextFrame(101 + DICE_PRESENTATION_DURATION_MS
    + DICE_PRESENTATION_TIMING.cameraRestoreMs);
  assert.equal(harness.environment.pendingFrames.size, 0);
});

test("completion-aware reduced motion resolves after its bounded result hold", async () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  harness.environment.runNextFrame();
  harness.completeLoad("Dice.glb", trackedModel().root);
  harness.environment.runNextFrame();

  let settled = false;
  const completion = adapter.presentDiceRollAndWait({
    die1: 3, die2: 3, total: 6, presentationId: 7, reducedMotion: true,
  }).then(value => { settled = true; return value; });
  harness.environment.runNextFrame(0);
  harness.environment.runNextFrame(DICE_PRESENTATION_TIMING.resultHoldMs - 1);
  await Promise.resolve();
  assert.equal(settled, false);
  harness.environment.runNextFrame(DICE_PRESENTATION_TIMING.resultHoldMs);
  assert.equal(await completion, true);
  assert.equal(adapter.diceAnimation, null);
  assert.equal(harness.environment.pendingFrames.size, 0);
});

test("newer dice and explicit cancellation settle old completion handles safely", async () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  harness.environment.runNextFrame();
  harness.completeLoad("Dice.glb", trackedModel().root);
  harness.environment.runNextFrame();

  const superseded = adapter.presentDiceRollAndWait({
    die1: 1, die2: 2, total: 3, presentationId: 8,
  });
  const current = adapter.presentDiceRollAndWait({
    die1: 5, die2: 6, total: 11, presentationId: 9, reducedMotion: true,
  });
  assert.equal(await superseded, false);
  harness.environment.runNextFrame(0);
  harness.environment.runNextFrame(DICE_PRESENTATION_TIMING.resultHoldMs);
  assert.equal(await current, true);

  const canceled = adapter.presentDiceRollAndWait({
    die1: 4, die2: 4, total: 8, presentationId: 10,
  });
  assert.equal(adapter.cancelDicePresentation(10), true);
  assert.equal(await canceled, false);
  harness.environment.runNextFrame(1000);
  harness.environment.runNextFrame(1000 + DICE_PRESENTATION_TIMING.cameraRestoreMs);
  assert.equal(adapter.diceAnimation, null);
  assert.equal(harness.environment.pendingFrames.size, 0);
});

test("dispose and Dice load failure cannot leave completion handles unresolved", async () => {
  const disposeHarness = createHarness();
  const disposable = disposeHarness.createAdapter();
  disposable.mount(disposeHarness.container);
  const disposedCompletion = disposable.presentDiceRollAndWait({
    die1: 1, die2: 6, total: 7, presentationId: 11,
  });
  disposable.dispose();
  assert.equal(await disposedCompletion, false);

  const failureHarness = createHarness();
  const failing = failureHarness.createAdapter();
  failing.mount(failureHarness.container);
  const failedCompletion = failing.presentDiceRollAndWait({
    die1: 2, die2: 5, total: 7, presentationId: 12,
  });
  const originalConsoleError = console.error;
  try {
    console.error = () => {};
    failureHarness.failLoad("Dice.glb", new Error("load failed"));
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(await failedCompletion, false);
});

test("newer dice presentation supersedes animation and stale IDs are ignored", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  harness.environment.runNextFrame();
  harness.completeLoad("Dice.glb", trackedModel().root);
  harness.environment.runNextFrame();

  adapter.presentDiceRoll({ die1: 1, die2: 1, total: 2, presentationId: 8 });
  harness.environment.runNextFrame(10);
  assert.equal(adapter.presentDiceRoll({
    die1: 6, die2: 6, total: 12, presentationId: 9, reducedMotion: true,
  }), true);
  assert.equal(adapter.presentDiceRoll({
    die1: 2, die2: 3, total: 5, presentationId: 8, reducedMotion: true,
  }), false);
  harness.environment.runNextFrame(20);
  harness.environment.runNextFrame(520);

  assert.equal(adapter.diceAnimation, null);
  assert.equal(harness.environment.pendingFrames.size, 0);
  assert.deepEqual(diceRotations(adapter), [
    DICE_FACE_ORIENTATIONS[6], DICE_FACE_ORIENTATIONS[6],
  ]);
});

test("dispose during a dice roll cancels the sole RAF and prevents late settle", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  harness.environment.runNextFrame();
  harness.completeLoad("Dice.glb", trackedModel().root);
  harness.environment.runNextFrame();
  adapter.presentDiceRoll({ die1: 2, die2: 5, total: 7, presentationId: 10 });
  const pendingFrame = adapter.rafId;

  adapter.dispose();

  assert.ok(harness.environment.cancelledFrames.includes(pendingFrame));
  assert.equal(harness.environment.pendingFrames.size, 0);
  assert.equal(adapter.diceAnimation, null);
  assert.equal(harness.environment.runNextFrame(1000), false);
});

test("late board and Dice callbacks dispose their resources and cannot attach or restart RAF", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  adapter.dispose();
  const requestedBeforeCallbacks = harness.environment.requestCount;
  const board = trackedModel();
  const dice = trackedModel();

  harness.completeLoad("board.glb", board.root);
  harness.completeLoad("Dice.glb", dice.root);

  assert.equal(adapter.scene, null);
  assert.equal(board.geometryDispose.count, 1);
  assert.equal(board.materialDispose.count, 1);
  assert.equal(dice.geometryDispose.count, 1);
  assert.equal(dice.materialDispose.count, 1);
  assert.equal(harness.environment.requestCount, requestedBeforeCallbacks);
  assert.equal(harness.environment.pendingFrames.size, 0);
});

test("visual methods fail safely before mount and after disposal", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();

  assert.equal(adapter.resize(), false);
  assert.equal(adapter.orientCameraForPosition(5), false);
  assert.equal(adapter.setPawnPositions([]), false);
  assert.equal(adapter.setPawnPosition(1, 5), false);
  adapter.mount(harness.container);
  adapter.dispose();
  assert.equal(adapter.resize(), false);
  assert.equal(adapter.orientCameraForPosition(5), false);
  assert.equal(adapter.setPawnPositions([]), false);
  assert.equal(adapter.setPawnPosition(1, 5), false);
  assert.equal(adapter.mount(harness.container), false);
});

test("duplicate mount cannot create a second live renderer or listener set", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();

  assert.equal(adapter.mount(harness.container), true);
  assert.equal(adapter.mount(harness.container), false);
  assert.equal(harness.renderers.length, 1);
  assert.equal(harness.container.children.length, 1);
  assert.equal(harness.environment.pendingFrames.size, 1);
  assert.equal(harness.environment.listenerCount("resize"), 1);
  assertCanvasListeners(harness.renderers[0].domElement, 1);
});

test("dispose before mount permanently closes that adapter without allocating", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();

  adapter.dispose();

  assert.equal(adapter.mount(harness.container), false);
  assert.equal(harness.renderers.length, 0);
  assert.equal(harness.container.children.length, 0);
  assert.equal(harness.environment.pendingFrames.size, 0);
});

test("StrictMode-style mount, dispose and fresh remount remains bounded", () => {
  const harness = createHarness();
  const first = harness.createAdapter();
  first.mount(harness.container);
  first.dispose();

  const second = harness.createAdapter();
  second.mount(harness.container);

  assert.equal(harness.renderers.length, 2);
  assert.equal(harness.renderers[0].disposeCalls, 1);
  assert.equal(harness.container.children.length, 1);
  assert.equal(harness.environment.pendingFrames.size, 1);
  assert.equal(harness.environment.listenerCount("resize"), 1);
  assertCanvasListeners(harness.renderers[1].domElement, 1);
  second.dispose();
  assert.equal(harness.container.children.length, 0);
  assert.equal(harness.environment.pendingFrames.size, 0);
});

test("pawn updates preserve stable visual slots on canonical anchors", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  harness.environment.runNextFrame();

  assert.equal(adapter.setPawnPositions([
    { playerId: 2, position: 5 },
    { playerId: 1, position: 3 },
  ]), true);
  const playerOnePawn = adapter.pawnsByPlayerId.get("1");
  const playerTwoPawn = adapter.pawnsByPlayerId.get("2");
  assert.equal(playerOnePawn, adapter.pawns[0]);
  assert.equal(playerTwoPawn, adapter.pawns[1]);
  assert.equal(playerOnePawn.userData.stepCounter, 3);
  assert.equal(playerTwoPawn.userData.stepCounter, 5);
  assert.deepEqual(playerOnePawn.position.toArray(), [23.15, 0.5, -8.309161]);
  assert.deepEqual(playerTwoPawn.position.toArray(), [23.15, 0.5, 1.090839]);

  adapter.setPawnPositions([
    { playerId: 1, position: 4 },
    { playerId: 2, position: 6 },
  ]);
  assert.equal(adapter.pawnsByPlayerId.get("1"), playerOnePawn);
  assert.equal(adapter.pawnsByPlayerId.get("2"), playerTwoPawn);
  assert.equal(playerOnePawn.userData.stepCounter, 4);
  assert.equal(playerTwoPawn.userData.stepCounter, 6);
});

test("DIRECT movement remains an immediate safe calibrated placement", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  harness.environment.runNextFrame();
  adapter.setPawnPositions([{ playerId: 1, position: 3 }]);

  assert.equal(adapter.presentPawnMovement({
    mode: "DIRECT", playerId: 1, from: 3, to: 30, slot: 0, route: null, presentationId: "direct-1",
  }), true);
  assert.equal(adapter.pawnsByPlayerId.get("1").userData.stepCounter, 30);
  assert.equal(adapter.pawnAnimation, null);
  assert.equal(adapter.cameraTransition, null, "pawn placement must not move the camera");
  assert.deepEqual(adapter.pawnsByPlayerId.get("1").position.toArray(), [
    getPawnAnchor(30, 0).x, getPawnAnchor(30, 0).y, getPawnAnchor(30, 0).z,
  ]);

  assert.equal(adapter.presentPawnMovement({
    mode: "FORWARD", playerId: 1, from: 30, to: 2, slot: 0,
    route: [31, 32, 33, 34, 35, 36, 37, 38, 39, 0, 2], presentationId: "bad-route",
  }), false);
});

test("pawn registry keeps the approved stable models and semantic accent palette", () => {
  assert.deepEqual(PAWN_SLOT_ASSETS.map(asset => asset.id), [
    "backpack", "frappeCup", "graduationCap", "laptop",
  ]);
  assert.deepEqual(PAWN_SLOT_ASSETS.map(asset => asset.accentColor), [
    "#00796B", "#B23A48", "#3F60B5", "#8B5A00",
  ]);
});

test("pawn templates replace only their matching fallback and isolate accent materials", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  const template = pawnTemplate();

  harness.completeLoad("Backpack.glb", template.root);
  const first = adapter.pawns[0];
  assert.equal(first.userData.primitiveFallback.visible, false);
  assert.equal(first.children.length, 2);
  const visual = first.userData.glbVisual;
  const visualAccent = visual.getObjectByName("accent").material;
  const templateAccent = template.accent;
  assert.notEqual(visualAccent, templateAccent);
  assert.equal(visualAccent.color.getHexString(), "00796b");
  assert.equal(templateAccent.color.getHexString(), "ffffff");
  assert.equal(visual.getObjectByName("body").material, template.body);
  assert.ok(visual.getObjectByName("accent").castShadow);
  assert.ok(visual.getObjectByName("accent").receiveShadow);
  assert.equal(adapter.pawns[1].userData.primitiveFallback.visible, true);
});

test("separate slots keep their own semantic accent materials after parallel loads", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  const backpack = pawnTemplate();
  const cup = pawnTemplate();
  harness.completeLoad("Backpack.glb", backpack.root);
  harness.completeLoad("FrappeCup.glb", cup.root);

  const backpackAccent = adapter.pawns[0].userData.glbVisual.getObjectByName("accent").material;
  const cupAccent = adapter.pawns[1].userData.glbVisual.getObjectByName("accent").material;
  assert.notEqual(backpackAccent, cupAccent);
  assert.equal(backpackAccent.color.getHexString(), "00796b");
  assert.equal(cupAccent.color.getHexString(), "b23a48");
  assert.equal(backpack.accent.color.getHexString(), "ffffff");
  assert.equal(cup.accent.color.getHexString(), "ffffff");
});

test("failed pawn loads preserve fallbacks while other pawn templates still attach", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  const originalConsoleError = console.error;
  try {
    console.error = () => {};
    harness.failLoad("FrappeCup.glb", new Error("unavailable"));
  } finally {
    console.error = originalConsoleError;
  }
  harness.completeLoad("Laptop.glb", pawnTemplate().root);
  assert.equal(adapter.pawns[1].userData.primitiveFallback.visible, true);
  assert.equal(adapter.pawns[1].userData.glbVisual, undefined);
  assert.equal(adapter.pawns[3].userData.primitiveFallback.visible, false);
});

test("pawn template disposal releases shared resources once and owned accents once", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  const template = pawnTemplate();
  const geometryDispose = spyDispose(template.geometry);
  const bodyDispose = spyDispose(template.body);
  const accentDispose = spyDispose(adapter.pawns[0].userData.primitiveFallback.material);
  harness.completeLoad("Backpack.glb", template.root);
  const visualAccentDispose = spyDispose(adapter.pawns[0].userData.glbVisual.getObjectByName("accent").material);
  adapter.dispose();
  assert.equal(geometryDispose.count, 1);
  assert.equal(bodyDispose.count, 1);
  assert.equal(visualAccentDispose.count, 1);
  assert.equal(accentDispose.count, 1);
});

test("late pawn loads are released without resurrecting disposed wrappers", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  adapter.dispose();
  const template = pawnTemplate();
  const geometryDispose = spyDispose(template.geometry);
  const materialDispose = spyDispose(template.body);
  harness.completeLoad("GraduationCap.glb", template.root);
  assert.equal(adapter.scene, null);
  assert.equal(geometryDispose.count, 1);
  assert.equal(materialDispose.count, 1);
});

test("aggregate disposal does not double-dispose shared clone resources", () => {
  const template = pawnTemplate();
  const clone = template.root.clone(true);
  const geometryDispose = spyDispose(template.geometry);
  const bodyDispose = spyDispose(template.body);
  disposeObjectGraphs([template.root, clone]);
  assert.equal(geometryDispose.count, 1);
  assert.equal(bodyDispose.count, 1);
});

test("forward pawn animation follows every calibrated tile, wraps START and settles exactly", async () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  harness.environment.runNextFrame();
  adapter.setPawnPositions([{ playerId: 1, position: 38 }]);
  harness.environment.runNextFrame();

  const completion = adapter.presentPawnMovement({
    mode: "FORWARD", playerId: 1, from: 38, to: 2, slot: 0,
    route: [39, 0, 1, 2], presentationId: "wrap-1",
  });
  assert.ok(completion instanceof Promise);
  assert.deepEqual(adapter.pawnAnimation.segments.map(segment => segment.end.position), [39, 0, 1, 2]);
  assert.equal(adapter.pawnAnimation.stepDuration, PAWN_MOVEMENT_TIMING.tileDurationMs);

  harness.environment.runNextFrame(100);
  harness.environment.runNextFrame(172.5);
  const pawn = adapter.pawnsByPlayerId.get("1");
  assert.ok(pawn.position.y > getPawnAnchor(39, 0).y, "each tile receives one restrained hop");
  assert.ok(Number.isFinite(pawn.rotation.y), "route direction provides reusable pawn orientation");

  const completedAt = 100
    + (4 * PAWN_MOVEMENT_TIMING.tileDurationMs)
    + PAWN_MOVEMENT_TIMING.arrivalDurationMs;
  harness.environment.runNextFrame(completedAt);
  assert.equal(await completion, true);
  const destination = getPawnAnchor(2, 0);
  assert.deepEqual(pawn.position.toArray(), [destination.x, destination.y, destination.z]);
  assert.equal(pawn.userData.stepCounter, 2);
  assert.equal(adapter.pawnAnimation, null);
  assert.equal(harness.environment.pendingFrames.size, 0, "pawn animation must return to idle rendering");
});

test("recovery cancellation settles the old promise and accepts the authoritative snap", async () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  harness.environment.runNextFrame();
  adapter.setPawnPositions([{ playerId: 1, position: 5 }]);
  harness.environment.runNextFrame();
  const completion = adapter.presentPawnMovement({
    mode: "FORWARD", playerId: 1, from: 5, to: 8, slot: 0,
    route: [6, 7, 8], presentationId: "move-5-8",
  });
  harness.environment.runNextFrame(100);
  harness.environment.runNextFrame(170);

  assert.equal(adapter.cancelPawnPresentation("move-5-8"), true);
  assert.equal(await completion, false);
  assert.equal(adapter.snapPawnPosition({ playerId: 1, position: 12, slot: 0 }), true);
  const authoritative = getPawnAnchor(12, 0);
  assert.deepEqual(adapter.pawnsByPlayerId.get("1").position.toArray(), [
    authoritative.x, authoritative.y, authoritative.z,
  ]);
  assert.equal(adapter.pawnAnimation, null);
});

test("moving pawns retain their player identity and logical slot offsets", async () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  harness.environment.runNextFrame();
  adapter.setPawnPositions([
    { playerId: 2, position: 8 },
    { playerId: 1, position: 8 },
  ]);
  harness.environment.runNextFrame();
  const playerTwoPawn = adapter.pawnsByPlayerId.get("2");
  const completion = adapter.presentPawnMovement({
    mode: "FORWARD", playerId: 2, from: 8, to: 11, slot: 1,
    route: [9, 10, 11], presentationId: "slot-one",
  });

  assert.equal(adapter.pawnAnimation.pawn, playerTwoPawn);
  assert.deepEqual(adapter.pawnAnimation.segments.map(segment => segment.end), [
    getPawnAnchor(9, 1), getPawnAnchor(10, 1), getPawnAnchor(11, 1),
  ]);
  assert.equal(adapter.cancelPawnPresentation("slot-one"), true);
  assert.equal(await completion, false);
  assert.equal(adapter.pawnsByPlayerId.get("2"), playerTwoPawn);
  const destination = getPawnAnchor(11, 1);
  assert.deepEqual(playerTwoPawn.position.toArray(), [destination.x, destination.y, destination.z]);
});

test("reduced motion snaps forward routes and disposal settles active pawn work", async () => {
  const reducedHarness = createHarness();
  const reduced = reducedHarness.createAdapter({ reducedMotion: true });
  reduced.mount(reducedHarness.container);
  reducedHarness.environment.runNextFrame();
  reduced.setPawnPositions([{ playerId: 1, position: 8 }]);
  assert.equal(reduced.presentPawnMovement({
    mode: "FORWARD", playerId: 1, from: 8, to: 10, slot: 0,
    route: [9, 10], presentationId: "reduced", reducedMotion: true,
  }), true);
  assert.equal(reduced.pawnAnimation, null);
  assert.equal(reduced.pawnsByPlayerId.get("1").userData.stepCounter, 10);

  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  harness.environment.runNextFrame();
  adapter.setPawnPositions([{ playerId: 1, position: 8 }]);
  harness.environment.runNextFrame();
  const completion = adapter.presentPawnMovement({
    mode: "FORWARD", playerId: 1, from: 8, to: 10, slot: 0,
    route: [9, 10], presentationId: "dispose-move",
  });
  const pending = adapter.rafId;
  adapter.dispose();
  assert.equal(await completion, false);
  assert.ok(harness.environment.cancelledFrames.includes(pending));
  assert.equal(harness.environment.pendingFrames.size, 0);
});

test("adapter source stays presentation-only and owns the Three lifecycle", async () => {
  const adapterSource = await readFile(new URL("../features/game/board/BoardSceneAdapter.js", import.meta.url), "utf8");

  assert.doesNotMatch(
    adapterSource,
    /apiClient|GameAPI|GamePlayAPI|TurnAPI|STOMP|sockjs|authoritative.*controller|greekContent|presentationModels|Redis|MariaDB|localStorage|sessionStorage/iu,
  );
  assert.doesNotMatch(adapterSource, /fetch\s*\(|axios|\brent\b|afford|winner|commandId|stateVersion/iu);
  assert.match(adapterSource, /from "\.\/boardCalibration\.js"/);
});

function createHarness() {
  const environment = createEnvironment();
  const renderers = [];
  const loads = [];
  const container = {
    clientWidth: 640,
    clientHeight: 480,
    children: [],
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
    },
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index >= 0) this.children.splice(index, 1);
      child.parentNode = null;
    },
  };

  return {
    environment,
    renderers,
    loads,
    container,
    createAdapter(options = {}) {
      return new BoardSceneAdapter({
        boardModelUrl: "board.glb",
        diceModelUrl: "Dice.glb",
        pawnModelUrls: {
          backpack: "Backpack.glb",
          frappeCup: "FrappeCup.glb",
          graduationCap: "GraduationCap.glb",
          laptop: "Laptop.glb",
        },
        ...options,
        dependencies: {
          environment,
          createRenderer: () => {
            const renderer = createRenderer();
            renderers.push(renderer);
            return renderer;
          },
          createLoader: () => ({
            load(url, onLoad, onProgress, onError) {
              loads.push({ url, onLoad, onProgress, onError });
            },
          }),
        },
      });
    },
    completeLoad(url, scene) {
      const load = loads.find(candidate => candidate.url === url);
      assert.ok(load, `missing loader request for ${url}`);
      load.onLoad({ scene });
    },
    failLoad(url, error) {
      const load = loads.find(candidate => candidate.url === url);
      assert.ok(load, `missing loader request for ${url}`);
      load.onError(error);
    },
  };
}

function createEnvironment() {
  const listeners = new Map();
  const resizeObservers = [];
  let nextFrameId = 1;
  const environment = {
    innerWidth: 1200,
    innerHeight: 800,
    devicePixelRatio: 2.5,
    resizeObservers,
    pendingFrames: new Map(),
    cancelledFrames: [],
    requestCount: 0,
    addEventListener(event, listener) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(listener);
    },
    removeEventListener(event, listener) {
      listeners.get(event)?.delete(listener);
    },
    listenerCount(event) {
      return listeners.get(event)?.size ?? 0;
    },
    emit(event, payload) {
      for (const listener of listeners.get(event) ?? []) listener(payload);
    },
    requestAnimationFrame(callback) {
      const id = nextFrameId;
      nextFrameId += 1;
      this.requestCount += 1;
      this.pendingFrames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) {
      this.cancelledFrames.push(id);
      this.pendingFrames.delete(id);
    },
    runNextFrame(timestamp = 0) {
      const [id, callback] = this.pendingFrames.entries().next().value ?? [];
      if (!callback) return false;
      this.pendingFrames.delete(id);
      callback(timestamp);
      return true;
    },
    emitContainerResize() {
      for (const observer of resizeObservers) {
        if (!observer.disconnected) observer.callback([]);
      }
    },
  };
  environment.ResizeObserver = class {
    constructor(callback) {
      this.callback = callback;
      this.targets = [];
      this.disconnected = false;
      resizeObservers.push(this);
    }

    observe(target) {
      this.targets.push(target);
    }

    disconnect() {
      this.disconnected = true;
      this.targets = [];
    }
  };
  return environment;
}

function diceRotations(adapter) {
  return adapter.diceModels.map(die => [die.rotation.x, die.rotation.y, die.rotation.z]);
}

function diceWorldMinimumY(die) {
  die.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(die).min.y;
}

function assertDiceAboveBoard(die) {
  const expectedMinimum = BOARD_SURFACE_Y + DICE_SURFACE_CLEARANCE;
  assert.ok(
    diceWorldMinimumY(die) >= expectedMinimum - 1e-9,
    `dice minimum Y must remain at or above ${expectedMinimum}`,
  );
}

function createRenderer() {
  const renderer = {
    domElement: createEventTarget(),
    sizes: [],
    pixelRatios: [],
    renderCalls: 0,
    disposeCalls: 0,
    renderListDisposeCalls: 0,
    outputColorSpace: null,
    shadowMap: { enabled: false, type: null },
    setClearColor() {},
    setSize(width, height) { this.sizes.push([width, height]); },
    setPixelRatio(ratio) { this.pixelRatios.push(ratio); },
    render() { this.renderCalls += 1; },
    dispose() { this.disposeCalls += 1; },
    renderLists: {
      dispose() { this.owner.renderListDisposeCalls += 1; },
      owner: null,
    },
  };
  renderer.renderLists.owner = renderer;
  return renderer;
}

function createEventTarget() {
  const listeners = new Map();
  return {
    parentNode: null,
    style: {},
    capturedPointers: [],
    releasedPointers: [],
    addEventListener(event, listener) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(listener);
    },
    removeEventListener(event, listener) {
      listeners.get(event)?.delete(listener);
    },
    listenerCount(event) {
      return listeners.get(event)?.size ?? 0;
    },
    emit(event, payload = {}) {
      for (const listener of listeners.get(event) ?? []) listener(payload);
    },
    setPointerCapture(pointerId) { this.capturedPointers.push(pointerId); },
    releasePointerCapture(pointerId) { this.releasedPointers.push(pointerId); },
  };
}

function assertCanvasListeners(canvas, expected) {
  for (const event of ["pointerdown", "pointermove", "pointerup", "pointercancel", "wheel"]) {
    assert.equal(canvas.listenerCount(event), expected, `${event} listener count`);
  }
}

function trackedModel() {
  const root = new THREE.Group();
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshBasicMaterial();
  const geometryDispose = spyDispose(geometry);
  const materialDispose = spyDispose(material);
  root.add(new THREE.Mesh(geometry, material));
  return { root, geometryDispose, materialDispose };
}

function pawnTemplate() {
  const root = new THREE.Group();
  const geometry = new THREE.BoxGeometry();
  const accent = new THREE.MeshStandardMaterial({ color: 0xffffff, name: "M_Accent" });
  const body = new THREE.MeshStandardMaterial({ color: 0x333333, name: "M_Body" });
  const accentMesh = new THREE.Mesh(geometry, accent);
  accentMesh.name = "accent";
  const bodyMesh = new THREE.Mesh(geometry, body);
  bodyMesh.name = "body";
  root.add(accentMesh, bodyMesh);
  return { root, geometry, accent, body };
}

function spyDispose(resource) {
  const state = { count: 0 };
  resource.dispose = () => { state.count += 1; };
  return state;
}
