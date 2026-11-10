import { NextResponse } from "next/server";
import { guardManage, storeScopeFor } from "@/lib/api-guard";
import { ensureStoreReady, resetStore } from "@/lib/store";

export async function POST(req: Request) {
  const auth = await guardManage(req);
  if (auth instanceof NextResponse) return auth;
  const scopeId = storeScopeFor(auth);
  await ensureStoreReady(scopeId);
  const s = resetStore(scopeId);
  return NextResponse.json({
    ok: true,
    employees: s.employees.length,
    points: s.points.length,
    actor: auth.email,
  });
}
