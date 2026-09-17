import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import {
  BoardSceneAdapter,
  DICE_FACE_ORIENTATIONS,
  disposeObjectGraph,
} from "../features/game/board/BoardSceneAdapter.js";

test("mount creates one scene, renderer, canvas, frame and listener set", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();

  assert.equal(adapter.mount(harness.container), true);
  assert.ok(adapter.scene instanceof THREE.Scene);
  assert.equal(harness.renderers.length, 1);
  assert.equal(harness.container.children.length, 1);
  assert.equal(harness.environment.pendingFrames.size, 1);
  for (const event of ["mousedown", "mousemove", "mouseup", "resize"]) {
    assert.equal(harness.environment.listenerCount(event), 1);
  }

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
  for (const event of ["mousedown", "mousemove", "mouseup", "resize"]) {
    assert.equal(harness.environment.listenerCount(event), 1);
  }
  assert.equal(harness.environment.pendingFrames.size, 1, "resize invalidations coalesce");
});

test("pointer orbit remains bounded to the mounted listener lifecycle", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  harness.environment.runNextFrame();

  harness.environment.emit("mousedown", { clientX: 10 });
  harness.environment.emit("mousemove", { clientX: 20 });
  harness.environment.emit("mouseup", {});

  assert.notEqual(adapter.camera.position.z, 0);
  assert.equal(harness.environment.pendingFrames.size, 1);
});

test("dispose cancels RAF, removes listeners, canvas and all retained resources", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  const geometryDispose = spyDispose(adapter.pawns[0].geometry);
  const materialDispose = spyDispose(adapter.pawns[0].material);
  const renderer = harness.renderers[0];
  const pendingFrame = adapter.rafId;

  adapter.dispose();

  assert.deepEqual(harness.environment.cancelledFrames, [pendingFrame]);
  for (const event of ["mousedown", "mousemove", "mouseup", "resize"]) {
    assert.equal(harness.environment.listenerCount(event), 0);
  }
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
    }
  }
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
  harness.environment.runNextFrame(860);

  assert.equal(adapter.diceAnimation, null);
  assert.equal(harness.environment.pendingFrames.size, 0);
  assert.deepEqual(diceRotations(adapter), [
    DICE_FACE_ORIENTATIONS[1], DICE_FACE_ORIENTATIONS[6],
  ]);
});

test("reduced motion settles directly with only one coalesced render", () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  harness.environment.runNextFrame();
  harness.completeLoad("Dice.glb", trackedModel().root);
  harness.environment.runNextFrame();

  assert.equal(adapter.presentDiceRoll({
    die1: 3, die2: 4, total: 7, presentationId: 5, reducedMotion: true,
  }), true);
  assert.equal(adapter.diceAnimation, null);
  assert.equal(harness.environment.pendingFrames.size, 1);
  harness.environment.runNextFrame(0);
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
  harness.environment.runNextFrame(860);

  assert.equal(await completion, true);
  assert.equal(harness.environment.pendingFrames.size, 0);
});

test("completion-aware reduced motion resolves without an animation loop", async () => {
  const harness = createHarness();
  const adapter = harness.createAdapter();
  adapter.mount(harness.container);
  harness.environment.runNextFrame();
  harness.completeLoad("Dice.glb", trackedModel().root);
  harness.environment.runNextFrame();

  assert.equal(await adapter.presentDiceRollAndWait({
    die1: 3, die2: 3, total: 6, presentationId: 7, reducedMotion: true,
  }), true);
  assert.equal(adapter.diceAnimation, null);
  assert.equal(harness.environment.pendingFrames.size, 1, "the final orientation needs one render only");
  harness.environment.runNextFrame();
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
  assert.equal(await current, true);

  const canceled = adapter.presentDiceRollAndWait({
    die1: 4, die2: 4, total: 8, presentationId: 10,
  });
  assert.equal(adapter.cancelDicePresentation(10), true);
  assert.equal(await canceled, false);
  harness.environment.runNextFrame(1000);
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
  harness.environment.runNextFrame(1000);

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
  for (const event of ["mousedown", "mousemove", "mouseup", "resize"]) {
    assert.equal(harness.environment.listenerCount(event), 1);
  }
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
  for (const event of ["mousedown", "mousemove", "mouseup", "resize"]) {
    assert.equal(harness.environment.listenerCount(event), 1);
  }
  second.dispose();
  assert.equal(harness.container.children.length, 0);
  assert.equal(harness.environment.pendingFrames.size, 0);
});

