import { NextResponse } from "next/server";
import { guardManage, storeScopeFor } from "@/lib/api-guard";
import { ensureStoreReady, resetStore } from "@/lib/store";

export async function POST(req: Request) {
  const auth = await guardManage(req);
  if (auth instanceof NextResponse) return auth;
  const scopeId = storeScopeFor(auth);
  await ensureStoreReady(scopeId);

  let demo = false;
  try {
    const body = (await req.json()) as { demo?: boolean };
    demo = Boolean(body?.demo);
  } catch {
    demo = false;
  }

  const s = resetStore(scopeId, { demo });
  return NextResponse.json({
    ok: true,
    mode: demo ? "demo" : "live",
    employees: s.employees.length,
    points: s.points.length,
    actor: auth.email,
  });
}
