import { NextResponse } from "next/server";
import { guardRead, storeScopeFor } from "@/lib/api-guard";
import { bitrixPortalStatus, hasBitrixWebhook } from "@/lib/bitrix";
import { todayDate } from "@/lib/calendar";
import { hasDatabase } from "@/lib/db";
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
  const workDate = todayDate();
  const employees = scopeEmployees(s.employees, auth);
  const visits = scopeVisits(s.visits, auth);
  const places = scopePlaces(s.places, auth);
  const days = scopeDays(s.days, auth, workDate);
  const punches = scopePunches(s.punches, auth);
  const cases = scopeCases(s.cases, s.visits, auth);

  const portal = bitrixPortalStatus();

  return NextResponse.json({
    demo_date: workDate,
    work_date: workDate,
    bitrix_mode: hasBitrixWebhook() ? "live" : "mock",
    bitrix_portal: portal.portalUrl,
    bitrix_host: portal.host,
    persistence: hasDatabase() ? "postgres" : "memory",
    data_mode: "live",
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
    sample_notice: hasBitrixWebhook()
      ? `Живой режим: портал ${portal.host} — сотрудники и timeman через вебхук.`
      : `Нужен входящий вебхук с ${portal.host} (права user + timeman) в Secrets как BITRIX_WEBHOOK_URL.`,
  });
}
