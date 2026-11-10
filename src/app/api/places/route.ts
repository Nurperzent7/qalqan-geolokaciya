import { NextResponse } from "next/server";
import { guardManage, guardRead } from "@/lib/api-guard";
import { approvePlace, ensureStoreReady, getStore } from "@/lib/store";

export async function GET(req: Request) {
  const auth = await guardRead(req);
  if (auth instanceof NextResponse) return auth;
  await ensureStoreReady();
  return NextResponse.json(getStore().places);
}

export async function PATCH(req: Request) {
  const auth = await guardManage(req);
  if (auth instanceof NextResponse) return auth;
  await ensureStoreReady();
  const body = (await req.json()) as { id?: string; action?: string };
  if (body.action === "approve" && body.id) {
    const place = approvePlace(body.id);
    if (!place) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(place);
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
