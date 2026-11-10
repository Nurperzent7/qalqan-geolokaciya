import { NextResponse } from "next/server";
import { guardManage, guardRead, storeScopeFor } from "@/lib/api-guard";
import { scopeEmployees } from "@/lib/scope";
import { ensureStoreReady, getStore, setCollection } from "@/lib/store";

export async function GET(req: Request) {
  const auth = await guardRead(req);
  if (auth instanceof NextResponse) return auth;
  const scopeId = storeScopeFor(auth);
  await ensureStoreReady(scopeId);
  return NextResponse.json(scopeEmployees(getStore(scopeId).employees, auth));
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
