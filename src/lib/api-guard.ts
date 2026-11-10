import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import {
  getIdentity,
  requireTeamRole,
  type VerifiedIdentity,
} from "../../cursor/identity";

const CSRF_HEADER = "x-requested-with";
const CSRF_VALUE = "CursorApp";
const MAX_POINTS_PER_BATCH = 200;
const MAX_POINTS_IN_STORE = 20_000;
/** Local-only unlock when APP_ACCESS_TOKEN is not set on this VM. */
const LOCAL_DEV_TOKEN = "local-dev";

export { MAX_POINTS_PER_BATCH, MAX_POINTS_IN_STORE };

export type AccessPrincipal = {
  email: string;
  name: string;
  simulated: boolean;
  stage: "production" | "preview";
  canManage: boolean;
  source: "token" | "cursor";
};

function isDeployedHost(): boolean {
  return Boolean(process.env.CURSOR_APP_ID || process.env.VERCEL);
}

function readBearer(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const t = auth.slice(7).trim();
    return t || null;
  }
  const header = req.headers.get("x-app-token")?.trim();
  return header || null;
}

function tokensEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

function fromCursor(identity: VerifiedIdentity): AccessPrincipal {
  let canManage = identity.appVisibility === "private";
  if (identity.appVisibility === "team") {
    const narrowed = requireTeamRole(identity, ["admin"]);
    canManage = !(narrowed instanceof Response);
  }
  return {
    email: identity.email,
    name: identity.name || identity.email || "Cursor user",
    simulated: identity.simulated,
    stage: identity.stage,
    canManage,
    source: "cursor",
  };
}

function fromToken(simulated: boolean): AccessPrincipal {
  return {
    email: simulated ? "local-dev@localhost" : "app-token",
    name: simulated ? "Local Dev" : "App access",
    simulated,
    stage: "production",
    canManage: true,
    source: "token",
  };
}

export async function requireViewer(
  req: Request,
): Promise<AccessPrincipal | NextResponse> {
  const presented = readBearer(req);
  const expected = process.env.APP_ACCESS_TOKEN?.trim();

  if (expected && presented && tokensEqual(presented, expected)) {
    return fromToken(false);
  }

  // Local VM fallback — never active on published host
  if (!expected && !isDeployedHost() && presented === LOCAL_DEV_TOKEN) {
    return fromToken(true);
  }

  const identity = await getIdentity(req);
  if (identity.verified) {
    return fromCursor(identity);
  }

  return NextResponse.json(
    {
      error: "unauthorized",
      reason: expected || isDeployedHost() ? "token_required" : "token_required",
      hint: isDeployedHost()
        ? "Enter the app access password"
        : "Locally use token local-dev, or set APP_ACCESS_TOKEN",
    },
    { status: 401 },
  );
}

export function requireManager(
  principal: AccessPrincipal,
): AccessPrincipal | NextResponse {
  if (principal.canManage) return principal;
  return NextResponse.json(
    { error: "forbidden", reason: "admin_required" },
    { status: 403 },
  );
}

/**
 * CSRF defense: custom header on mutations; Origin must match Host when sent.
 */
export function requireCsrf(req: Request): NextResponse | null {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return null;
  }

  const header = req.headers.get(CSRF_HEADER);
  if (header !== CSRF_VALUE) {
    return NextResponse.json(
      { error: "forbidden", reason: "csrf" },
      { status: 403 },
    );
  }

  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) {
        return NextResponse.json(
          { error: "forbidden", reason: "origin" },
          { status: 403 },
        );
      }
    } catch {
      return NextResponse.json(
        { error: "forbidden", reason: "origin" },
        { status: 403 },
      );
    }
  }
  return null;
}

export async function guardRead(
  req: Request,
): Promise<AccessPrincipal | NextResponse> {
  return requireViewer(req);
}

export async function guardMutate(
  req: Request,
): Promise<AccessPrincipal | NextResponse> {
  const csrf = requireCsrf(req);
  if (csrf) return csrf;
  return requireViewer(req);
}

export async function guardManage(
  req: Request,
): Promise<AccessPrincipal | NextResponse> {
  const csrf = requireCsrf(req);
  if (csrf) return csrf;
  const viewer = await requireViewer(req);
  if (viewer instanceof NextResponse) return viewer;
  return requireManager(viewer);
}

export function isPreview(principal: AccessPrincipal): boolean {
  return principal.stage === "preview";
}
