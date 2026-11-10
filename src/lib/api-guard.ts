import { NextResponse } from "next/server";
import { getIdentity, requireTeamRole } from "../../cursor/identity";
import { getSession, type Session } from "./sessions";

const CSRF_VALUE = "CursorApp";
const MAX_POINTS_PER_BATCH = 200;
const MAX_POINTS_IN_STORE = 20_000;

export { MAX_POINTS_PER_BATCH, MAX_POINTS_IN_STORE };

export type AccessPrincipal = {
  email: string;
  name: string;
  simulated: boolean;
  stage: "production" | "preview";
  canManage: boolean;
  /** Employee scope; null for admins. */
  employeeId: string | null;
  source: "session" | "cursor";
  sessionId: string | null;
};

function readBearer(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const t = auth.slice(7).trim();
    return t || null;
  }
  return req.headers.get("x-app-token")?.trim() || null;
}

function fromSession(session: Session): AccessPrincipal {
  return {
    email:
      session.role === "admin"
        ? "admin@app"
        : `${session.employeeId}@employee`,
    name: session.name,
    simulated: false,
    stage: "production",
    canManage: session.role === "admin",
    employeeId: session.employeeId,
    source: "session",
    sessionId: session.id,
  };
}

export async function requireViewer(
  req: Request,
): Promise<AccessPrincipal | NextResponse> {
  const token = readBearer(req);
  const session = await getSession(token);
  if (session) return fromSession(session);

  // Optional Cursor identity (private/team hosts): admins only
  const identity = await getIdentity(req);
  if (identity.verified) {
    let canManage = identity.appVisibility === "private";
    if (identity.appVisibility === "team") {
      const narrowed = requireTeamRole(identity, ["admin"]);
      canManage = !(narrowed instanceof Response);
    }
    if (!canManage) {
      return NextResponse.json(
        { error: "forbidden", reason: "employee_login_required" },
        { status: 403 },
      );
    }
    return {
      email: identity.email,
      name: identity.name || identity.email || "Cursor admin",
      simulated: identity.simulated,
      stage: identity.stage,
      canManage: true,
      employeeId: null,
      source: "cursor",
      sessionId: null,
    };
  }

  return NextResponse.json(
    {
      error: "unauthorized",
      reason: "login_required",
      hint: "Войдите как админ или сотрудник",
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

export function requireCsrf(req: Request): NextResponse | null {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return null;
  }

  const header = req.headers.get("x-requested-with");
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

/** Authenticated user who may act on a specific employee (self or admin). */
export async function guardEmployeeAction(
  req: Request,
  employeeId: string,
): Promise<AccessPrincipal | NextResponse> {
  const csrf = requireCsrf(req);
  if (csrf) return csrf;
  const viewer = await requireViewer(req);
  if (viewer instanceof NextResponse) return viewer;
  if (viewer.canManage) return viewer;
  if (viewer.employeeId === employeeId) return viewer;
  return NextResponse.json(
    { error: "forbidden", reason: "not_your_employee" },
    { status: 403 },
  );
}

export function isPreview(principal: AccessPrincipal): boolean {
  return principal.stage === "preview";
}

export function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") || "unknown";
}
