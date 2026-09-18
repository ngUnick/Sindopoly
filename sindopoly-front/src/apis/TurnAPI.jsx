import API_BASE_URL from "./apiConfig";
import { apiFetch } from "./apiClient";
import { commandHeaders, readCommandResponse } from "./gameCommandState";
import { decodeActionResult, decodeThrowResult } from "./transportDecoders";
import { readJsonResponse } from "./transportError";

/**
 * Low-level wrappers around your two turn endpoints:
 *  • POST /api/turn/:gameId/:playerId/throw
 *  • POST /api/turn/:gameId/:playerId/action
 */
export const TurnAPI = {
  /** STEP 1: roll dice & peek → POST /throw */
  throwDice: async (gameId, playerId) => {
    const res = await apiFetch(
      `${API_BASE_URL}/api/turn/${gameId}/${playerId}/throw`,
      { method: "POST", headers: commandHeaders(gameId) }
    );
    // body should be your ThrowResultDto:
    // { dice, newPosition, passedGo, squareType, data }
    return await readCommandResponse(res, gameId, decodeThrowResult);
  },

  /** STEP 2: apply buy/ok → POST /action */
  doAction: async (gameId, playerId, yes) => {
    const payload = { gameId, playerId, yes };
    const res = await apiFetch(
      `${API_BASE_URL}/api/turn/${gameId}/${playerId}/action`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...commandHeaders(gameId) },
        body: JSON.stringify(payload),
      }
    );
    // body should be your ActionResultDto:
    // { newBalance, acquiredProperties, nextPlayerId }
    return await readCommandResponse(res, gameId, decodeActionResult);
  },

  /** Decline the server-owned purchase or jail-payment option. */
  pass: async (gameId, playerId) => {
    const res = await apiFetch(
      `${API_BASE_URL}/api/turn/${gameId}/${playerId}/pass`,
      { method: "POST", headers: commandHeaders(gameId) }
    );
    return await readCommandResponse(res, gameId, decodeActionResult);
  },

  /** FE-REVAMP-021 command path: lifecycle identity comes from the live controller. */
  throwDiceAuthoritative: async (gameId, playerId, command) => {
    const res = await apiFetch(
      `${API_BASE_URL}/api/turn/${gameId}/${playerId}/throw`,
      { method: "POST", headers: authoritativeCommandHeaders(command) },
    );
    return readJsonResponse(res, { decoder: decodeThrowResult });
  },

  resolveActionAuthoritative: async (gameId, playerId, accept, command) => {
    const res = await apiFetch(
      `${API_BASE_URL}/api/turn/${gameId}/${playerId}/action`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authoritativeCommandHeaders(command) },
        body: JSON.stringify({ gameId, playerId, yes: accept === true }),
      },
    );
    return readJsonResponse(res, { decoder: decodeActionResult });
  },

  passAuthoritative: async (gameId, playerId, command) => {
    const res = await apiFetch(
      `${API_BASE_URL}/api/turn/${gameId}/${playerId}/pass`,
      { method: "POST", headers: authoritativeCommandHeaders(command) },
    );
    return readJsonResponse(res, { decoder: decodeActionResult });
  },
};

export function authoritativeCommandHeaders({ commandId, expectedVersion } = {}) {
  if (typeof commandId !== "string" || commandId.trim().length === 0 || commandId.length > 128
      || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
    throw new TypeError("A bounded command ID and accepted expected version are required");
  }
  return {
    "X-Sindopoly-Command-Id": commandId,
    "X-Sindopoly-Expected-Version": String(expectedVersion),
  };
}
