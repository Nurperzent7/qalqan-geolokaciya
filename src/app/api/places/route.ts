import { NextResponse } from "next/server";
import { approvePlace, getStore } from "@/lib/store";

export async function GET() {
  return NextResponse.json(getStore().places);
}

export async function PATCH(req: Request) {
  const body = (await req.json()) as { id: string; action: "approve" };
  if (body.action === "approve") {
    const place = approvePlace(body.id);
    if (!place) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(place);
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
