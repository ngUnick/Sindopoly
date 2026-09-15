export const TRANSPORT_ERROR_CODES = Object.freeze({
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION: "VALIDATION",
  STALE_STATE: "STALE_STATE",
  CONFLICT: "CONFLICT",
  NETWORK: "NETWORK",
  SERVER: "SERVER",
  INVALID_PAYLOAD: "INVALID_PAYLOAD",
  UNKNOWN: "UNKNOWN",
});

const MESSAGES = Object.freeze({
  [TRANSPORT_ERROR_CODES.UNAUTHENTICATED]: "Authentication required",
  [TRANSPORT_ERROR_CODES.FORBIDDEN]: "Request forbidden",
  [TRANSPORT_ERROR_CODES.NOT_FOUND]: "Resource not found",
  [TRANSPORT_ERROR_CODES.VALIDATION]: "Request validation failed",
  [TRANSPORT_ERROR_CODES.STALE_STATE]: "Game state is stale",
  [TRANSPORT_ERROR_CODES.CONFLICT]: "Request conflict",
  [TRANSPORT_ERROR_CODES.NETWORK]: "Network request failed",
  [TRANSPORT_ERROR_CODES.SERVER]: "Server request failed",
  [TRANSPORT_ERROR_CODES.INVALID_PAYLOAD]: "Invalid transport payload",
  [TRANSPORT_ERROR_CODES.UNKNOWN]: "Transport request failed",
});

/** Stable internal transport failure. Presentation layers must map code to copy. */
export class TransportError extends Error {
  constructor({ code, httpStatus = null, reason = null, stateVersion = null,
    retriable = false, cause = null, diagnostic = null }) {
    super(MESSAGES[code] ?? MESSAGES.UNKNOWN);
    this.name = "TransportError";
    this.code = code ?? TRANSPORT_ERROR_CODES.UNKNOWN;
    this.httpStatus = httpStatus;
    // Temporary compatibility for existing session flow checks.
    this.status = httpStatus;
    this.reason = typeof reason === "string" ? reason : null;
    this.stateVersion = isVersion(stateVersion) ? stateVersion : null;
    this.retriable = Boolean(retriable);
    this.cause = cause;
    this.diagnostic = diagnostic == null ? null : Object.freeze({ ...diagnostic });
  }
}

export function invalidPayloadError(path, cause = null) {
  return new TransportError({
    code: TRANSPORT_ERROR_CODES.INVALID_PAYLOAD,
    cause,
    diagnostic: path ? { path } : null,
  });
}

export function normalizeNetworkError(cause) {
  if (cause instanceof TransportError) return cause;
  return new TransportError({
    code: TRANSPORT_ERROR_CODES.NETWORK,
    retriable: cause?.name !== "AbortError",
    cause,
    diagnostic: cause?.name ? { causeType: cause.name } : null,
  });
}

/** Reads a response body once and applies a pure decoder after HTTP normalization. */
export async function readJsonResponse(response, {
  allowNoContent = false,
  decoder = value => value,
} = {}) {
  if (!response || typeof response !== "object") throw invalidPayloadError("response");
  if (response.status === 204) {
    if (response.ok && allowNoContent) return null;
    if (response.ok) throw invalidPayloadError("response.body");
  }

  const bodyResult = await readBody(response);
  if (!response.ok) {
    throw errorFromHttp(response.status, bodyResult.hasBody ? bodyResult.value : null);
  }
  if (bodyResult.error || !bodyResult.hasBody) {
    throw invalidPayloadError("response.body", bodyResult.error);
  }

  try {
    return decoder(bodyResult.value);
  } catch (error) {
    if (error instanceof TransportError) throw error;
    throw invalidPayloadError("response.body", error);
  }
}

export async function requireSuccessfulResponse(response) {
  if (response?.ok) return;
  const bodyResult = await readBody(response);
  throw errorFromHttp(response?.status, bodyResult.hasBody ? bodyResult.value : null);
}

function errorFromHttp(status, body) {
  const reason = typeof body?.reason === "string" ? body.reason : null;
  const stale = status === 409 && ["STALE_STATE", "STALE_VERSION"].includes(reason);
  let code = TRANSPORT_ERROR_CODES.UNKNOWN;
  if (stale) code = TRANSPORT_ERROR_CODES.STALE_STATE;
  else if (status === 401) code = TRANSPORT_ERROR_CODES.UNAUTHENTICATED;
  else if (status === 403) code = TRANSPORT_ERROR_CODES.FORBIDDEN;
  else if (status === 404) code = TRANSPORT_ERROR_CODES.NOT_FOUND;
  else if ([400, 422].includes(status)) code = TRANSPORT_ERROR_CODES.VALIDATION;
  else if (status === 409) code = TRANSPORT_ERROR_CODES.CONFLICT;
  else if (Number.isInteger(status) && status >= 500) code = TRANSPORT_ERROR_CODES.SERVER;

  return new TransportError({
    code,
    httpStatus: Number.isInteger(status) ? status : null,
    reason,
    stateVersion: body?.stateVersion,
    retriable: code === TRANSPORT_ERROR_CODES.SERVER,
    diagnostic: { bodyPresent: body != null },
  });
}

async function readBody(response) {
  try {
    if (typeof response.text === "function") {
      const text = await response.text();
      if (typeof text !== "string" || text.trim() === "") return { hasBody: false };
      return { hasBody: true, value: JSON.parse(text) };
    }
    if (typeof response.json === "function") {
      const value = await response.json();
      return value === undefined ? { hasBody: false } : { hasBody: true, value };
    }
    return { hasBody: false };
  } catch (error) {
    return { hasBody: false, error };
  }
}

function isVersion(value) {
  return Number.isSafeInteger(value) && value >= 0;
}
