import API_BASE_URL from "./apiConfig.jsx";
import { apiFetch } from "./apiClient.jsx";
import { decodeBoardMetadata } from "./transportDecoders.js";
import { readJsonResponse } from "./transportError.js";

export const BoardAPI = Object.freeze({
  getMetadata: async () => {
    const response = await apiFetch(`${API_BASE_URL}/api/board/squares`);
    return readJsonResponse(response, { decoder: decodeBoardMetadata });
  },
});
