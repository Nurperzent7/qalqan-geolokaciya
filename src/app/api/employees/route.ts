import { NextResponse } from "next/server";
import { getStore, setCollection } from "@/lib/store";

export async function GET() {
  return NextResponse.json(getStore().employees);
}

export async function PATCH(req: Request) {
  const body = (await req.json()) as {
    employee_id: string;
    collection_enabled: boolean;
  };
  const emp = setCollection(body.employee_id, body.collection_enabled);
  if (!emp) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(emp);
}
