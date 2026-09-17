import assert from "node:assert/strict";
import test from "node:test";
import { decodeBoardMetadata } from "./transportDecoders.js";
import {
  buildBoardMetadataIndex,
  getSquareMetadata,
} from "../features/game/board/boardMetadata.js";
import {
  BOARD_POSITION_COUNT,
  getSquareAnchor,
} from "../features/game/board/boardCalibration.js";
import { createBoardMetadataPayload } from "../test-fixtures/boardMetadataFixtures.js";

test("valid full board decodes as forty ordered immutable positions", () => {
  const raw = createBoardMetadataPayload();
  const before = structuredClone(raw);
  const decoded = decodeBoardMetadata(raw);

  assert.equal(decoded.length, 40);
  assert.deepEqual(decoded.map(square => square.position), Array.from({ length: 40 }, (_, i) => i));
  assert.equal(decoded[0].name, "ΑΦΕΤΗΡΙΑ");
  assert.equal(decoded[10].type, "JAIL");
  assert.equal(decoded[20].type, "PARKING");
  assert.equal(decoded[30].type, "GOJAIL");
  assert.equal(decoded[39].name, "ΗΛΕΚΤΡΟΝΙΚΗΣ");
  assert.deepEqual(raw, before);
  assert.notEqual(decoded, raw);
  assert.equal(Object.isFrozen(decoded), true);
  assert.equal(Object.isFrozen(decoded[1].property), true);
});

test("decoder rejects missing, duplicate, unordered, and invalid positions", () => {
  const missing = createBoardMetadataPayload();
  missing.pop();
  assertInvalid(() => decodeBoardMetadata(missing));

  const duplicate = createBoardMetadataPayload();
  duplicate[39].position = 38;
  assertInvalid(() => decodeBoardMetadata(duplicate));

  for (const position of [-1, 40, "1", 1.5]) {
    const malformed = createBoardMetadataPayload();
    malformed[1].position = position;
    assertInvalid(() => decodeBoardMetadata(malformed));
  }
});

test("decoder rejects missing names and unknown types", () => {
  for (const name of [undefined, null, "", " ", " padded "]) {
    const malformed = createBoardMetadataPayload();
    malformed[1].name = name;
    assertInvalid(() => decodeBoardMetadata(malformed));
  }
  const unknown = createBoardMetadataPayload();
  unknown[1].type = "MAGENTA";
  assertInvalid(() => decodeBoardMetadata(unknown));
});

test("decoder validates property metadata and special-square nullability", () => {
  const valid = decodeBoardMetadata(createBoardMetadataPayload());
  assert.equal(valid[1].property.group, "BROWN");
  assert.equal(valid[12].property.baseRent, null);
  assert.equal(valid[0].property, null);

  for (const property of [null, {}, { purchasePrice: "101", baseRent: 2, group: "BROWN" }]) {
    const malformed = createBoardMetadataPayload();
    malformed[1].property = property;
    assertInvalid(() => decodeBoardMetadata(malformed));
  }
  const mismatchedGroup = createBoardMetadataPayload();
  mismatchedGroup[1].property.group = "BLUE";
  assertInvalid(() => decodeBoardMetadata(mismatchedGroup));

  const specialWithProperty = createBoardMetadataPayload();
  specialWithProperty[0].property = { purchasePrice: 1, baseRent: 1, group: "BROWN" };
  assertInvalid(() => decodeBoardMetadata(specialWithProperty));
});

test("decoder tolerates additive fields without promoting them", () => {
  const raw = createBoardMetadataPayload();
  raw[1].futureField = { ignored: true };
  raw[1].property.futurePropertyField = true;

  const decoded = decodeBoardMetadata(raw);

  assert.equal("futureField" in decoded[1], false);
  assert.equal("futurePropertyField" in decoded[1].property, false);
});

test("metadata index provides immutable constant-time position lookup", () => {
  const index = buildBoardMetadataIndex(decodeBoardMetadata(createBoardMetadataPayload()));

  assert.ok(index);
  for (const position of [0, 10, 20, 30, 39]) {
    assert.equal(getSquareMetadata(index, position).position, position);
  }
  for (const invalid of [-1, 40, "1", 1.5, null, undefined]) {
    assert.equal(getSquareMetadata(index, invalid), null);
  }
  assert.deepEqual(index.ordered.map(square => square.position), Array.from({ length: 40 }, (_, i) => i));
  assert.equal(index.byPosition, index.ordered);
  assert.equal(Object.isFrozen(index), true);
  assert.equal(Object.isFrozen(index.ordered), true);
  assert.equal(Object.isFrozen(index.ordered[1]), true);
});

test("metadata positions remain one-for-one compatible with boardCalibration", () => {
  const index = buildBoardMetadataIndex(decodeBoardMetadata(createBoardMetadataPayload()));

  assert.equal(BOARD_POSITION_COUNT, 40);
  for (let position = 0; position < BOARD_POSITION_COUNT; position += 1) {
    assert.equal(getSquareMetadata(index, position).position, getSquareAnchor(position).position);
  }
});

function assertInvalid(action) {
  assert.throws(action, error => error?.code === "INVALID_PAYLOAD");
}
