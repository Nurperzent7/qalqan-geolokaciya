import { NextResponse } from "next/server";
import { requireCsrf } from "@/lib/api-guard";
import { revokeSession } from "@/lib/sessions";

export async function POST(req: Request) {
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const auth = req.headers.get("authorization");
  const token =
    auth?.toLowerCase().startsWith("bearer ")
      ? auth.slice(7).trim()
      : null;
  await revokeSession(token);
  return NextResponse.json({ ok: true });
}
