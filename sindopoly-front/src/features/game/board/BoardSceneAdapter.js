import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { buildForwardRoute, isBoardPosition } from "./boardCalibration.js";

const INTERACTION_EVENTS = ["mousedown", "mousemove", "mouseup"];
const DICE_ANIMATION_DURATION_MS = 760;
const DICE_SETTLED_POSITIONS = Object.freeze([
  Object.freeze([-2.1, 0.25, 0.5]),
  Object.freeze([2.1, 0.25, 0.5]),
]);

/**
 * Root rotations calibrated against the rendered Dice.glb. The model's original
 * +X/-X/+Y/-Y/+Z/-Z faces are 6/1/2/5/4/3 respectively.
 */
export const DICE_FACE_ORIENTATIONS = Object.freeze({
  1: Object.freeze([0, 0, -Math.PI / 2]),
  2: Object.freeze([Math.PI / 2, 0, 0]),
  3: Object.freeze([Math.PI, 0, 0]),
  4: Object.freeze([0, 0, 0]),
  5: Object.freeze([-Math.PI / 2, 0, 0]),
  6: Object.freeze([0, 0, Math.PI / 2]),
});

/**
 * Disposes a scene graph without double-disposing resources shared by clones.
 * The caller must only pass graphs whose resources it owns.
 */
export function disposeObjectGraph(root) {
  const disposed = {
    geometries: new Set(),
    materials: new Set(),
    textures: new Set(),
  };

  root?.traverse?.(object => {
    disposeOnce(object.geometry, disposed.geometries);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) disposeMaterial(material, disposed);
  });

  return disposed;
}

function disposeMaterial(material, disposed) {
  if (!material || disposed.materials.has(material)) return;

  for (const value of Object.values(material)) {
    if (value?.isTexture) disposeOnce(value, disposed.textures);
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry?.isTexture) disposeOnce(entry, disposed.textures);
      }
    }
  }

  if (material.uniforms) {
    for (const uniform of Object.values(material.uniforms)) {
      if (uniform?.value?.isTexture) disposeOnce(uniform.value, disposed.textures);
    }
  }

  disposeOnce(material, disposed.materials);
}

function disposeOnce(resource, seen) {
  if (!resource?.dispose || seen.has(resource)) return;
  seen.add(resource);
  resource.dispose();
}

/** Owns the current Board Three.js scene and no application/game authority. */
export class BoardSceneAdapter {
  constructor({ boardModelUrl, diceModelUrl, dependencies = {} } = {}) {
    this.boardModelUrl = boardModelUrl;
    this.diceModelUrl = diceModelUrl;
    this.environment = dependencies.environment ?? globalThis.window;
    this.createRenderer = dependencies.createRenderer ?? (() => new THREE.WebGLRenderer());
    this.createLoader = dependencies.createLoader ?? (() => new GLTFLoader());

    this.container = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.boardModel = null;
    this.diceModels = [];
    this.pawns = [];
    this.pawnsByPlayerId = new Map();
    this.rafId = null;
    this.diceAnimation = null;
    this.pendingDicePresentation = null;
    this.lastDicePresentationId = -1;

    this.mounted = false;
    this.disposed = false;
    this.generation = 0;
    this.isDragging = false;
    this.previousMouseX = 0;

    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onResize = this.onResize.bind(this);
    this.renderFrame = this.renderFrame.bind(this);
  }

  mount(container) {
    if (this.mounted || this.disposed || !container?.appendChild || !this.environment) return false;

    this.mounted = true;
    this.generation += 1;
    const generation = this.generation;
    this.container = container;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      75,
      this.environment.innerWidth / this.environment.innerHeight,
      0.1,
      100,
    );
    this.renderer = this.createRenderer();
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setSize(this.environment.innerWidth, this.environment.innerHeight * 0.99);
    this.container.appendChild(this.renderer.domElement);

