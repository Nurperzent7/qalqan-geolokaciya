import { NextResponse } from "next/server";
import { requireCsrf, rateLimitKey, storeScopeFor } from "@/lib/api-guard";
import { burnVerifyCost, verifyEmployeeCredential } from "@/lib/pins";
import { rateLimit } from "@/lib/rate-limit";
import { adminSecretsMatch, createSession } from "@/lib/sessions";
import {
  ensureStoreReady,
  getPinHashes,
  getStore,
} from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COMPANY = "live:company";

export async function POST(req: Request) {
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  // Tighter login budget on public host (per IP).
  const limited = await rateLimit(rateLimitKey(req, "login"), 5, 15 * 60_000);
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
    const employeeId =
      typeof body.employee_id === "string" ? body.employee_id.slice(0, 64) : "";

    // Extra bucket per attempted employee id (slows targeted guessing).
    if (employeeId) {
      const idLimited = await rateLimit(
        `login-emp:${employeeId}`,
        8,
        30 * 60_000,
      );
      if (!idLimited.ok) {
        return NextResponse.json(
          {
            error: "rate_limited",
            detail: `Слишком много попыток. Подождите ${idLimited.retryAfterSec} с.`,
          },
          {
            status: 429,
            headers: { "Retry-After": String(idLimited.retryAfterSec) },
          },
        );
      }
    }

    await ensureStoreReady(COMPANY).catch(() => null);
    const emp = employeeId
      ? getStore(COMPANY).employees.find((e) => e.id === employeeId)
      : undefined;
    const hashes = getPinHashes(COMPANY);

    // Always pay scrypt cost so missing id vs bad password look alike.
    const ok =
      Boolean(emp) &&
      verifyEmployeeCredential(employeeId, password, hashes);
    if (!ok) {
      if (!emp || !hashes[employeeId]) burnVerifyCost();
      return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
    }

    const { token, session } = await createSession({
      role: "employee",
      employeeId: emp!.id,
      name: emp!.name,
    });
    return NextResponse.json({
      token,
      role: session.role,
      employee_id: emp!.id,
      name: session.name,
    });
  }

  return NextResponse.json(
    { error: "role must be admin or employee" },
    { status: 400 },
  );
}
