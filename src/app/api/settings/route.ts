import { NextResponse } from "next/server";
import { guardManage, guardRead } from "@/lib/api-guard";
import { parseSettingsPatch } from "@/lib/settings-parse";
import { ensureStoreReady, getStore, updateSettings } from "@/lib/store";

export async function GET(req: Request) {
  const auth = await guardRead(req);
  if (auth instanceof NextResponse) return auth;
  await ensureStoreReady();
  return NextResponse.json(getStore().settings);
}

export async function PATCH(req: Request) {
  const auth = await guardManage(req);
  if (auth instanceof NextResponse) return auth;
  await ensureStoreReady();

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

  const settings = updateSettings(parsed.patch);
  return NextResponse.json(settings);
}
