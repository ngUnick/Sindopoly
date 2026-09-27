import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  buildForwardRoute,
  getPawnAnchor,
  isBoardPosition,
  isPawnSlot,
} from "./boardCalibration.js";
import { PAWN_SLOT_ASSETS } from "./pawnAssets.js";

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
export const DICE_PRESENTATION_TIMING = Object.freeze({
  anticipationMs: 110,
  rollMs: 620,
  settleMs: 160,
  resultHoldMs: 500,
  cameraEmphasisMs: 400,
  cameraRestoreDelayMs: 120,
  cameraRestoreMs: 360,
});
const DICE_PRESENTATION_DURATION_MS = DICE_PRESENTATION_TIMING.anticipationMs
  + DICE_PRESENTATION_TIMING.rollMs
  + DICE_PRESENTATION_TIMING.settleMs
  + DICE_PRESENTATION_TIMING.resultHoldMs;
// Return toward the captured user view during the hold so pawn traversal inherits that view.
const DICE_CAMERA_RESTORE_AT_MS = DICE_PRESENTATION_TIMING.anticipationMs
  + DICE_PRESENTATION_TIMING.rollMs
  + DICE_PRESENTATION_TIMING.settleMs
  + DICE_PRESENTATION_TIMING.cameraRestoreDelayMs;
const DICE_VISUAL_SCALE = 11.5;
// The board artwork lies on source Z=5 after the authored board transform and 0.035 runtime scale.
export const BOARD_SURFACE_Y = 0.043653335571289066;
export const DICE_SURFACE_CLEARANCE = 0.03;
export const PAWN_MOVEMENT_TIMING = Object.freeze({
  tileDurationMs: 145,
  maximumTravelDurationMs: 1_440,
  arrivalDurationMs: 110,
  hopHeight: 0.65,
  arrivalLift: 0.12,
});
const DICE_SETTLED_XZ = Object.freeze([
  Object.freeze([-2.65, 0.85]),
  Object.freeze([2.35, -0.65]),
]);
const DICE_LAUNCH_XZ = Object.freeze([
  Object.freeze([-5.4, -2.2]),
  Object.freeze([5.1, 2.1]),
]);
const DIRECTIONAL_SHADOW_BOUNDS = Object.freeze({
  left: -28,
  right: 28,
  top: 28,
  bottom: -28,
  near: 1,
  far: 80,
  mapSize: 1024,
  bias: -0.00015,
  normalBias: 0.025,
});

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
  return disposeObjectGraphs([root]);
}

