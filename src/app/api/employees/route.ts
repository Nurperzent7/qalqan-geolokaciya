import { NextResponse } from "next/server";
import { guardManage, guardRead } from "@/lib/api-guard";
import { getStore, setCollection } from "@/lib/store";

export async function GET(req: Request) {
  const auth = await guardRead(req);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json(getStore().employees);
}

export async function PATCH(req: Request) {
  const auth = await guardManage(req);
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json()) as {
    employee_id?: string;
    collection_enabled?: boolean;
  };
  if (!body.employee_id || typeof body.collection_enabled !== "boolean") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const emp = setCollection(body.employee_id, body.collection_enabled);
  if (!emp) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(emp);
}
