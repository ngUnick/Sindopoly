import API_BASE_URL from "./apiConfig";

let csrfToken;
let csrfHeaderName = "X-XSRF-TOKEN";

function resolveUrl(input) {
  return input.startsWith("http://") || input.startsWith("https://")
    ? input
    : `${API_BASE_URL}${input}`;
}

async function refreshCsrfToken() {
  const response = await fetch(`${API_BASE_URL}/api/session/csrf`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Authenticated session required");
  }
  const csrf = await response.json();
  csrfToken = csrf.token;
  csrfHeaderName = csrf.headerName;
}

export async function apiFetch(input, options = {}) {
  const { csrf = true, ...requestOptions } = options;
  const method = (requestOptions.method || "GET").toUpperCase();
  const headers = new Headers(requestOptions.headers || {});

  if (csrf && !["GET", "HEAD", "OPTIONS", "TRACE"].includes(method)) {
    if (!csrfToken) {
      await refreshCsrfToken();
    }
    headers.set(csrfHeaderName, csrfToken);
  }

  return fetch(resolveUrl(input), {
    ...requestOptions,
    method,
    headers,
    credentials: "include",
  });
}

export function clearCsrfToken() {
  csrfToken = undefined;
}
