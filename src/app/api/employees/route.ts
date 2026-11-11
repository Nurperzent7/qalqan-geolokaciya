import { NextResponse } from "next/server";
import { guardManage, guardRead, storeScopeFor } from "@/lib/api-guard";
import { scopeEmployees } from "@/lib/scope";
import {
  employeeHasPin,
  ensureStoreReady,
  getStore,
  issueEmployeePins,
  setCollection,
  syncEmployeesFromBitrix,
} from "@/lib/store";

export async function GET(req: Request) {
  const auth = await guardRead(req);
  if (auth instanceof NextResponse) return auth;
  const scopeId = storeScopeFor(auth);
  await ensureStoreReady(scopeId);
  const list = scopeEmployees(getStore(scopeId).employees, auth).map((e) => ({
    ...e,
    has_pin: auth.canManage ? employeeHasPin(scopeId, e.id) : undefined,
  }));
  return NextResponse.json(list);
}

export async function POST(req: Request) {
  const auth = await guardManage(req);
  if (auth instanceof NextResponse) return auth;
  const scopeId = storeScopeFor(auth);
  await ensureStoreReady(scopeId);

  let body: { action?: string; employee_id?: string; only_missing?: boolean } =
    {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* empty ok */
  }
  const action = body.action || "sync_bitrix";

  if (action === "sync_bitrix") {
    const result = await syncEmployeesFromBitrix(scopeId);
    return NextResponse.json({
      ...result,
      employees: scopeEmployees(getStore(scopeId).employees, auth).map((e) => ({
        ...e,
        has_pin: employeeHasPin(scopeId, e.id),
      })),
    });
  }

  if (action === "issue_pins") {
    const issued = issueEmployeePins(scopeId, {
      employeeId:
        typeof body.employee_id === "string" ? body.employee_id : undefined,
      onlyMissing: body.only_missing !== false && !body.employee_id,
    });
    return NextResponse.json({
      ok: true,
      issued,
      notice:
        "Сохраните пароль сейчас — повторно не показывается, только перевыпуск.",
      employees: scopeEmployees(getStore(scopeId).employees, auth).map((e) => ({
        ...e,
        has_pin: employeeHasPin(scopeId, e.id),
      })),
    });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

export async function PATCH(req: Request) {
  const auth = await guardManage(req);
  if (auth instanceof NextResponse) return auth;
  const scopeId = storeScopeFor(auth);
  await ensureStoreReady(scopeId);
  const body = (await req.json()) as {
    employee_id?: string;
    collection_enabled?: boolean;
  };
  if (!body.employee_id || typeof body.collection_enabled !== "boolean") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const emp = setCollection(scopeId, body.employee_id, body.collection_enabled);
  if (!emp) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    ...emp,
    has_pin: employeeHasPin(scopeId, emp.id),
  });
}
