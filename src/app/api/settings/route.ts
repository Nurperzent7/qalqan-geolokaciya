import { NextResponse } from "next/server";
import { guardManage, guardRead } from "@/lib/api-guard";
import { getStore, updateSettings } from "@/lib/store";
import type { GeoSettings } from "@/lib/types";

export async function GET(req: Request) {
  const auth = await guardRead(req);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json(getStore().settings);
}

export async function PATCH(req: Request) {
  const auth = await guardManage(req);
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json()) as Partial<GeoSettings>;
  const settings = updateSettings(body);
  return NextResponse.json(settings);
}
