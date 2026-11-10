import { NextResponse } from "next/server";
import { syncDayToBitrix } from "@/lib/store";

export async function POST(req: Request) {
  const body = (await req.json()) as { employee_id: string };
  if (!body.employee_id) {
    return NextResponse.json({ error: "employee_id required" }, { status: 400 });
  }
  const result = await syncDayToBitrix(body.employee_id);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
