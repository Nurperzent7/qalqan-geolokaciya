import { NextResponse } from "next/server";
import {
  requireIdentity,
  requireTeamRole,
  type VerifiedIdentity,
} from "../../cursor/identity";

const CSRF_HEADER = "x-requested-with";
const CSRF_VALUE = "CursorApp";
const MAX_POINTS_PER_BATCH = 200;
const MAX_POINTS_IN_STORE = 20_000;

export { MAX_POINTS_PER_BATCH, MAX_POINTS_IN_STORE };

export async function requireViewer(
  req: Request,
): Promise<VerifiedIdentity | NextResponse> {
  const identity = await requireIdentity(req);
  if (identity instanceof Response) {
    return NextResponse.json(
      { error: "unauthorized", reason: "sign_in_required" },
      { status: 401 },
    );
  }
  return identity;
}

/** Private app owner, or team admin. */
export function requireManager(
  identity: VerifiedIdentity,
): VerifiedIdentity | NextResponse {
  if (identity.appVisibility === "private") {
    return identity;
  }
  const narrowed = requireTeamRole(identity, ["admin"]);
  if (narrowed instanceof Response) {
    return NextResponse.json(
      { error: "forbidden", reason: "admin_required" },
      { status: 403 },
    );
  }
  return narrowed;
}

/**
 * CSRF defense for cookie/session hosts: require custom header on mutations,
 * and when Origin is present it must match Host.
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
): Promise<VerifiedIdentity | NextResponse> {
  return requireViewer(req);
}

export async function guardMutate(
  req: Request,
): Promise<VerifiedIdentity | NextResponse> {
  const csrf = requireCsrf(req);
  if (csrf) return csrf;
  return requireViewer(req);
}

export async function guardManage(
  req: Request,
): Promise<VerifiedIdentity | NextResponse> {
  const csrf = requireCsrf(req);
  if (csrf) return csrf;
  const viewer = await requireViewer(req);
  if (viewer instanceof NextResponse) return viewer;
  return requireManager(viewer);
}

export function isPreview(identity: VerifiedIdentity): boolean {
  return identity.stage === "preview";
}
