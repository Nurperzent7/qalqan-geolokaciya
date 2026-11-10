import { NextResponse } from "next/server";
import { guardManage, guardRead, storeScopeFor } from "@/lib/api-guard";
import { scopePlaces } from "@/lib/scope";
import { approvePlace, ensureStoreReady, getStore } from "@/lib/store";

export async function GET(req: Request) {
  const auth = await guardRead(req);
  if (auth instanceof NextResponse) return auth;
  const scopeId = storeScopeFor(auth);
  await ensureStoreReady(scopeId);
  return NextResponse.json(scopePlaces(getStore(scopeId).places, auth));
}

export async function PATCH(req: Request) {
  const auth = await guardManage(req);
  if (auth instanceof NextResponse) return auth;
  const scopeId = storeScopeFor(auth);
  await ensureStoreReady(scopeId);
  const body = (await req.json()) as { id?: string; action?: string };
  if (body.action === "approve" && body.id) {
    const place = approvePlace(scopeId, body.id);
    if (!place) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(place);
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