    this.addLights();
    this.addPrimitivePawns();
    this.camera.position.set(40, 25, 0);
    this.camera.lookAt(0, 0, 0);
    this.registerListeners();
    this.loadBoard(generation);
    this.loadDice(generation);
    this.invalidate();
    return true;
  }

  addLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    ambientLight.position.set(0, 250, 0);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xfff0cf, 6);
    directionalLight.position.set(10, 40, -10);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.top = 2;
    directionalLight.shadow.camera.bottom = -2;
    directionalLight.shadow.camera.left = -2;
    directionalLight.shadow.camera.right = 2;
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = 40;
    this.scene.add(directionalLight);
  }

  addPrimitivePawns() {
    this.pawns = [
      createPawn(new THREE.BoxGeometry(), 0xff0000, [22, 0.5, -22]),
      createPawn(new THREE.SphereGeometry(0.5, 32, 32), 0x00ff00, [23, 0.7, -23]),
      createPawn(new THREE.TorusGeometry(0.5, 0.2, 16, 100), 0x0000ff, [21.5, 0.8, -23]),
      createPawn(new THREE.ConeGeometry(0.5, 1, 32), 0xf2ff00, [23.5, 0.5, -22]),
    ];
    for (const pawn of this.pawns) this.scene.add(pawn);
  }

  loadBoard(generation) {
    this.createLoader().load(
      this.boardModelUrl,
      gltf => {
        if (!this.isCurrent(generation)) {
          disposeObjectGraph(gltf?.scene);
          return;
        }
        const board = gltf.scene.clone();
        board.scale.set(0.035, 0.035, 0.035);
        board.position.set(0, 0, 0);
        board.rotation.set(0, Math.PI / 2, 0);
        this.boardModel = board;
        this.scene.add(board);
        this.invalidate();
      },
      undefined,
      error => {
        if (this.isCurrent(generation)) console.error("Error loading GLB model", error);
      },
    );
  }

  loadDice(generation) {
    this.createLoader().load(
      this.diceModelUrl,
      gltf => {
        if (!this.isCurrent(generation)) {
          disposeObjectGraph(gltf?.scene);
          return;
        }
        const dice1 = gltf.scene.clone();
        const dice2 = gltf.scene.clone();
        dice1.scale.set(10, 10, 10);
        dice1.position.set(...DICE_SETTLED_POSITIONS[0]);
        dice2.scale.set(10, 10, 10);
        dice2.position.set(...DICE_SETTLED_POSITIONS[1]);
        dice1.visible = false;
        dice2.visible = false;
        this.diceModels = [dice1, dice2];
        this.scene.add(dice1, dice2);
        if (this.pendingDicePresentation) {
          const presentation = this.pendingDicePresentation;
          this.pendingDicePresentation = null;
          this.startDicePresentation(presentation);
        } else {
          this.invalidate();
        }
      },
      undefined,
      error => {
        if (this.isCurrent(generation)) console.error("Error loading Dice GLB model", error);
      },
    );
  }

  isCurrent(generation) {
    return this.mounted && !this.disposed && this.generation === generation;
  }

  registerListeners() {
    for (const event of INTERACTION_EVENTS) {
      this.environment.addEventListener(event, this.listenerFor(event), false);
    }
    this.environment.addEventListener("resize", this.onResize);
  }

  listenerFor(event) {
    if (event === "mousedown") return this.onMouseDown;
    if (event === "mousemove") return this.onMouseMove;
    return this.onMouseUp;
  }

  onMouseDown(event) {
    if (!this.mounted) return;
    this.isDragging = true;
    this.previousMouseX = event.clientX;
  }

  onMouseMove(event) {
    if (!this.mounted || !this.isDragging) return;
    const angle = (event.clientX - this.previousMouseX) * 0.003;
    const { x, y, z } = this.camera.position;
    this.camera.position.set(
      Math.cos(angle) * x - Math.sin(angle) * z,
      y,
      Math.sin(angle) * x + Math.cos(angle) * z,
    );
    this.camera.lookAt(0, 0, 0);
    this.previousMouseX = event.clientX;
    this.invalidate();
  }

  onMouseUp() {
    this.isDragging = false;
  }

  onResize() {
    this.resize();
  }

  resize(width = this.environment?.innerWidth, height = this.environment?.innerHeight * 0.92, pixelRatio = this.environment?.devicePixelRatio) {
    if (!this.mounted || !Number.isFinite(width) || !Number.isFinite(height) || height <= 0) return false;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(pixelRatio || 1, 2));
    this.invalidate();
    return true;
  }

  orientCameraForPosition(position) {
    if (!this.mounted || !isBoardPosition(position)) return false;
    if (position <= 10) this.camera.position.set(40, 25, 0);
    else if (position <= 20) this.camera.position.set(0, 25, 40);
    else if (position <= 30) this.camera.position.set(-40, 25, 0);
    else this.camera.position.set(0, 25, -40);
    this.camera.lookAt(0, 0, 0);
    this.invalidate();
    return true;
  }

  setPawnPositions(playerRows) {
    if (!this.mounted || !Array.isArray(playerRows)) return false;
    this.assignPawns(playerRows);
    for (const pawn of this.pawns) pawn.visible = false;
    for (const row of playerRows) this.setPawnPosition(row.playerId ?? row.player_id, row.position);
    return true;
  }

  setPawnPosition(playerId, position) {
    if (!this.mounted || playerId == null || !isBoardPosition(position)) return false;
    const pawn = this.pawnsByPlayerId.get(String(playerId));
    if (!pawn) return false;
    pawn.visible = true;
    const currentPosition = pawn.userData.stepCounter === 40 ? 0 : pawn.userData.stepCounter;
    const route = buildForwardRoute(currentPosition, position);
    if (route === null) return false;
    for (let index = 0; index < route.length; index += 1) advancePawn(pawn);
    this.invalidate();
    return true;
  }

  /** Presents a confirmed pair; the scene never generates or changes game-state dice. */
  presentDiceRoll({ die1, die2, total, presentationId, reducedMotion = false } = {}) {
    if (!this.mounted || this.disposed
        || !isDieValue(die1) || !isDieValue(die2)
        || !Number.isSafeInteger(total) || total !== die1 + die2
        || !Number.isSafeInteger(presentationId) || presentationId < 0
        || presentationId <= this.lastDicePresentationId) {
      return false;
    }

    this.lastDicePresentationId = presentationId;
    const presentation = Object.freeze({
      die1,
      die2,
      total,
      presentationId,
      reducedMotion: reducedMotion === true,
    });
    if (this.diceModels.length !== 2) {
      this.pendingDicePresentation = presentation;
      return true;
    }
    this.startDicePresentation(presentation);
    return true;
  }

  startDicePresentation(presentation) {
    if (presentation.reducedMotion) {
      this.diceAnimation = null;
      this.applyFinalDiceOrientation(presentation);
      this.invalidate();
      return;
    }

    this.diceAnimation = { presentation, startedAt: null };
    this.applyDiceAnimationFrame(presentation, 0);
    this.invalidate();
  }

  applyFinalDiceOrientation({ die1, die2 }) {
    for (const [index, value] of [die1, die2].entries()) {
      const die = this.diceModels[index];
      die.visible = true;
      die.position.set(...DICE_SETTLED_POSITIONS[index]);
      die.rotation.set(...DICE_FACE_ORIENTATIONS[value]);
    }
  }

  applyDiceAnimationFrame(presentation, progress) {
    const eased = 1 - ((1 - progress) ** 3);
    const remaining = 1 - eased;
    for (const [index, value] of [presentation.die1, presentation.die2].entries()) {
      const die = this.diceModels[index];
      const settled = DICE_SETTLED_POSITIONS[index];
      const orientation = DICE_FACE_ORIENTATIONS[value];
      const variation = (presentation.presentationId + index * 2) % 3;
      die.visible = true;
      die.position.set(
        settled[0],
        settled[1] + Math.sin(Math.PI * progress) * (2.1 + index * 0.25),
        settled[2],
      );
      die.rotation.set(
        orientation[0] + remaining * Math.PI * (4 + variation),
        orientation[1] + remaining * Math.PI * (3 + index),
        orientation[2] + remaining * Math.PI * (4 + ((variation + 1) % 3)),
      );
    }
  }

  assignPawns(playerRows) {
    const next = new Map();
    const available = new Set(this.pawns);
    for (const row of playerRows) {
      const key = String(row.playerId ?? row.player_id);
      const existing = this.pawnsByPlayerId.get(key);
      if (existing && available.has(existing)) {
        next.set(key, existing);
        available.delete(existing);
      }
    }
    const unassigned = playerRows
      .filter(row => !next.has(String(row.playerId ?? row.player_id)))
      .sort((left, right) => Number(left.playerId ?? left.player_id) - Number(right.playerId ?? right.player_id));
    for (const row of unassigned) {
      const pawn = available.values().next().value;
      if (!pawn) break;
      next.set(String(row.playerId ?? row.player_id), pawn);
      available.delete(pawn);
    }
    this.pawnsByPlayerId = next;
  }

  invalidate() {
    if (!this.mounted || this.rafId !== null) return false;
    this.rafId = this.environment.requestAnimationFrame(this.renderFrame);
    return true;
  }

  renderFrame(timestamp) {
    this.rafId = null;
    if (!this.mounted || this.disposed) return;
    let animationContinues = false;
    if (this.diceAnimation) {
      const now = Number.isFinite(timestamp) ? timestamp : 0;
      if (this.diceAnimation.startedAt === null) this.diceAnimation.startedAt = now;
      const elapsed = Math.max(0, now - this.diceAnimation.startedAt);
      const progress = Math.min(elapsed / DICE_ANIMATION_DURATION_MS, 1);
      this.applyDiceAnimationFrame(this.diceAnimation.presentation, progress);
      if (progress >= 1) {
        this.applyFinalDiceOrientation(this.diceAnimation.presentation);
        this.diceAnimation = null;
      } else {
        animationContinues = true;
      }
    }
    this.renderer.render(this.scene, this.camera);
    if (animationContinues) this.invalidate();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.mounted = false;
    this.generation += 1;

    if (this.rafId !== null) this.environment?.cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.diceAnimation = null;
    this.pendingDicePresentation = null;
    if (this.environment?.removeEventListener) {
      for (const event of INTERACTION_EVENTS) {
        this.environment.removeEventListener(event, this.listenerFor(event), false);
      }
      this.environment.removeEventListener("resize", this.onResize);
    }

    disposeObjectGraph(this.scene);
    this.renderer?.renderLists?.dispose?.();
    this.renderer?.dispose?.();
    const canvas = this.renderer?.domElement;
    if (canvas && canvas.parentNode === this.container) this.container.removeChild(canvas);

    this.container = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.boardModel = null;
    this.diceModels = [];
    this.pawns = [];
    this.pawnsByPlayerId.clear();
    this.lastDicePresentationId = -1;
    this.isDragging = false;
  }
}

