import { NextResponse } from "next/server";
import { guardRead } from "@/lib/api-guard";
import { hasBitrixWebhook } from "@/lib/bitrix";
import { DEMO_DATE } from "@/lib/seed";
import { ensureStoreReady } from "@/lib/store";
import { hasDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await guardRead(req);
  if (auth instanceof NextResponse) return auth;

  const s = await ensureStoreReady();
  return NextResponse.json({
    demo_date: DEMO_DATE,
    bitrix_mode: hasBitrixWebhook() ? "live" : "mock",
    persistence: hasDatabase() ? "postgres" : "memory",
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
    sample_notice: hasDatabase()
      ? "Данные хранятся в Postgres приложения. Стартовый день — демо Алматы."
      : "Демо в памяти (без DATABASE_URL). На publish с БД состояние сохранится.",
  });
}
