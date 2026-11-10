import { NextResponse } from "next/server";
import { getStore, linkVisit } from "@/lib/store";

export async function GET() {
  return NextResponse.json(getStore().visits);
}

export async function PATCH(req: Request) {
  const body = (await req.json()) as {
    visit_id: string;
    case_id?: string | null;
    reject?: boolean;
  };
  const visit = linkVisit(body.visit_id, body.case_id ?? null, Boolean(body.reject));
  if (!visit) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(visit);
}
