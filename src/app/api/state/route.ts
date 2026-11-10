import { NextResponse } from "next/server";
import { guardRead } from "@/lib/api-guard";
import { hasBitrixWebhook } from "@/lib/bitrix";
import { DEMO_DATE } from "@/lib/seed";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await guardRead(req);
  if (auth instanceof NextResponse) return auth;

  const s = getStore();
  return NextResponse.json({
    demo_date: DEMO_DATE,
    bitrix_mode: hasBitrixWebhook() ? "live" : "mock",
    viewer: {
      email: auth.email,
      name: auth.name,
      simulated: auth.simulated,
      stage: auth.stage,
    },
    settings: s.settings,
    employees: s.employees,
    places: s.places,
    visits: s.visits,
    days: s.days,
    punches: s.punches,
    cases: s.cases,
    viewer_id: s.viewerId,
    sample_notice:
      "Демо-данные Алматы. Bitrix webhook подключается через секреты приложения.",
  });
}
