import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  buildForwardRoute,
  getPawnAnchor,
  isBoardPosition,
  isPawnSlot,
} from "./boardCalibration.js";

const CANVAS_INTERACTION_EVENTS = ["pointerdown", "pointermove", "pointerup", "pointercancel"];
const CAMERA_TRANSITION_DURATION_MS = 460;
const CAMERA_ZOOM_DURATION_MS = 180;
const CAMERA_ROTATION_RADIANS_PER_PIXEL = 0.0024;
const CAMERA_WHEEL_DISTANCE_PER_PIXEL = 0.012;
export const CAMERA_ZOOM_BOUNDS = Object.freeze({ minimum: 42, maximum: 62 });
export const DEFAULT_CAMERA_STATE = Object.freeze({
  position: Object.freeze([42, 32, 0]),
  target: Object.freeze([0, 0, 0]),
  fov: 65,
});
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
  constructor({ boardModelUrl, diceModelUrl, reducedMotion = false, dependencies = {} } = {}) {
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
    this.diceCompletion = null;
    this.lastDicePresentationId = -1;
    this.resizeObserver = null;
    this.cameraTarget = new THREE.Vector3(...DEFAULT_CAMERA_STATE.target);
    this.cameraTransition = null;
    this.reducedMotion = reducedMotion === true;

    this.mounted = false;
    this.disposed = false;
    this.generation = 0;
    this.activePointerId = null;
    this.previousPointerX = 0;

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerEnd = this.onPointerEnd.bind(this);
    this.onWheel = this.onWheel.bind(this);
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
    const { width, height } = this.measureContainer();
    this.camera = new THREE.PerspectiveCamera(
      DEFAULT_CAMERA_STATE.fov,
      width / height,
      0.1,
      100,
    );
    this.renderer = this.createRenderer();
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setSize(width, height);
    this.container.appendChild(this.renderer.domElement);

    this.addLights();
    this.addPrimitivePawns();
    this.applyCameraState(DEFAULT_CAMERA_STATE);
    this.registerListeners();
    const ResizeObserver = this.environment.ResizeObserver ?? globalThis.ResizeObserver;
    if (typeof ResizeObserver === "function") {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.container);
    }
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
        if (this.isCurrent(generation)) {
          this.pendingDicePresentation = null;
          this.settleDiceCompletion(false);
          console.error("Error loading Dice GLB model", error);
        }
      },
    );
  }

  isCurrent(generation) {
    return this.mounted && !this.disposed && this.generation === generation;
  }

  registerListeners() {
    const canvas = this.renderer.domElement;
    canvas.style.touchAction = "none";
    for (const event of CANVAS_INTERACTION_EVENTS) {
      canvas.addEventListener(event, this.listenerFor(event), false);
    }
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.environment.addEventListener("resize", this.onResize);
  }

  listenerFor(event) {
    if (event === "pointerdown") return this.onPointerDown;
    if (event === "pointermove") return this.onPointerMove;
    return this.onPointerEnd;
  }

  onPointerDown(event) {
    if (!this.mounted || this.activePointerId != null || event.button !== 0) return;
    event.preventDefault?.();
    this.cancelCameraTransition();
    this.activePointerId = event.pointerId;
    this.previousPointerX = event.clientX;
    this.renderer.domElement.setPointerCapture?.(event.pointerId);
  }

  onPointerMove(event) {
    if (!this.mounted || event.pointerId !== this.activePointerId) return;
    const angle = (event.clientX - this.previousPointerX) * CAMERA_ROTATION_RADIANS_PER_PIXEL;
    const relative = this.camera.position.clone().sub(this.cameraTarget);
    this.camera.position.set(
      this.cameraTarget.x + Math.cos(angle) * relative.x - Math.sin(angle) * relative.z,
      this.cameraTarget.y + relative.y,
      this.cameraTarget.z + Math.sin(angle) * relative.x + Math.cos(angle) * relative.z,
    );
    this.camera.lookAt(this.cameraTarget);
    this.previousPointerX = event.clientX;
    event.preventDefault?.();
    this.invalidate();
  }

  onPointerEnd(event) {
    if (event.pointerId !== this.activePointerId) return;
    this.renderer?.domElement?.releasePointerCapture?.(event.pointerId);
    this.activePointerId = null;
  }

  onWheel(event) {
    if (!this.mounted || !Number.isFinite(event.deltaY)) return;
    event.preventDefault?.();
    this.cancelCameraTransition();
    const relative = this.camera.position.clone().sub(this.cameraTarget);
    const currentDistance = relative.length();
    const distance = clamp(
      currentDistance + event.deltaY * CAMERA_WHEEL_DISTANCE_PER_PIXEL,
      CAMERA_ZOOM_BOUNDS.minimum,
      CAMERA_ZOOM_BOUNDS.maximum,
    );
    if (Math.abs(distance - currentDistance) < 0.001) return;
    const position = relative.normalize().multiplyScalar(distance).add(this.cameraTarget);
    this.transitionCamera({ position, duration: CAMERA_ZOOM_DURATION_MS });
  }

  onResize() {
    this.resize();
  }

  resize(width, height, pixelRatio = this.environment?.devicePixelRatio) {
    if (!this.mounted) return false;
    const measured = this.measureContainer();
    const resolvedWidth = positiveDimension(width) ?? measured.width;
    const resolvedHeight = positiveDimension(height) ?? measured.height;
    this.camera.aspect = resolvedWidth / resolvedHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(resolvedWidth, resolvedHeight);
    this.renderer.setPixelRatio(Math.min(pixelRatio || 1, 2));
    this.invalidate();
    return true;
  }

  measureContainer() {
    return {
      width: positiveDimension(this.container?.clientWidth)
        ?? positiveDimension(this.environment?.innerWidth)
        ?? 1,
      height: positiveDimension(this.container?.clientHeight)
        ?? positiveDimension(this.environment?.innerHeight)
        ?? 1,
    };
  }

  orientCameraForPosition(position) {
    if (!this.mounted || !isBoardPosition(position)) return false;
    const relative = this.camera.position.clone().sub(this.cameraTarget);
    const radius = Math.hypot(relative.x, relative.z);
    const components = position <= 10 ? [radius, relative.y, 0]
      : position <= 20 ? [0, relative.y, radius]
        : position <= 30 ? [-radius, relative.y, 0]
          : [0, relative.y, -radius];
    return this.transitionCamera({
      position: new THREE.Vector3(...components).add(this.cameraTarget),
    });
  }

  /** Starts one replaceable local camera move; later presentation work can reuse this seam. */
  transitionCamera({
    position,
    target = this.cameraTarget,
    fov = this.camera?.fov,
    duration = CAMERA_TRANSITION_DURATION_MS,
    reducedMotion = this.reducedMotion,
  } = {}) {
    if (!this.mounted || !this.camera) return false;
    const nextPosition = toVector3(position);
    const nextTarget = toVector3(target);
    if (!nextPosition || !nextTarget || !Number.isFinite(fov)) return false;
    this.cancelCameraTransition();
    if (reducedMotion === true || !Number.isFinite(duration) || duration <= 0) {
      this.applyCameraState({ position: nextPosition, target: nextTarget, fov });
      this.invalidate();
      return true;
    }
    this.cameraTransition = {
      startedAt: null,
      duration,
      startPosition: this.camera.position.clone(),
      startTarget: this.cameraTarget.clone(),
      startFov: this.camera.fov,
      endPosition: nextPosition,
      endTarget: nextTarget,
      endFov: fov,
    };
    this.invalidate();
    return true;
  }

  resetCamera(options = {}) {
    return this.transitionCamera({ ...DEFAULT_CAMERA_STATE, ...options });
  }

  cancelCameraTransition() {
    const hadTransition = this.cameraTransition != null;
    this.cameraTransition = null;
    return hadTransition;
  }

  applyCameraState({ position, target, fov }) {
    const resolvedPosition = toVector3(position);
    const resolvedTarget = toVector3(target);
    if (!resolvedPosition || !resolvedTarget) return false;
    this.camera.position.copy(resolvedPosition);
    this.cameraTarget.copy(resolvedTarget);
    if (Number.isFinite(fov) && this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.lookAt(this.cameraTarget);
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
    return this.placePawnAt(pawn, position, this.pawns.indexOf(pawn));
  }

  /** Applies an accepted final position without reconstructing historical movement. */
  snapPawnPosition({ playerId, position, slot = null } = {}) {
    if (!this.mounted || playerId == null || !isBoardPosition(position)) return false;
    const pawn = this.pawnsByPlayerId.get(String(playerId));
    if (!pawn) return false;
    const resolvedSlot = isPawnSlot(slot) ? slot : this.pawns.indexOf(pawn);
    return this.placePawnAt(pawn, position, resolvedSlot);
  }

  /**
   * Executes only the caller-selected movement mode. FE-REVAMP-021 keeps this
   * immediate while guaranteeing that every applied coordinate is calibrated.
   */
  presentPawnMovement({ mode, playerId, from, to, slot = null, route = null } = {}) {
    if (!this.mounted || !["FORWARD", "DIRECT"].includes(mode)
        || playerId == null || !isBoardPosition(from) || !isBoardPosition(to)) {
      return false;
    }
    if (mode === "FORWARD") {
      const expectedRoute = buildForwardRoute(from, to);
      if (expectedRoute == null
          || !Array.isArray(route)
          || expectedRoute.length !== route.length
          || expectedRoute.some((position, index) => position !== route[index])) {
        return false;
      }
    } else if (route != null) {
      return false;
    }
    const pawn = this.pawnsByPlayerId.get(String(playerId));
    if (!pawn) return false;
    const resolvedSlot = isPawnSlot(slot) ? slot : this.pawns.indexOf(pawn);
    const positions = mode === "FORWARD" ? route : [to];
    for (const position of positions) {
      if (!this.placePawnAt(pawn, position, resolvedSlot, false)) return false;
    }
    this.orientCameraForPosition(to);
    this.invalidate();
    return true;
  }

  cancelPawnPresentation() {
    this.cancelCameraTransition();
    return this.mounted && !this.disposed;
  }

  placePawnAt(pawn, position, slot, render = true) {
    const anchor = getPawnAnchor(position, slot);
    if (!anchor) return false;
    pawn.visible = true;
    pawn.position.set(anchor.x, anchor.y, anchor.z);
    pawn.userData.stepCounter = position;
    pawn.userData.caseNumber = Math.floor(position / 10) + 1;
    if (render) this.invalidate();
    return true;
  }

  /** Presents a confirmed pair; the scene never generates or changes game-state dice. */
  presentDiceRoll(value = {}) {
    return this.acceptDicePresentation(value, null);
  }

  /** Resolves when this exact decorative roll settles, or false when canceled/superseded. */
  presentDiceRollAndWait(value = {}) {
    return new Promise(resolve => {
      if (!this.acceptDicePresentation(value, resolve)) resolve(false);
    });
  }

  acceptDicePresentation({ die1, die2, total, presentationId, reducedMotion = false } = {}, resolve) {
    if (!this.mounted || this.disposed
        || !isDieValue(die1) || !isDieValue(die2)
        || !Number.isSafeInteger(total) || total !== die1 + die2
        || !Number.isSafeInteger(presentationId) || presentationId < 0
        || presentationId <= this.lastDicePresentationId) {
      return false;
    }

    this.settleDiceCompletion(false);
    this.lastDicePresentationId = presentationId;
    this.diceCompletion = typeof resolve === "function"
      ? { presentationId, resolve }
      : null;
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

  cancelDicePresentation(presentationId = null) {
    const currentId = this.diceAnimation?.presentation?.presentationId
      ?? this.pendingDicePresentation?.presentationId
      ?? this.diceCompletion?.presentationId
      ?? null;
    if (currentId == null
        || presentationId != null && presentationId !== currentId) {
      return false;
    }
    this.diceAnimation = null;
    this.pendingDicePresentation = null;
    this.settleDiceCompletion(false);
    return true;
  }

  startDicePresentation(presentation) {
    if (presentation.reducedMotion) {
      this.diceAnimation = null;
      this.applyFinalDiceOrientation(presentation);
      this.invalidate();
      this.settleDiceCompletion(true);
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
    if (this.cameraTransition) {
      const now = Number.isFinite(timestamp) ? timestamp : 0;
      if (this.cameraTransition.startedAt === null) this.cameraTransition.startedAt = now;
      const elapsed = Math.max(0, now - this.cameraTransition.startedAt);
      const progress = Math.min(elapsed / this.cameraTransition.duration, 1);
      this.applyCameraTransitionFrame(this.cameraTransition, progress);
      if (progress >= 1) this.cameraTransition = null;
      else animationContinues = true;
    }
    if (this.diceAnimation) {
      const now = Number.isFinite(timestamp) ? timestamp : 0;
      if (this.diceAnimation.startedAt === null) this.diceAnimation.startedAt = now;
      const elapsed = Math.max(0, now - this.diceAnimation.startedAt);
      const progress = Math.min(elapsed / DICE_ANIMATION_DURATION_MS, 1);
      this.applyDiceAnimationFrame(this.diceAnimation.presentation, progress);
      if (progress >= 1) {
        this.applyFinalDiceOrientation(this.diceAnimation.presentation);
        this.diceAnimation = null;
        this.settleDiceCompletion(true);
      } else {
        animationContinues = true;
      }
    }
    this.renderer.render(this.scene, this.camera);
    if (animationContinues) this.invalidate();
  }

  applyCameraTransitionFrame(transition, progress) {
    const eased = 1 - ((1 - progress) ** 3);
    this.camera.position.lerpVectors(transition.startPosition, transition.endPosition, eased);
    this.cameraTarget.lerpVectors(transition.startTarget, transition.endTarget, eased);
    this.camera.fov = THREE.MathUtils.lerp(transition.startFov, transition.endFov, eased);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.cameraTarget);
  }

  settleDiceCompletion(completed) {
    const completion = this.diceCompletion;
    this.diceCompletion = null;
    completion?.resolve(completed);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.mounted = false;
    this.generation += 1;

    if (this.rafId !== null) this.environment?.cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.diceAnimation = null;
    this.cameraTransition = null;
    this.pendingDicePresentation = null;
    this.settleDiceCompletion(false);
    const canvas = this.renderer?.domElement;
    if (canvas?.removeEventListener) {
      for (const event of CANVAS_INTERACTION_EVENTS) {
        canvas.removeEventListener(event, this.listenerFor(event), false);
      }
      canvas.removeEventListener("wheel", this.onWheel, false);
      if (this.activePointerId != null) canvas.releasePointerCapture?.(this.activePointerId);
    }
    if (this.environment?.removeEventListener) {
      this.environment.removeEventListener("resize", this.onResize);
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    disposeObjectGraph(this.scene);
    this.renderer?.renderLists?.dispose?.();
    this.renderer?.dispose?.();
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
    this.activePointerId = null;
  }
}

function isDieValue(value) {
  return Number.isSafeInteger(value) && value >= 1 && value <= 6;
}

function positiveDimension(value) {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function toVector3(value) {
  if (value instanceof THREE.Vector3) return value.clone();
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) return null;
  return new THREE.Vector3(...value);
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function createPawn(geometry, color, position) {
  const pawn = new THREE.Mesh(geometry, new THREE.MeshPhongMaterial({ color }));
  pawn.position.set(...position);
  pawn.userData.stepCounter = 0;
  pawn.userData.caseNumber = 1;
  pawn.userData.money = 1500;
  return pawn;
}
