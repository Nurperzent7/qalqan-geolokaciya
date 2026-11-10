import { NextResponse } from "next/server";
import { guardRead, storeScopeFor } from "@/lib/api-guard";
import { hasBitrixWebhook } from "@/lib/bitrix";
import { hasDatabase } from "@/lib/db";
import { DEMO_DATE } from "@/lib/seed";
import {
  scopeCases,
  scopeDays,
  scopeEmployees,
  scopePlaces,
  scopePunches,
  scopeVisits,
} from "@/lib/scope";
import { ensureStoreReady } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await guardRead(req);
  if (auth instanceof NextResponse) return auth;

  const scopeId = storeScopeFor(auth);
  const s = await ensureStoreReady(scopeId);
  const employees = scopeEmployees(s.employees, auth);
  const visits = scopeVisits(s.visits, auth);
  const places = scopePlaces(s.places, auth);
  const days = scopeDays(s.days, auth, DEMO_DATE);
  const punches = scopePunches(s.punches, auth);
  const cases = scopeCases(s.cases, s.visits, auth);

  return NextResponse.json({
    demo_date: DEMO_DATE,
    bitrix_mode: hasBitrixWebhook() ? "live" : "mock",
    persistence: hasDatabase() ? "postgres" : "memory",
    store_scope: scopeId,
    viewer: {
      email: auth.email,
      name: auth.name,
      simulated: auth.simulated,
      stage: auth.stage,
      role: auth.canManage ? "admin" : "employee",
      employee_id: auth.employeeId,
      can_manage: auth.canManage,
    },
    settings: auth.canManage
      ? s.settings
      : {
          work_window: s.settings.work_window,
          lunch_window: s.settings.lunch_window,
          draft_refresh_min: s.settings.draft_refresh_min,
        },
    employees,
    places,
    visits,
    days,
    punches,
    cases,
    viewer_id: auth.employeeId ?? s.viewerId,
    sample_notice: auth.canManage
      ? "Админ: изолированная песочница этой сессии (не общая база всех посетителей)."
      : "Сотрудник: только ваши данные в вашей сессии.",
  });
}
