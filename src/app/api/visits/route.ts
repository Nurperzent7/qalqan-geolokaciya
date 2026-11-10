import { NextResponse } from "next/server";
import { guardMutate, guardRead } from "@/lib/api-guard";
import { ensureStoreReady, getStore, linkVisit } from "@/lib/store";

export async function GET(req: Request) {
  const auth = await guardRead(req);
  if (auth instanceof NextResponse) return auth;
  await ensureStoreReady();
  return NextResponse.json(getStore().visits);
}

export async function PATCH(req: Request) {
  const auth = await guardMutate(req);
  if (auth instanceof NextResponse) return auth;
  await ensureStoreReady();
  const body = (await req.json()) as {
    visit_id?: string;
    case_id?: string | null;
    reject?: boolean;
  };
  if (!body.visit_id) {
    return NextResponse.json({ error: "visit_id required" }, { status: 400 });
  }
  const visit = linkVisit(body.visit_id, body.case_id ?? null, Boolean(body.reject));
  if (!visit) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(visit);
}
