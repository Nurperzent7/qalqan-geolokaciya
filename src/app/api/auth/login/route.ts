import { NextResponse } from "next/server";
import { requireCsrf, clientIp } from "@/lib/api-guard";
import { buildDemoPinHashes, verifyPin } from "@/lib/pins";
import { rateLimit } from "@/lib/rate-limit";
import {
  adminSecretsMatch,
  createSession,
} from "@/lib/sessions";
import { ensureStoreReady, getStore } from "@/lib/store";

const PIN_HASHES = buildDemoPinHashes();

export async function POST(req: Request) {
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const ip = clientIp(req);
  const limited = rateLimit(`login:${ip}`, 10, 15 * 60_000);
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
      return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
    }
    const { token, session } = await createSession({
      role: "admin",
      employeeId: null,
      name: match.simulated ? "Local Admin" : "Admin",
    });
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
    await ensureStoreReady();
    const emp = getStore().employees.find((e) => e.id === employeeId);
    const hash = PIN_HASHES[employeeId];
    if (!emp || !hash || !verifyPin(password, hash)) {
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

  return NextResponse.json({ error: "role must be admin or employee" }, { status: 400 });
}
