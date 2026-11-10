import { NextResponse } from "next/server";
import { guardMutate, guardRead } from "@/lib/api-guard";
import { scopeVisits } from "@/lib/scope";
import { ensureStoreReady, getStore, linkVisit } from "@/lib/store";

export async function GET(req: Request) {
  const auth = await guardRead(req);
  if (auth instanceof NextResponse) return auth;
  await ensureStoreReady();
  return NextResponse.json(scopeVisits(getStore().visits, auth));
}

export async function PATCH(req: Request) {
  const auth = await guardMutate(req);
  if (auth instanceof NextResponse) return auth;
  await ensureStoreReady();

  let body: {
    visit_id?: string;
    case_id?: string | null;
    reject?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body.visit_id) {
    return NextResponse.json({ error: "visit_id required" }, { status: 400 });
  }

  const existing = getStore().visits.find((v) => v.id === body.visit_id);
  if (!existing) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!auth.canManage && existing.employee_id !== auth.employeeId) {
    return NextResponse.json(
      { error: "forbidden", reason: "not_your_visit" },
      { status: 403 },
    );
  }

  const visit = linkVisit(body.visit_id, body.case_id ?? null, Boolean(body.reject));
  if (!visit) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(visit);
}
