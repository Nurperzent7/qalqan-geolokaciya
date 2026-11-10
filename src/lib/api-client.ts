/** Browser fetch helper: same-origin credentials + CSRF header for mutations. */

const CSRF_HEADERS = {
  "X-Requested-With": "CursorApp",
} as const;

export async function apiGet(path: string): Promise<Response> {
  return fetch(path, {
    cache: "no-store",
    credentials: "include",
  });
}

export async function apiMutate(
  path: string,
  init: { method: "POST" | "PATCH" | "PUT" | "DELETE"; body?: unknown },
): Promise<Response> {
  return fetch(path, {
    method: init.method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...CSRF_HEADERS,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}
