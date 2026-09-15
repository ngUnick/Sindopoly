import assert from "node:assert/strict";
import test from "node:test";
import {
  TRANSPORT_ERROR_CODES,
  normalizeNetworkError,
  readJsonResponse,
} from "./transportError.js";
import {
  clearGameVersion, expectedGameVersion, observeGameVersion, readCommandResponse,
} from "./gameCommandState.js";

for (const [status, code] of [
  [400, "VALIDATION"],
  [401, "UNAUTHENTICATED"],
  [403, "FORBIDDEN"],
  [404, "NOT_FOUND"],
  [500, "SERVER"],
]) {
  test(`${status} normalizes to ${code}`, async () => {
    await assert.rejects(
      readJsonResponse(response(status, { error: "backend detail" })),
      error => error.code === TRANSPORT_ERROR_CODES[code]
        && error.httpStatus === status
        && !error.message.includes("backend detail"),
    );
  });
}

test("ordinary 409 remains a generic conflict", async () => {
  await assert.rejects(
    readJsonResponse(response(409, { error: "conflict" })),
    error => error.code === TRANSPORT_ERROR_CODES.CONFLICT && error.reason == null,
  );
});

test("stale 409 preserves recovery identity and authoritative version", async () => {
  await assert.rejects(
    readJsonResponse(response(409, { reason: "STALE_STATE", stateVersion: 17 })),
    error => error.code === TRANSPORT_ERROR_CODES.STALE_STATE
      && error.reason === "STALE_STATE"
      && error.stateVersion === 17
      && error.retriable === false,
  );
});

test("stale command responses still block commands until snapshot recovery", async () => {
  clearGameVersion(7);
  observeGameVersion(7, 3);

  await assert.rejects(
    readCommandResponse(response(409, { reason: "STALE_STATE", stateVersion: 4 }), 7),
    error => error.code === TRANSPORT_ERROR_CODES.STALE_STATE,
  );
  assert.throws(() => expectedGameVersion(7), /refresh/);
  clearGameVersion(7);
});

test("fetch rejection normalizes to a retriable network error", () => {
  const cause = new TypeError("failed to fetch");
  const error = normalizeNetworkError(cause);

  assert.equal(error.code, TRANSPORT_ERROR_CODES.NETWORK);
  assert.equal(error.httpStatus, null);
  assert.equal(error.retriable, true);
  assert.equal(error.cause, cause);
});

test("malformed 2xx JSON normalizes to invalid payload", async () => {
  await assert.rejects(
    readJsonResponse(textResponse(200, "{broken")),
    error => error.code === TRANSPORT_ERROR_CODES.INVALID_PAYLOAD,
  );
});

test("a decoder rejection from a successful response remains invalid payload", async () => {
  await assert.rejects(
    readJsonResponse(response(200, { value: "bad" }), {
      decoder: () => { throw new TypeError("wrong shape"); },
    }),
    error => error.code === TRANSPORT_ERROR_CODES.INVALID_PAYLOAD,
  );
});

test("legitimate 204 is a successful absence only when allowed", async () => {
  assert.equal(await readJsonResponse({ status: 204, ok: true }, { allowNoContent: true }), null);
  await assert.rejects(
    readJsonResponse({ status: 204, ok: true }),
    error => error.code === TRANSPORT_ERROR_CODES.INVALID_PAYLOAD,
  );
});

function response(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

function textResponse(status, body) {
  return { status, ok: status >= 200 && status < 300, text: async () => body };
}
