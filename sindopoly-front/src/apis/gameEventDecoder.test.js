import assert from "node:assert/strict";
import test from "node:test";
import { decodeGameEvent, decodeGameEventBody } from "./gameEventDecoder.js";
import { TRANSPORT_ERROR_CODES } from "./transportError.js";
import {
  cardEvent, rentEvent, taxEvent, turnTimeoutEvent, turnUpdatedEvent,
} from "../test-fixtures/gameRealtimeFixtures.js";

test("decodes the current TURN_UPDATED envelope and detail variants", () => {
  assert.deepEqual(decodeGameEvent(turnUpdatedEvent, 101), turnUpdatedEvent);
});

test("decodes current card, rent, tax, and timeout events", () => {
  for (const fixture of [cardEvent, rentEvent, taxEvent, turnTimeoutEvent]) {
    assert.deepEqual(decodeGameEvent(fixture, 101), fixture);
  }
});

test("decodes the remaining current property, money, and jail detail variants", () => {
  const event = {
    ...turnUpdatedEvent,
    payload: {
      ...turnUpdatedEvent.payload,
      reason: "ACTION_RESOLVED",
      details: [
        { type: "PROPERTY_AVAILABLE", squareId: 6, amount: 100 },
        { type: "PROPERTY_PURCHASED", squareId: 6, amount: 100 },
        { type: "PROPERTY_DECLINED", squareId: 6 },
        { type: "MONEY_RECEIVED", amount: 200 },
        { type: "PLAYER_JAILED", squareId: 10 },
        { type: "PLAYER_RELEASED", amount: 50 },
        { type: "JAIL_EXIT_AVAILABLE", amount: 50 },
      ],
    },
  };

  assert.deepEqual(decodeGameEvent(event, 101), event);
});

test("canonicalizes a numeric expected game ID without coercing payload IDs", () => {
  assert.equal(decodeGameEvent(turnUpdatedEvent, "101").gameId, 101);
  assertInvalid(() => decodeGameEvent({ ...turnUpdatedEvent, gameId: "101" }, 101));
});

test("retains an unknown top-level type and reason as unsupported recovery data", () => {
  const decoded = decodeGameEvent({
    ...turnUpdatedEvent,
    eventType: "FUTURE_EVENT",
    payload: { ...turnUpdatedEvent.payload, reason: "FUTURE_REASON" },
  }, 101);

  assert.equal(decoded.eventType, "FUTURE_EVENT");
  assert.equal(decoded.payload.reason, "FUTURE_REASON");
  assert.deepEqual(decoded.unsupported, {
    eventType: "FUTURE_EVENT", reason: "FUTURE_REASON", detailTypes: [],
  });
});

test("retains an unknown detail as a bounded unsupported marker", () => {
  const decoded = decodeGameEvent({
    ...turnUpdatedEvent,
    payload: {
      ...turnUpdatedEvent.payload,
      details: [...turnUpdatedEvent.payload.details, { type: "FUTURE_DETAIL", secret: "discarded" }],
    },
  }, 101);

  assert.deepEqual(decoded.payload.details.at(-1), { type: "FUTURE_DETAIL", unsupported: true });
  assert.deepEqual(decoded.unsupported.detailTypes, ["FUTURE_DETAIL"]);
  assert.equal("secret" in decoded.payload.details.at(-1), false);
});

test("rejects malformed known event details", () => {
  const malformed = structuredClone(rentEvent);
  malformed.payload.details.find(detail => detail.type === "RENT_PAID").amount = "100";

  assertInvalid(() => decodeGameEvent(malformed, 101));
});

test("rejects invalid JSON bodies with a normalized invalid-payload error", () => {
  assertInvalid(() => decodeGameEventBody("not-json", 101));
});

test("rejects cross-game and unbounded envelopes", () => {
  assertInvalid(() => decodeGameEvent(turnUpdatedEvent, 102));
  assertInvalid(() => decodeGameEvent({
    ...turnUpdatedEvent,
    payload: { ...turnUpdatedEvent.payload, details: Array(13).fill({ type: "DICE_ROLLED", dice: 6 }) },
  }, 101));
});

function assertInvalid(operation) {
  assert.throws(operation, error => error.code === TRANSPORT_ERROR_CODES.INVALID_PAYLOAD);
}
