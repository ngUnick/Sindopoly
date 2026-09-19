export const BOARD_POSITION_COUNT = 40;
export const PAWN_SLOT_COUNT = 4;

const WORLD_CENTER = Object.freeze({ x: 0, z: 0.540839 });
const PERIMETER_HALF_SPAN = 22.6;
const CORNER_TO_TILE_STEP = 6;
const TILE_TO_TILE_STEP = 4.15;
const PAWN_ELEVATION = 0.5;
const PAWN_SLOT_OFFSET = 0.55;

/**
 * Source-calibrated geometry after the board model applies scale 0.035 and Y rotation PI/2.
 * The perimeter dimensions close exactly: 6 + (8 * 4.15) + 6 = 45.2.
 */
export const BOARD_CALIBRATION = Object.freeze({
  worldAxes: Object.freeze({ horizontal: "x", vertical: "y", depth: "z" }),
  worldOrigin: Object.freeze({ x: 0, y: 0, z: 0 }),
  modelScale: 0.035,
  modelRotationYRadians: Math.PI / 2,
  modelWorldBounds: Object.freeze({
    min: Object.freeze({ x: -26.25, y: -0.131355, z: -25.709161 }),
    max: Object.freeze({ x: 26.25, y: 0.043661, z: 26.790839 }),
  }),
  center: WORLD_CENTER,
  perimeterHalfSpan: PERIMETER_HALF_SPAN,
  cornerToTileStep: CORNER_TO_TILE_STEP,
  tileToTileStep: TILE_TO_TILE_STEP,
  pawnElevation: PAWN_ELEVATION,
  pawnSlotOffset: PAWN_SLOT_OFFSET,
});

const EDGE_BASIS = Object.freeze([
  Object.freeze({ tangentX: 0, tangentZ: 1, inwardX: -1, inwardZ: 0 }),
  Object.freeze({ tangentX: -1, tangentZ: 0, inwardX: 0, inwardZ: -1 }),
  Object.freeze({ tangentX: 0, tangentZ: -1, inwardX: 1, inwardZ: 0 }),
  Object.freeze({ tangentX: 1, tangentZ: 0, inwardX: 0, inwardZ: 1 }),
]);

const SLOT_LAYOUT = Object.freeze([
  Object.freeze({ tangent: -PAWN_SLOT_OFFSET, inward: -PAWN_SLOT_OFFSET }),
  Object.freeze({ tangent: PAWN_SLOT_OFFSET, inward: -PAWN_SLOT_OFFSET }),
  Object.freeze({ tangent: -PAWN_SLOT_OFFSET, inward: PAWN_SLOT_OFFSET }),
  Object.freeze({ tangent: PAWN_SLOT_OFFSET, inward: PAWN_SLOT_OFFSET }),
]);

export const BOARD_ANCHORS = Object.freeze(
  Array.from({ length: BOARD_POSITION_COUNT }, (_, position) => buildSquareAnchor(position)),
);

export function isBoardPosition(position) {
  return Number.isSafeInteger(position)
    && position >= 0
    && position < BOARD_POSITION_COUNT;
}

export function isPawnSlot(slotIndex) {
  return Number.isSafeInteger(slotIndex)
    && slotIndex >= 0
    && slotIndex < PAWN_SLOT_COUNT;
}

/** Returns one immutable canonical anchor, or null for untrusted invalid input. */
export function getSquareAnchor(position) {
  return isBoardPosition(position) ? BOARD_ANCHORS[position] : null;
}

/**
 * Applies a caller-selected slot in the local direction of travel for the square.
 * Stable player-to-slot assignment intentionally belongs to future orchestration.
 */
export function getPawnAnchor(position, slotIndex) {
  if (!isBoardPosition(position) || !isPawnSlot(slotIndex)) return null;
  const square = BOARD_ANCHORS[position];
  const basis = EDGE_BASIS[Math.floor(position / 10)];
  const slot = SLOT_LAYOUT[slotIndex];
  return Object.freeze({
    position,
    slotIndex,
    x: roundCoordinate(square.x + (basis.tangentX * slot.tangent) + (basis.inwardX * slot.inward)),
    y: square.y,
    z: roundCoordinate(square.z + (basis.tangentZ * slot.tangent) + (basis.inwardZ * slot.inward)),
  });
}

/**
 * Describes forward visual traversal between two already-confirmed positions.
 * It excludes the starting position and treats equal positions as no proven movement.
 */
export function buildForwardRoute(fromPosition, toPosition) {
  if (!isBoardPosition(fromPosition) || !isBoardPosition(toPosition)) return null;
  if (fromPosition === toPosition) return Object.freeze([]);

  const positions = [];
  let cursor = fromPosition;
  while (positions.length < BOARD_POSITION_COUNT - 1) {
    cursor = (cursor + 1) % BOARD_POSITION_COUNT;
    positions.push(cursor);
    if (cursor === toPosition) return Object.freeze(positions);
  }
  return null;
}

function buildSquareAnchor(position) {
  const edge = Math.floor(position / 10);
  const edgePosition = position % 10;
  const edgeDistance = edgePosition === 0
    ? 0
    : CORNER_TO_TILE_STEP + ((edgePosition - 1) * TILE_TO_TILE_STEP);
  const minX = WORLD_CENTER.x - PERIMETER_HALF_SPAN;
  const maxX = WORLD_CENTER.x + PERIMETER_HALF_SPAN;
  const minZ = WORLD_CENTER.z - PERIMETER_HALF_SPAN;
  const maxZ = WORLD_CENTER.z + PERIMETER_HALF_SPAN;

  if (edge === 0) return anchor(position, maxX, minZ + edgeDistance);
  if (edge === 1) return anchor(position, maxX - edgeDistance, maxZ);
  if (edge === 2) return anchor(position, minX, maxZ - edgeDistance);
  return anchor(position, minX + edgeDistance, minZ);
}

function anchor(position, x, z) {
  return Object.freeze({
    position,
    x: roundCoordinate(x),
    y: PAWN_ELEVATION,
    z: roundCoordinate(z),
  });
}

function roundCoordinate(value) {
  return Number(value.toFixed(6));
}
