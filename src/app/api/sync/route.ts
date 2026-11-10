import { NextResponse } from "next/server";
import { guardEmployeeAction, isPreview, storeScopeFor } from "@/lib/api-guard";
import { hasBitrixWebhook } from "@/lib/bitrix";
import { rateLimit } from "@/lib/rate-limit";
import { ensureStoreReady, getStore, syncDayToBitrix } from "@/lib/store";

export async function POST(req: Request) {
  let body: { employee_id?: string };
  try {
    body = (await req.json()) as { employee_id?: string };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body.employee_id || typeof body.employee_id !== "string") {
    return NextResponse.json({ error: "employee_id required" }, { status: 400 });
  }
  if (body.employee_id.length > 64) {
    return NextResponse.json({ error: "employee_id too long" }, { status: 400 });
  }

  const auth = await guardEmployeeAction(req, body.employee_id);
  if (auth instanceof NextResponse) return auth;

  const limited = rateLimit(`sync:${auth.email}`, 6, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "rate_limited",
        detail: `Слишком часто. Повторите через ${limited.retryAfterSec} с.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSec) },
      },
    );
  }

  const scopeId = storeScopeFor(auth);
  await ensureStoreReady(scopeId);
  const exists = getStore(scopeId).employees.some((e) => e.id === body.employee_id);
  if (!exists) {
    return NextResponse.json({ error: "unknown employee" }, { status: 404 });
  }

  if (isPreview(auth) && hasBitrixWebhook()) {
    return NextResponse.json(
      {
        ok: false,
        detail: "Preview stage cannot write to live Bitrix. Use production publish.",
      },
      { status: 403 },
    );
  }

  const result = await syncDayToBitrix(scopeId, body.employee_id);
  return NextResponse.json(
    { ...result, actor: auth.email },
    { status: result.ok ? 200 : 400 },
  );
}
