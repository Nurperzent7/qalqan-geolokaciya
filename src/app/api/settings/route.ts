import { NextResponse } from "next/server";
import { getStore, updateSettings } from "@/lib/store";
import type { GeoSettings } from "@/lib/types";

export async function GET() {
  return NextResponse.json(getStore().settings);
}

export async function PATCH(req: Request) {
  const body = (await req.json()) as Partial<GeoSettings>;
  const settings = updateSettings(body);
  return NextResponse.json(settings);
}
