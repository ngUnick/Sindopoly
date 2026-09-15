import API_BASE_URL from "./apiConfig";
import {
  invalidPayloadError, normalizeNetworkError, readJsonResponse, requireSuccessfulResponse,
} from "./transportError";

let csrfToken;
let csrfHeaderName = "X-XSRF-TOKEN";

function resolveUrl(input) {
  return input.startsWith("http://") || input.startsWith("https://")
    ? input
    : `${API_BASE_URL}${input}`;
}

async function refreshCsrfToken() {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/session/csrf`, { credentials: "include" });
  } catch (error) {
    throw normalizeNetworkError(error);
  }
  await requireSuccessfulResponse(response);
  const csrf = await readJsonResponse(response);
  if (typeof csrf?.token !== "string" || typeof csrf?.headerName !== "string") {
    throw invalidPayloadError("csrf");
  }
  csrfToken = csrf.token;
  csrfHeaderName = csrf.headerName;
}

export async function apiFetch(input, options = {}) {
  const { csrf = true, ...requestOptions } = options;
  const method = (requestOptions.method || "GET").toUpperCase();
  const headers = new Headers(requestOptions.headers || {});

  try {
    if (csrf && !["GET", "HEAD", "OPTIONS", "TRACE"].includes(method)) {
      if (!csrfToken) {
        await refreshCsrfToken();
      }
      headers.set(csrfHeaderName, csrfToken);
    }

    return await fetch(resolveUrl(input), {
      ...requestOptions,
      method,
      headers,
      credentials: "include",
    });
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}

export function clearCsrfToken() {
  csrfToken = undefined;
}
