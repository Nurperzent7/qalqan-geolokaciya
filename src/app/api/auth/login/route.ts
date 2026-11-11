import { NextResponse } from "next/server";
import { requireCsrf, rateLimitKey, storeScopeFor } from "@/lib/api-guard";
import {
  employeeLoginAvailable,
  verifyEmployeeCredential,
} from "@/lib/pins";
import { rateLimit } from "@/lib/rate-limit";
import { adminSecretsMatch, createSession } from "@/lib/sessions";
import { ensureStoreReady, getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const limited = await rateLimit(rateLimitKey(req, "login"), 10, 15 * 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      {
        error: "rate_limited",
        detail: `Слишком много попыток. Подождите ${limited.retryAfterSec} с.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSec) },
      },
    );
  }

  let body: {
    role?: string;
    password?: string;
    employee_id?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (!password || password.length > 200) {
    return NextResponse.json({ error: "password required" }, { status: 400 });
  }

  if (body.role === "admin") {
    const match = adminSecretsMatch(password);
    if (!match.ok) {
      return NextResponse.json(
        { error: "invalid credentials" },
        { status: 401 },
      );
    }
    const { token, session } = await createSession({
      role: "admin",
      employeeId: null,
      name: match.simulated ? "Local Admin" : "Admin",
    });
    // Warm company store + Bitrix roster for the new admin session.
    const principal = {
      email: "admin@app",
      name: session.name,
      simulated: false,
      stage: "production" as const,
      canManage: true,
      employeeId: null,
      source: "session" as const,
      sessionId: session.id,
    };
    await ensureStoreReady(storeScopeFor(principal)).catch(() => null);
    return NextResponse.json({
      token,
      role: session.role,
      employee_id: null,
      name: session.name,
    });
  }

  if (body.role === "employee") {
    if (!employeeLoginAvailable()) {
      return NextResponse.json(
        { error: "employee_login_disabled" },
        { status: 403 },
      );
    }
    const employeeId =
      typeof body.employee_id === "string" ? body.employee_id.slice(0, 64) : "";
    if (!employeeId || !verifyEmployeeCredential(employeeId, password)) {
      return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
    }

    // Resolve name from company roster (Bitrix) — never from a public directory.
    const warm = {
      email: `${employeeId}@employee`,
      name: employeeId,
      simulated: false,
      stage: "production" as const,
      canManage: false,
      employeeId,
      source: "session" as const,
      sessionId: null,
    };
    await ensureStoreReady(storeScopeFor(warm)).catch(() => null);
    const emp = getStore(storeScopeFor(warm)).employees.find(
      (e) => e.id === employeeId,
    );
    if (!emp) {
      return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
    }

    const { token, session } = await createSession({
      role: "employee",
      employeeId: emp.id,
      name: emp.name,
    });
    return NextResponse.json({
      token,
      role: session.role,
      employee_id: emp.id,
      name: session.name,
    });
  }

  return NextResponse.json(
    { error: "role must be admin or employee" },
    { status: 400 },
  );
}