test("pawn updates preserve current stable visual slots and forward legacy coordinates", () => {
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

  adapter.setPawnPositions([
    { playerId: 1, position: 4 },
    { playerId: 2, position: 6 },
  ]);
  assert.equal(adapter.pawnsByPlayerId.get("1"), playerOnePawn);
  assert.equal(adapter.pawnsByPlayerId.get("2"), playerTwoPawn);
  assert.equal(playerOnePawn.userData.stepCounter, 4);
  assert.equal(playerTwoPawn.userData.stepCounter, 6);
});

test("adapter source stays presentation-only and Board delegates the Three lifecycle", async () => {
  const adapterSource = await readFile(new URL("../features/game/board/BoardSceneAdapter.js", import.meta.url), "utf8");
  const boardSource = await readFile(new URL("../pages/Game/Board.jsx", import.meta.url), "utf8");

  assert.doesNotMatch(
    adapterSource,
    /apiClient|GameAPI|GamePlayAPI|TurnAPI|STOMP|sockjs|authoritative.*controller|greekContent|presentationModels|Redis|MariaDB|localStorage|sessionStorage/iu,
  );
  assert.doesNotMatch(adapterSource, /fetch\s*\(|axios|\brent\b|afford|winner|commandId|stateVersion/iu);
  assert.match(adapterSource, /from "\.\/boardCalibration\.js"/);
  assert.match(boardSource, /new BoardSceneAdapter\(\{ boardModelUrl: boardGLB, diceModelUrl \}\)/);
  assert.doesNotMatch(boardSource, /new THREE\.|new GLTFLoader|requestAnimationFrame|cancelAnimationFrame/);
});

test("Board keeps the accessible total synchronized with observer dice events", async () => {
  const boardSource = await readFile(new URL("../pages/Game/Board.jsx", import.meta.url), "utf8");

  assert.match(
    boardSource,
    /if \(dicePresentation\) \{\s*setDice\(dicePresentation\.total\);\s*sceneAdapterRef\.current\?\.presentDiceRoll/,
  );
});

function createHarness() {
  const environment = createEnvironment();
  const renderers = [];
  const loads = [];
  const container = {
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
    createAdapter() {
      return new BoardSceneAdapter({
        boardModelUrl: "board.glb",
        diceModelUrl: "Dice.glb",
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
  let nextFrameId = 1;
  return {
    innerWidth: 1200,
    innerHeight: 800,
    devicePixelRatio: 2.5,
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
  };
}

function diceRotations(adapter) {
  return adapter.diceModels.map(die => [die.rotation.x, die.rotation.y, die.rotation.z]);
}

function createRenderer() {
  const renderer = {
    domElement: { parentNode: null },
    sizes: [],
    pixelRatios: [],
    renderCalls: 0,
    disposeCalls: 0,
    renderListDisposeCalls: 0,
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

function trackedModel() {
  const root = new THREE.Group();
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshBasicMaterial();
  const geometryDispose = spyDispose(geometry);
  const materialDispose = spyDispose(material);
  root.add(new THREE.Mesh(geometry, material));
  return { root, geometryDispose, materialDispose };
}

function spyDispose(resource) {
  const state = { count: 0 };
  resource.dispose = () => { state.count += 1; };
  return state;
}
