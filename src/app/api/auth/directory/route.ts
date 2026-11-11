import { NextResponse } from "next/server";
import { LOGIN_EMPLOYEES } from "@/lib/login-directory";
import { employeeLoginAvailable } from "@/lib/pins";

export const dynamic = "force-dynamic";

/** Public: id + name only for the employee login picker. */
export async function GET() {
  const enabled = employeeLoginAvailable();
  return NextResponse.json({
    employee_login: enabled,
    employees: enabled ? LOGIN_EMPLOYEES : [],
  });
}
