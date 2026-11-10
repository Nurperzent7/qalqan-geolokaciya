/** Browser fetch: Bearer app token + CSRF header on mutations. */

const TOKEN_KEY = "qalqan_app_token";

const CSRF_HEADERS = {
  "X-Requested-With": "CursorApp",
} as const;

export function getAppToken(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(TOKEN_KEY) || "";
}

export function setAppToken(token: string) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearAppToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): HeadersInit {
  const token = getAppToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiGet(path: string): Promise<Response> {
  return fetch(path, {
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      ...authHeaders(),
    },
  });
}

export async function apiMutate(
  path: string,
  init: { method: "POST" | "PATCH" | "PUT" | "DELETE"; body?: unknown },
): Promise<Response> {
  return fetch(path, {
    method: init.method,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...CSRF_HEADERS,
      ...authHeaders(),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}
