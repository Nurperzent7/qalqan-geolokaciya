import { NextResponse } from "next/server";
import { guardManage, guardRead, storeScopeFor } from "@/lib/api-guard";
import { scopeEmployees } from "@/lib/scope";
import {
  ensureStoreReady,
  getStore,
  setCollection,
  syncEmployeesFromBitrix,
} from "@/lib/store";

export async function GET(req: Request) {
  const auth = await guardRead(req);
  if (auth instanceof NextResponse) return auth;
  const scopeId = storeScopeFor(auth);
  await ensureStoreReady(scopeId);
  return NextResponse.json(scopeEmployees(getStore(scopeId).employees, auth));
}

export async function POST(req: Request) {
  const auth = await guardManage(req);
  if (auth instanceof NextResponse) return auth;
  const scopeId = storeScopeFor(auth);
  await ensureStoreReady(scopeId);

  let action = "sync_bitrix";
  try {
    const body = (await req.json()) as { action?: string };
    if (body?.action) action = body.action;
  } catch {
    /* empty body ok */
  }

  if (action !== "sync_bitrix") {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }

  const result = await syncEmployeesFromBitrix(scopeId);
  return NextResponse.json({
    ...result,
    employees: scopeEmployees(getStore(scopeId).employees, auth),
  });
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
  return NextResponse.json(emp);
}
