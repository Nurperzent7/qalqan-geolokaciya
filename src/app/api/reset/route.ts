import { NextResponse } from "next/server";
import { resetStore } from "@/lib/store";

export async function POST() {
  const s = resetStore();
  return NextResponse.json({
    ok: true,
    employees: s.employees.length,
    points: s.points.length,
  });
}
