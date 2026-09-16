import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  BOARD_ANCHORS,
  BOARD_CALIBRATION,
  BOARD_POSITION_COUNT,
  PAWN_SLOT_COUNT,
  buildForwardRoute,
  getPawnAnchor,
  getSquareAnchor,
  isBoardPosition,
  isPawnSlot,
} from "../features/game/board/boardCalibration.js";

const sourceRoot = new URL("../", import.meta.url);
const [calibrationSource, boardSource] = await Promise.all([
  readFile(new URL("features/game/board/boardCalibration.js", sourceRoot), "utf8"),
  readFile(new URL("pages/Game/Board.jsx", sourceRoot), "utf8"),
]);
const adapterSource = await readFile(new URL("features/game/board/BoardSceneAdapter.js", sourceRoot), "utf8");

test("calibration exposes exactly forty canonical anchors", () => {
  assert.equal(BOARD_POSITION_COUNT, 40);
  assert.equal(BOARD_ANCHORS.length, 40);
});

test("canonical anchor identities cover positions zero through thirty-nine", () => {
  assert.deepEqual(BOARD_ANCHORS.map(anchor => anchor.position), Array.from({ length: 40 }, (_, index) => index));
});

test("every canonical board position resolves", () => {
  for (let position = 0; position < BOARD_POSITION_COUNT; position += 1) {
    assert.equal(getSquareAnchor(position), BOARD_ANCHORS[position]);
  }
});

test("canonical anchors have finite Three.js-space coordinates", () => {
  for (const anchor of BOARD_ANCHORS) {
    assert.ok(Number.isFinite(anchor.x));
    assert.ok(Number.isFinite(anchor.y));
    assert.ok(Number.isFinite(anchor.z));
  }
});

test("canonical anchors stay inside the inspected board footprint", () => {
  const { min, max } = BOARD_CALIBRATION.modelWorldBounds;
  for (const anchor of BOARD_ANCHORS) {
    assert.ok(anchor.x > min.x && anchor.x < max.x);
    assert.ok(anchor.z > min.z && anchor.z < max.z);
  }
});

test("canonical anchors use one consistent pawn-center elevation", () => {
  assert.ok(BOARD_ANCHORS.every(anchor => anchor.y === BOARD_CALIBRATION.pawnElevation));
  assert.ok(BOARD_CALIBRATION.pawnElevation > BOARD_CALIBRATION.modelWorldBounds.max.y);
});

test("canonical anchors are deterministic", () => {
  for (const anchor of BOARD_ANCHORS) assert.equal(getSquareAnchor(anchor.position), anchor);
});

test("canonical anchor collection and records are immutable", () => {
  assert.equal(Object.isFrozen(BOARD_ANCHORS), true);
  assert.ok(BOARD_ANCHORS.every(Object.isFrozen));
  assert.throws(() => { BOARD_ANCHORS[0].x = 999; }, TypeError);
  assert.equal(getSquareAnchor(0).x, BOARD_CALIBRATION.perimeterHalfSpan);
});

test("no two board positions share one base coordinate", () => {
  const coordinates = new Set(BOARD_ANCHORS.map(({ x, y, z }) => `${x}:${y}:${z}`));
  assert.equal(coordinates.size, BOARD_POSITION_COUNT);
});

for (const invalid of [-1, 40, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "5", null, undefined]) {
  test(`invalid board position ${String(invalid)} fails safely`, () => {
    assert.equal(isBoardPosition(invalid), false);
    assert.equal(getSquareAnchor(invalid), null);
  });
}

test("position zero is calibrated to the Start corner", () => {
  assert.deepEqual(getSquareAnchor(0), { position: 0, x: 22.6, y: 0.5, z: -22.059161 });
});

test("position ten is calibrated to the Jail corner", () => {
  assert.deepEqual(getSquareAnchor(10), { position: 10, x: 22.6, y: 0.5, z: 23.140839 });
});

test("position twenty is calibrated to the opposite Start corner", () => {
  assert.deepEqual(getSquareAnchor(20), { position: 20, x: -22.6, y: 0.5, z: 23.140839 });
});

test("position thirty is calibrated to the go-to-jail corner", () => {
  assert.deepEqual(getSquareAnchor(30), { position: 30, x: -22.6, y: 0.5, z: -22.059161 });
});

