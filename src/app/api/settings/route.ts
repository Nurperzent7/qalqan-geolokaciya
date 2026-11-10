import { NextResponse } from "next/server";
import { guardManage, guardRead, storeScopeFor } from "@/lib/api-guard";
import { parseSettingsPatch } from "@/lib/settings-parse";
import { ensureStoreReady, getStore, updateSettings } from "@/lib/store";

export async function GET(req: Request) {
  const auth = await guardRead(req);
  if (auth instanceof NextResponse) return auth;
  const scopeId = storeScopeFor(auth);
  await ensureStoreReady(scopeId);
  return NextResponse.json(getStore(scopeId).settings);
}

export async function PATCH(req: Request) {
  const auth = await guardManage(req);
  if (auth instanceof NextResponse) return auth;
  const scopeId = storeScopeFor(auth);
  await ensureStoreReady(scopeId);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = parseSettingsPatch(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const settings = updateSettings(scopeId, parsed.patch);
  return NextResponse.json(settings);
}
