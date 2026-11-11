/** Browser / Capacitor fetch: Bearer app token + CSRF header on mutations. */

const TOKEN_KEY = "qalqan_app_token";

const CSRF_HEADERS = {
  "X-Requested-With": "CursorApp",
} as const;

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  // localStorage so Capacitor keeps the session when the app is backgrounded.
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getAppToken(): string {
  return storage()?.getItem(TOKEN_KEY) || "";
}

export function setAppToken(token: string) {
  storage()?.setItem(TOKEN_KEY, token);
}

export function clearAppToken() {
  storage()?.removeItem(TOKEN_KEY);
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