test("the four corners occupy distinct expected quadrants around the model center", () => {
  const center = BOARD_CALIBRATION.center;
  const quadrants = [0, 10, 20, 30].map(position => {
    const anchor = getSquareAnchor(position);
    return [Math.sign(anchor.x - center.x), Math.sign(anchor.z - center.z)];
  });
  assert.deepEqual(quadrants, [[1, -1], [1, 1], [-1, 1], [-1, -1]]);
});

test("corner spacing remains wider than ordinary tile spacing", () => {
  assert.equal(distanceXZ(getSquareAnchor(0), getSquareAnchor(1)), 6);
  assert.equal(distanceXZ(getSquareAnchor(1), getSquareAnchor(2)), 4.15);
  assert.equal(distanceXZ(getSquareAnchor(9), getSquareAnchor(10)), 6);
});

test("first edge increases along positive depth", () => {
  assertOrdered([1, 5, 9], "z", (left, right) => left < right);
  assertSame([1, 5, 9], "x");
});

test("second edge decreases along horizontal x", () => {
  assertOrdered([11, 15, 19], "x", (left, right) => left > right);
  assertSame([11, 15, 19], "z");
});

test("third edge decreases along depth z", () => {
  assertOrdered([21, 25, 29], "z", (left, right) => left > right);
  assertSame([21, 25, 29], "x");
});

test("fourth edge increases along horizontal x", () => {
  assertOrdered([31, 35, 39], "x", (left, right) => left < right);
  assertSame([31, 35, 39], "z");
});

test("four pawn slots are valid", () => {
  assert.equal(PAWN_SLOT_COUNT, 4);
  assert.deepEqual([0, 1, 2, 3].map(isPawnSlot), [true, true, true, true]);
});

test("four pawn slots produce distinct coordinates", () => {
  const slots = [0, 1, 2, 3].map(slot => getPawnAnchor(5, slot));
  assert.equal(new Set(slots.map(({ x, z }) => `${x}:${z}`)).size, 4);
});

for (const invalid of [-1, 4, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "1", null]) {
  test(`invalid pawn slot ${String(invalid)} fails safely`, () => {
    assert.equal(isPawnSlot(invalid), false);
    assert.equal(getPawnAnchor(5, invalid), null);
  });
}

test("pawn slots reject an invalid board position", () => {
  assert.equal(getPawnAnchor(40, 0), null);
});

test("pawn slot offsets stay bounded around an ordinary square", () => {
  assertSlotsBounded(5);
});

test("pawn slot offsets stay bounded around every corner", () => {
  for (const position of [0, 10, 20, 30]) assertSlotsBounded(position);
});

test("pawn slot records are immutable", () => {
  const pawn = getPawnAnchor(5, 0);
  assert.equal(Object.isFrozen(pawn), true);
  assert.throws(() => { pawn.z = 999; }, TypeError);
});

test("slot layout follows first-edge travel orientation", () => {
  assert.ok(getPawnAnchor(5, 1).z > getPawnAnchor(5, 0).z);
  assert.ok(getPawnAnchor(5, 2).x < getPawnAnchor(5, 0).x);
});

test("slot layout rotates on the second edge", () => {
  assert.ok(getPawnAnchor(15, 1).x < getPawnAnchor(15, 0).x);
  assert.ok(getPawnAnchor(15, 2).z < getPawnAnchor(15, 0).z);
});

test("slot layout rotates on the third edge", () => {
  assert.ok(getPawnAnchor(25, 1).z < getPawnAnchor(25, 0).z);
  assert.ok(getPawnAnchor(25, 2).x > getPawnAnchor(25, 0).x);
});

test("slot layout rotates on the fourth edge", () => {
  assert.ok(getPawnAnchor(35, 1).x > getPawnAnchor(35, 0).x);
  assert.ok(getPawnAnchor(35, 2).z > getPawnAnchor(35, 0).z);
});

for (const [from, to, expected] of [
  [5, 8, [6, 7, 8]],
  [8, 9, [9]],
  [39, 0, [0]],
  [38, 2, [39, 0, 1, 2]],
  [35, 5, [36, 37, 38, 39, 0, 1, 2, 3, 4, 5]],
]) {
  test(`forward visual route ${from} to ${to} is ordered`, () => {
    assert.deepEqual(buildForwardRoute(from, to), expected);
  });
}

test("same-square destination proves no forward movement", () => {
  assert.deepEqual(buildForwardRoute(7, 7), []);
});

