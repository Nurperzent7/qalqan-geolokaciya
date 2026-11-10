import { NextResponse } from "next/server";
import { ingestPoints } from "@/lib/store";
import type { RawPoint } from "@/lib/types";

export async function POST(req: Request) {
  const body = (await req.json()) as { points?: RawPoint[] };
  if (!body.points?.length) {
    return NextResponse.json({ error: "points required" }, { status: 400 });
  }
  const result = ingestPoints(body.points);
  return NextResponse.json(result);
}
