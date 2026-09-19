import API_BASE_URL from "./apiConfig";
import { apiFetch } from "./apiClient";
import { decodeActionResult, decodeThrowResult } from "./transportDecoders";
import { readJsonResponse } from "./transportError";

/**
 * Authoritative command gateway for the live Game runtime. Legacy command
 * wrappers were removed with the rollback Board; lifecycle identity and
 * expected versions now arrive only from the controller.
 */
export const TurnAPI = {
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