test("zero to thirty-nine traverses every intervening forward position", () => {
  const route = buildForwardRoute(0, 39);
  assert.equal(route.length, 39);
  assert.deepEqual(route, Array.from({ length: 39 }, (_, index) => index + 1));
});

for (const [from, to] of [[-1, 2], [5, 40], ["5", 8], [5, Number.NaN]]) {
  test(`invalid route input ${String(from)} to ${String(to)} fails safely`, () => {
    assert.equal(buildForwardRoute(from, to), null);
  });
}

test("forward routes emit only canonical positions", () => {
  for (let from = 0; from < 40; from += 1) {
    for (let to = 0; to < 40; to += 1) {
      const route = buildForwardRoute(from, to);
      assert.ok(route.every(isBoardPosition));
    }
  }
});

test("forward routes are bounded and cannot loop indefinitely", () => {
  for (let from = 0; from < 40; from += 1) {
    for (let to = 0; to < 40; to += 1) {
      assert.ok(buildForwardRoute(from, to).length <= 39);
    }
  }
});

test("forward route results are immutable", () => {
  const route = buildForwardRoute(38, 2);
  assert.equal(Object.isFrozen(route), true);
  assert.throws(() => route.push(3), TypeError);
});

test("authoritative snapshot position maps directly to one pawn anchor", () => {
  assert.deepEqual(getPawnAnchor(17, 2), {
    position: 17,
    slotIndex: 2,
    x: -7.75,
    y: 0.5,
    z: 22.590839,
  });
});

test("recovery snapping requires no previous position or route history", () => {
  assert.equal(getPawnAnchor.length, 2);
  assert.equal(getPawnAnchor(17, 2).position, 17);
});

test("a confirmed Jail destination maps directly without inferring movement mode", () => {
  const anchor = getPawnAnchor(10, 0);
  assert.equal(anchor.position, 10);
  assert.equal(anchor.slotIndex, 0);
});

test("a confirmed transport destination maps directly without deriving a path", () => {
  const anchor = getPawnAnchor(20, 1);
  assert.equal(anchor.position, 20);
  assert.equal(anchor.slotIndex, 1);
});

test("calibration source is framework, scene-library, transport, controller, and CSS independent", () => {
  assert.doesNotMatch(calibrationSource, /from\s+["'][^"']+["']|require\s*\(/);
  assert.doesNotMatch(calibrationSource, /React|Three|GamePlayAPI|GameAPI|TurnAPI|STOMP|sockjs|reducer|controller|\.css/i);
});

test("calibration source contains no gameplay outcome calculations", () => {
  assert.doesNotMatch(calibrationSource, /dice|rent|reward|winner|afford|card effect|jail time/i);
});

test("model transform and inspected bounds remain explicit calibration evidence", () => {
  assert.equal(BOARD_CALIBRATION.modelScale, 0.035);
  assert.equal(BOARD_CALIBRATION.modelRotationYRadians, Math.PI / 2);
  assert.deepEqual(BOARD_CALIBRATION.modelWorldBounds.min, { x: -26.25, y: -0.131355, z: -25.709161 });
  assert.deepEqual(BOARD_CALIBRATION.modelWorldBounds.max, { x: 26.25, y: 0.043661, z: 26.790839 });
});

test("production Board does not own calibration while the scene adapter consumes route geometry only", () => {
  assert.doesNotMatch(boardSource, /boardCalibration|BOARD_ANCHORS|buildForwardRoute|getPawnAnchor/);
  assert.match(adapterSource, /buildForwardRoute/);
  assert.doesNotMatch(adapterSource, /getPawnAnchor|BOARD_ANCHORS/);
});

function distanceXZ(left, right) {
  return Number(Math.hypot(right.x - left.x, right.z - left.z).toFixed(6));
}

function assertOrdered(positions, coordinate, comparison) {
  const values = positions.map(position => getSquareAnchor(position)[coordinate]);
  assert.ok(comparison(values[0], values[1]));
  assert.ok(comparison(values[1], values[2]));
}

function assertSame(positions, coordinate) {
  const values = positions.map(position => getSquareAnchor(position)[coordinate]);
  assert.equal(new Set(values).size, 1);
}

function assertSlotsBounded(position) {
  const square = getSquareAnchor(position);
  for (let slot = 0; slot < PAWN_SLOT_COUNT; slot += 1) {
    assert.ok(distanceXZ(square, getPawnAnchor(position, slot)) < 0.8);
  }
}