/** Disposes a related group of owned graphs with one shared resource ledger. */
export function disposeObjectGraphs(roots) {
  const disposed = {
    geometries: new Set(),
    materials: new Set(),
    textures: new Set(),
  };

  for (const root of roots ?? []) {
    root?.traverse?.(object => {
      disposeOnce(object.geometry, disposed.geometries);
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) disposeMaterial(material, disposed);
    });
  }

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
  constructor({ boardModelUrl, diceModelUrl, pawnModelUrls = {}, reducedMotion = false, dependencies = {} } = {}) {
    this.boardModelUrl = boardModelUrl;
    this.diceModelUrl = diceModelUrl;
    this.pawnModelUrls = pawnModelUrls;
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
    this.pawnTemplates = new Map();
    this.pawnsByPlayerId = new Map();
    this.rafId = null;
    this.diceAnimation = null;
    this.pendingDicePresentation = null;
    this.diceCompletion = null;
    this.lastDicePresentationId = -1;
    this.diceCameraPresentation = null;
    this.pawnAnimation = null;
    this.pawnCompletion = null;
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
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
    this.loadPawnTemplates(generation);
    this.invalidate();
    return true;
  }

  addLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 2);
    ambientLight.position.set(0, 250, 0);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xfff0cf, 3.75);
    directionalLight.position.set(18, 36, -16);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.set(DIRECTIONAL_SHADOW_BOUNDS.mapSize, DIRECTIONAL_SHADOW_BOUNDS.mapSize);
    directionalLight.shadow.camera.top = DIRECTIONAL_SHADOW_BOUNDS.top;
    directionalLight.shadow.camera.bottom = DIRECTIONAL_SHADOW_BOUNDS.bottom;
    directionalLight.shadow.camera.left = DIRECTIONAL_SHADOW_BOUNDS.left;
    directionalLight.shadow.camera.right = DIRECTIONAL_SHADOW_BOUNDS.right;
    directionalLight.shadow.camera.near = DIRECTIONAL_SHADOW_BOUNDS.near;
    directionalLight.shadow.camera.far = DIRECTIONAL_SHADOW_BOUNDS.far;
    directionalLight.shadow.bias = DIRECTIONAL_SHADOW_BOUNDS.bias;
    directionalLight.shadow.normalBias = DIRECTIONAL_SHADOW_BOUNDS.normalBias;
    directionalLight.shadow.camera.updateProjectionMatrix();
    this.scene.add(directionalLight);
  }

  addPrimitivePawns() {
    this.pawns = [
      createPawn(new THREE.BoxGeometry(), PAWN_SLOT_ASSETS[0].accentColor, [22, 0.5, -22], 0.5),
      createPawn(new THREE.SphereGeometry(0.5, 32, 32), PAWN_SLOT_ASSETS[1].accentColor, [23, 0.5, -23], 0.5),
      createPawn(new THREE.TorusGeometry(0.5, 0.2, 16, 100), PAWN_SLOT_ASSETS[2].accentColor, [21.5, 0.5, -23], 0.7),
      createPawn(new THREE.ConeGeometry(0.5, 1, 32), PAWN_SLOT_ASSETS[3].accentColor, [23.5, 0.5, -22], 0.5),
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
        // The tabletop receives movable-piece shadows but does not self-shadow its artwork.
        setShadowParticipation(board, { castShadow: false, receiveShadow: true });
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
        dice1.scale.setScalar(DICE_VISUAL_SCALE);
        dice2.scale.setScalar(DICE_VISUAL_SCALE);
        captureDiceLocalBounds(dice1);
        captureDiceLocalBounds(dice2);
        setGroundedDicePosition(dice1, ...DICE_SETTLED_XZ[0]);
        setGroundedDicePosition(dice2, ...DICE_SETTLED_XZ[1]);
        dice1.visible = false;
        dice2.visible = false;
        setShadowParticipation(dice1, { castShadow: true, receiveShadow: true });
        setShadowParticipation(dice2, { castShadow: true, receiveShadow: true });
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

  loadPawnTemplates(generation) {
    for (const [slot, asset] of PAWN_SLOT_ASSETS.entries()) {
      const url = this.pawnModelUrls?.[asset.id];
      if (!url) continue;
      this.createLoader().load(
        url,
        gltf => {
          if (!this.isCurrent(generation)) {
            disposeObjectGraph(gltf?.scene);
            return;
          }
          this.pawnTemplates.set(asset.id, gltf.scene);
          this.attachPawnVisual(slot, gltf.scene, asset.accentColor);
          this.invalidate();
        },
        undefined,
        error => {
          // Loading is optional presentation: the mounted primitive remains usable.
          if (this.isCurrent(generation)) console.error(`Error loading ${asset.id} pawn GLB model`, error);
        },
      );
    }
  }

  attachPawnVisual(slot, template, accentColor) {
    const pawn = this.pawns[slot];
    if (!pawn || pawn.userData.glbVisual) return false;
    const visual = template.clone(true);
    const accents = new Map();
    visual.traverse(object => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      object.material = replaceAccentMaterials(object.material, accents, accentColor);
    });
    pawn.userData.glbVisual = visual;
    pawn.userData.ownedAccentMaterials = [...accents.values()];
    pawn.userData.primitiveFallback.visible = false;
    pawn.add(visual);
    return true;
  }

  listenerFor(event) {
    if (event === "pointerdown") return this.onPointerDown;
    if (event === "pointermove") return this.onPointerMove;
    return this.onPointerEnd;
  }

  onPointerDown(event) {
    if (!this.mounted || this.activePointerId != null || event.button !== 0) return;
    event.preventDefault?.();
    this.interruptDiceCameraPresentation();
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
    this.interruptDiceCameraPresentation();
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
    owner = null,
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
      owner,
    };
    this.invalidate();
    return true;
  }

  resetCamera(options = {}) {
    this.interruptDiceCameraPresentation();
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
    this.cancelPawnPresentation();
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
    this.cancelPawnPresentation();
    const pawn = this.pawnsByPlayerId.get(String(playerId));
    if (!pawn) return false;
    const resolvedSlot = isPawnSlot(slot) ? slot : this.pawns.indexOf(pawn);
    return this.placePawnAt(pawn, position, resolvedSlot);
  }

  /** Animates only a caller-proven forward route; all other movement stays direct. */
  presentPawnMovement({
    mode,
    playerId,
    from,
    to,
    slot = null,
    route = null,
    presentationId,
    reducedMotion = false,
  } = {}) {
    if (!this.mounted || !["FORWARD", "DIRECT"].includes(mode)
        || playerId == null || !isBoardPosition(from) || !isBoardPosition(to)
        || typeof presentationId !== "string" || presentationId.length === 0
        || presentationId.length > 256) {
      return false;
    }
    if (mode === "FORWARD") {
      const expectedRoute = buildForwardRoute(from, to);
      if (expectedRoute == null
          || !Array.isArray(route)
          || route.length === 0
          || route.length > 12
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
    this.cancelPawnPresentation();
    if (mode === "DIRECT" || reducedMotion === true) {
      if (!this.placePawnAt(pawn, to, resolvedSlot, false)) return false;
      if (mode === "FORWARD") {
        this.orientPawnForStep(pawn, route.at(-2) ?? from, to, resolvedSlot);
      }
      this.invalidate();
      return true;
    }

    const segments = this.buildPawnSegments(from, route, resolvedSlot, pawn.rotation.y);
    if (segments == null || segments.length === 0) return false;
    if (!this.placePawnAt(pawn, from, resolvedSlot, false)) return false;
    const stepDuration = Math.min(
      PAWN_MOVEMENT_TIMING.tileDurationMs,
      PAWN_MOVEMENT_TIMING.maximumTravelDurationMs / segments.length,
    );
    this.pawnAnimation = {
      presentationId,
      pawn,
      slot: resolvedSlot,
      destination: to,
      segments,
      stepDuration,
      startedAt: null,
    };
    const completion = new Promise(resolve => {
      this.pawnCompletion = { presentationId, resolve };
    });
    this.invalidate();
    return completion;
  }

  cancelPawnPresentation(presentationId = null) {
    const animation = this.pawnAnimation;
    if (!animation
        || presentationId != null && presentationId !== animation.presentationId) {
      return false;
    }
    this.placePawnAt(animation.pawn, animation.destination, animation.slot, false);
    animation.pawn.rotation.y = animation.segments.at(-1).targetYaw;
    this.pawnAnimation = null;
    this.settlePawnCompletion(false);
    this.invalidate();
    return true;
  }

  buildPawnSegments(from, route, slot, initialYaw) {
    const segments = [];
    let previousPosition = from;
    let previousYaw = initialYaw;
    for (const position of route) {
      const start = getPawnAnchor(previousPosition, slot);
      const end = getPawnAnchor(position, slot);
      if (!start || !end) return null;
      const targetYaw = Math.atan2(end.x - start.x, end.z - start.z);
      segments.push({ start, end, startYaw: previousYaw, targetYaw });
      previousPosition = position;
      previousYaw = targetYaw;
    }
    return segments;
  }

  orientPawnForStep(pawn, from, to, slot) {
    const start = getPawnAnchor(from, slot);
    const end = getPawnAnchor(to, slot);
    if (!start || !end) return false;
    pawn.rotation.y = Math.atan2(end.x - start.x, end.z - start.z);
    return true;
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
    this.beginDiceCameraRestore();
    this.settleDiceCompletion(false);
    return true;
  }

  startDicePresentation(presentation) {
    if (presentation.reducedMotion) {
      this.applyFinalDiceOrientation(presentation);
      this.beginDiceCameraRestore();
      this.diceAnimation = { presentation, startedAt: null };
      this.invalidate();
      return;
    }

    this.beginDiceCameraEmphasis();
    this.diceAnimation = { presentation, startedAt: null };
    this.applyDiceAnimationFrame(presentation, 0);
    this.invalidate();
  }

  applyFinalDiceOrientation({ die1, die2 }) {
    for (const [index, value] of [die1, die2].entries()) {
      const die = this.diceModels[index];
      die.visible = true;
      die.rotation.set(...DICE_FACE_ORIENTATIONS[value]);
      setGroundedDicePosition(die, ...DICE_SETTLED_XZ[index]);
    }
  }

  applyDiceAnimationFrame(presentation, elapsed) {
    if (presentation.reducedMotion) {
      this.applyFinalDiceOrientation(presentation);
      return elapsed >= DICE_PRESENTATION_TIMING.resultHoldMs;
    }

    const anticipationEnd = DICE_PRESENTATION_TIMING.anticipationMs;
    const rollEnd = anticipationEnd + DICE_PRESENTATION_TIMING.rollMs;
    const settleEnd = rollEnd + DICE_PRESENTATION_TIMING.settleMs;
    if (elapsed >= DICE_CAMERA_RESTORE_AT_MS) this.beginDiceCameraRestore();

    for (const [index, value] of [presentation.die1, presentation.die2].entries()) {
      const die = this.diceModels[index];
      const settled = DICE_SETTLED_XZ[index];
      die.visible = true;
      if (elapsed < anticipationEnd) {
        applyDiceAnticipation(die, settled, index, elapsed / anticipationEnd, value);
      } else if (elapsed < rollEnd) {
        applyDiceRoll(die, settled, index, (elapsed - anticipationEnd) / DICE_PRESENTATION_TIMING.rollMs,
          value, presentation.presentationId);
      } else if (elapsed < settleEnd) {
        applyDiceSettle(die, settled, index, (elapsed - rollEnd) / DICE_PRESENTATION_TIMING.settleMs,
          value, presentation.presentationId);
      } else {
        die.rotation.set(...DICE_FACE_ORIENTATIONS[value]);
        setGroundedDicePosition(die, ...settled);
      }
    }
    return elapsed >= DICE_PRESENTATION_DURATION_MS;
  }

  beginDiceCameraEmphasis() {
    // Presentation camera state is transient; the player's chosen pre-roll view remains canonical.
    const restoreState = this.diceCameraPresentation?.restoreState ?? this.captureCameraState();
    if (!restoreState) return false;
    const relative = this.camera.position.clone().sub(this.cameraTarget).multiplyScalar(0.94);
    const target = this.cameraTarget.clone().lerp(new THREE.Vector3(0, 0.2, 0), 0.4);
    this.diceCameraPresentation = { restoreState, restoreStarted: false };
    return this.transitionCamera({
      position: relative.add(target),
      target,
      fov: this.camera.fov,
      duration: DICE_PRESENTATION_TIMING.cameraEmphasisMs,
      owner: "dice-emphasis",
    });
  }

  beginDiceCameraRestore() {
    const presentation = this.diceCameraPresentation;
    if (!presentation || presentation.restoreStarted) return false;
    presentation.restoreStarted = true;
    return this.transitionCamera({
      ...presentation.restoreState,
      duration: DICE_PRESENTATION_TIMING.cameraRestoreMs,
      owner: "dice-restore",
    });
  }

  interruptDiceCameraPresentation() {
    if (!this.diceCameraPresentation) return false;
    this.diceCameraPresentation = null;
    if (this.cameraTransition?.owner?.startsWith("dice-")) this.cameraTransition = null;
    return true;
  }

  captureCameraState() {
    if (!this.camera) return null;
    return {
      position: this.camera.position.clone(),
      target: this.cameraTarget.clone(),
      fov: this.camera.fov,
    };
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
      const transition = this.cameraTransition;
      const now = Number.isFinite(timestamp) ? timestamp : 0;
      if (transition.startedAt === null) transition.startedAt = now;
      const elapsed = Math.max(0, now - transition.startedAt);
      const progress = Math.min(elapsed / transition.duration, 1);
      this.applyCameraTransitionFrame(transition, progress);
      if (progress >= 1) {
        this.cameraTransition = null;
        if (transition.owner === "dice-restore") this.diceCameraPresentation = null;
      }
      else animationContinues = true;
    }
    if (this.diceAnimation) {
      const now = Number.isFinite(timestamp) ? timestamp : 0;
      if (this.diceAnimation.startedAt === null) this.diceAnimation.startedAt = now;
      const elapsed = Math.max(0, now - this.diceAnimation.startedAt);
      const completed = this.applyDiceAnimationFrame(this.diceAnimation.presentation, elapsed);
      if (completed) {
        this.applyFinalDiceOrientation(this.diceAnimation.presentation);
        this.beginDiceCameraRestore();
        this.diceAnimation = null;
        this.settleDiceCompletion(true);
      } else {
        animationContinues = true;
      }
    }
    if (this.pawnAnimation) {
      const now = Number.isFinite(timestamp) ? timestamp : 0;
      if (this.pawnAnimation.startedAt === null) this.pawnAnimation.startedAt = now;
      const completed = this.applyPawnAnimationFrame(
        this.pawnAnimation,
        Math.max(0, now - this.pawnAnimation.startedAt),
      );
      if (completed) this.finishPawnAnimation(true);
      else animationContinues = true;
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

  applyPawnAnimationFrame(animation, elapsed) {
    const travelDuration = animation.stepDuration * animation.segments.length;
    if (elapsed < travelDuration) {
      const segmentIndex = Math.min(
        Math.floor(elapsed / animation.stepDuration),
        animation.segments.length - 1,
      );
      const segment = animation.segments[segmentIndex];
      const progress = (elapsed - segmentIndex * animation.stepDuration) / animation.stepDuration;
      const eased = progress * progress * (3 - 2 * progress);
      animation.pawn.position.set(
        THREE.MathUtils.lerp(segment.start.x, segment.end.x, eased),
        THREE.MathUtils.lerp(segment.start.y, segment.end.y, eased)
          + Math.sin(Math.PI * progress) * PAWN_MOVEMENT_TIMING.hopHeight,
        THREE.MathUtils.lerp(segment.start.z, segment.end.z, eased),
      );
      animation.pawn.rotation.y = lerpAngle(segment.startYaw, segment.targetYaw, eased);
      return false;
    }

    const arrivalProgress = Math.min(
      (elapsed - travelDuration) / PAWN_MOVEMENT_TIMING.arrivalDurationMs,
      1,
    );
    const anchor = getPawnAnchor(animation.destination, animation.slot);
    animation.pawn.position.set(
      anchor.x,
      anchor.y + Math.sin(Math.PI * arrivalProgress)
        * (1 - arrivalProgress) * PAWN_MOVEMENT_TIMING.arrivalLift,
      anchor.z,
    );
    animation.pawn.rotation.y = animation.segments.at(-1).targetYaw;
    return arrivalProgress >= 1;
  }

  finishPawnAnimation(completed) {
    const animation = this.pawnAnimation;
    if (!animation) return false;
    this.placePawnAt(animation.pawn, animation.destination, animation.slot, false);
    animation.pawn.rotation.y = animation.segments.at(-1).targetYaw;
    this.pawnAnimation = null;
    this.settlePawnCompletion(completed);
    return true;
  }

  settleDiceCompletion(completed) {
    const completion = this.diceCompletion;
    this.diceCompletion = null;
    completion?.resolve(completed);
  }

  settlePawnCompletion(completed) {
    const completion = this.pawnCompletion;
    this.pawnCompletion = null;
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
    this.diceCameraPresentation = null;
    this.cameraTransition = null;
    this.pawnAnimation = null;
    this.pendingDicePresentation = null;
    this.settleDiceCompletion(false);
    this.settlePawnCompletion(false);
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

    // Templates share neutral resources with their visual clones, so dispose every
    // owned graph through one ledger rather than disposing each clone separately.
    disposeObjectGraphs([this.scene, ...this.pawnTemplates.values()]);
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
    this.pawnTemplates.clear();
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

function lerpAngle(start, end, alpha) {
  const delta = Math.atan2(Math.sin(end - start), Math.cos(end - start));
  return start + delta * alpha;
}

function applyDiceAnticipation(die, settled, index, progress, value) {
  const eased = smoothStep(progress);
  const launch = DICE_LAUNCH_XZ[index];
  die.rotation.set(...DICE_FACE_ORIENTATIONS[value]);
  setGroundedDicePosition(die, launch[0], launch[1], eased * 0.7);
}

function applyDiceRoll(die, settled, index, progress, value, presentationId) {
  const launch = DICE_LAUNCH_XZ[index];
  const variant = diceVisualVariant(presentationId, index);
  const travel = smoothStep(progress);
  const lateralArc = Math.sin(Math.PI * progress);
  const impactTexture = Math.abs(Math.sin(Math.PI * 2 * progress)) * (1 - progress);

  const orientation = DICE_FACE_ORIENTATIONS[value];
  const freeSpin = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    orientation[0] + progress * Math.PI * 2 * variant.turns[0],
    orientation[1] + progress * Math.PI * 2 * variant.turns[1],
    orientation[2] + progress * Math.PI * 2 * variant.turns[2],
  ));
  const finalOrientation = quaternionForFace(value);
  const convergence = smoothStep(clamp((progress - 0.72) / 0.28, 0, 1));
  die.quaternion.copy(freeSpin).slerp(finalOrientation, convergence).normalize();
  setGroundedDicePosition(
    die,
    THREE.MathUtils.lerp(launch[0], settled[0], travel) + lateralArc * variant.lateralX,
    THREE.MathUtils.lerp(launch[1], settled[1], travel) + lateralArc * variant.lateralZ,
    (1 - travel) * 0.7 + lateralArc * variant.arcHeight + impactTexture * 0.22,
  );
}

function applyDiceSettle(die, settled, index, progress, value, presentationId) {
  const variant = diceVisualVariant(presentationId, index);
  const bounce = Math.abs(Math.sin(Math.PI * 2 * progress)) * 0.24 * (1 - progress);
  const wobble = new THREE.Quaternion().setFromAxisAngle(
    variant.wobbleAxis,
    Math.sin(Math.PI * progress) * 0.09 * (1 - progress),
  );
  die.quaternion.copy(quaternionForFace(value)).multiply(wobble).normalize();
  setGroundedDicePosition(die, settled[0], settled[1], bounce);
}

/** Captures the scaled authored model once; active frames use an axis projection, not Box3 work. */
function captureDiceLocalBounds(die) {
  die.position.set(0, 0, 0);
  die.rotation.set(0, 0, 0);
  die.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(die);
  die.userData.diceLocalBounds = Object.freeze({
    min: bounds.min.clone(),
    max: bounds.max.clone(),
  });
}

/** Keeps the loaded geometry above the real board surface for every transient root rotation. */
function setGroundedDicePosition(die, x, z, lift = 0) {
  const bounds = die.userData.diceLocalBounds;
  if (!bounds) {
    die.position.set(x, BOARD_SURFACE_Y + DICE_SURFACE_CLEARANCE + Math.max(0, lift), z);
    return;
  }
  const lowestRelativeY = rotatedBoundsMinimumY(bounds, die.quaternion);
  const groundedRootY = BOARD_SURFACE_Y + DICE_SURFACE_CLEARANCE - lowestRelativeY;
  die.position.set(x, groundedRootY + Math.max(0, lift), z);
}

function rotatedBoundsMinimumY(bounds, quaternion) {
  const { x, y, z, w } = quaternion;
  const rowX = 2 * ((x * y) + (z * w));
  const rowY = 1 - (2 * ((x * x) + (z * z)));
  const rowZ = 2 * ((y * z) - (x * w));
  return minimumAxisContribution(rowX, bounds.min.x, bounds.max.x)
    + minimumAxisContribution(rowY, bounds.min.y, bounds.max.y)
    + minimumAxisContribution(rowZ, bounds.min.z, bounds.max.z);
}

function minimumAxisContribution(coefficient, minimum, maximum) {
  return coefficient * (coefficient >= 0 ? minimum : maximum);
}

function diceVisualVariant(presentationId, index) {
  // Stable presentation identity varies only cosmetic motion; face and destination stay authoritative.
  const seed = (presentationId * 17 + index * 11) % 5;
  const direction = index === 0 ? 1 : -1;
  return {
    lateralX: direction * (0.35 + seed * 0.07),
    lateralZ: -direction * (0.28 + ((seed + 2) % 3) * 0.08),
    arcHeight: 2.7 + index * 0.35 + seed * 0.08,
    turns: [
      direction * (3 + (seed % 2)),
      -direction * (2 + ((seed + index) % 3)),
      direction * (3 + ((seed + 1) % 3)),
    ],
    wobbleAxis: new THREE.Vector3(1, 0, direction * 0.65).normalize(),
  };
}

function quaternionForFace(value) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(...DICE_FACE_ORIENTATIONS[value]));
}

function smoothStep(value) {
  const bounded = clamp(value, 0, 1);
  return bounded * bounded * (3 - 2 * bounded);
}

function createPawn(geometry, color, position, fallbackY) {
  const pawn = new THREE.Group();
  const fallback = new THREE.Mesh(geometry, new THREE.MeshPhongMaterial({ color }));
  fallback.position.y = fallbackY;
  fallback.castShadow = true;
  fallback.receiveShadow = true;
  pawn.add(fallback);
  pawn.position.set(...position);
  pawn.userData.primitiveFallback = fallback;
  pawn.userData.stepCounter = 0;
  pawn.userData.caseNumber = 1;
  pawn.userData.money = 1500;
  return pawn;
}

function setShadowParticipation(root, { castShadow, receiveShadow }) {
  root.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = castShadow;
    object.receiveShadow = receiveShadow;
  });
}

function replaceAccentMaterials(material, accents, accentColor) {
  if (Array.isArray(material)) {
    return material.map(entry => replaceAccentMaterials(entry, accents, accentColor));
  }
  if (!material || material.name !== "M_Accent") return material;
  if (!accents.has(material)) {
    const accent = material.clone();
    accent.color.set(accentColor);
    accents.set(material, accent);
  }
  return accents.get(material);
}
