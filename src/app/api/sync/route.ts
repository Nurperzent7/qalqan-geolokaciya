import { NextResponse } from "next/server";
import { guardManage, isPreview } from "@/lib/api-guard";
import { hasBitrixWebhook } from "@/lib/bitrix";
import { getStore, syncDayToBitrix } from "@/lib/store";

export async function POST(req: Request) {
  const auth = await guardManage(req);
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json()) as { employee_id?: string };
  if (!body.employee_id) {
    return NextResponse.json({ error: "employee_id required" }, { status: 400 });
  }

  const exists = getStore().employees.some((e) => e.id === body.employee_id);
  if (!exists) {
    return NextResponse.json({ error: "unknown employee" }, { status: 404 });
  }

  // Preview hosts must not punch production Bitrix
  if (isPreview(auth) && hasBitrixWebhook()) {
    return NextResponse.json(
      {
        ok: false,
        detail: "Preview stage cannot write to live Bitrix. Use production publish.",
      },
      { status: 403 },
    );
  }

  const result = await syncDayToBitrix(body.employee_id);
  return NextResponse.json(
    {
      ...result,
      actor: auth.email || auth.sub,
    },
    { status: result.ok ? 200 : 400 },
  );
}