function isDieValue(value) {
  return Number.isSafeInteger(value) && value >= 1 && value <= 6;
}

function createPawn(geometry, color, position) {
  const pawn = new THREE.Mesh(geometry, new THREE.MeshPhongMaterial({ color }));
  pawn.position.set(...position);
  pawn.userData.stepCounter = 0;
  pawn.userData.caseNumber = 1;
  pawn.userData.money = 1500;
  return pawn;
}

function advancePawn(pawn) {
  if (pawn.userData.stepCounter !== 0 && pawn.userData.stepCounter % 10 === 0) {
    if (pawn.userData.stepCounter === 40) pawn.userData.stepCounter = 0;
    pawn.userData.caseNumber = pawn.userData.caseNumber < 4 ? pawn.userData.caseNumber + 1 : 1;
  }

  const stepSize = pawn.userData.stepCounter % 10 === 0 || pawn.userData.stepCounter % 10 === 9 ? 6 : 4.15;
  if (pawn.userData.caseNumber === 1) pawn.position.z += stepSize;
  else if (pawn.userData.caseNumber === 2) pawn.position.x -= stepSize;
  else if (pawn.userData.caseNumber === 3) pawn.position.z -= stepSize;
  else pawn.position.x += stepSize;
  pawn.userData.stepCounter += 1;
}
