import { NextResponse } from "next/server";
import { hasBitrixWebhook } from "@/lib/bitrix";
import { DEMO_DATE } from "@/lib/seed";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = getStore();
  return NextResponse.json({
    demo_date: DEMO_DATE,
    bitrix_mode: hasBitrixWebhook() ? "live" : "mock",
    settings: s.settings,
    employees: s.employees,
    places: s.places,
    visits: s.visits,
    days: s.days,
    punches: s.punches,
    cases: s.cases,
    viewer_id: s.viewerId,
    sample_notice:
      "Демо-данные Алматы. Подключите BITRIX_WEBHOOK_URL для живых отметок рабочего дня.",
  });
}
