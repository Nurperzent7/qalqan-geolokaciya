import type { AccessPrincipal } from "./api-guard";
import type {
  BitrixPunch,
  CaseOption,
  DaySummary,
  Employee,
  Place,
  Visit,
} from "./types";

export function assertCanAccessEmployee(
  principal: AccessPrincipal,
  employeeId: string,
): boolean {
  if (principal.canManage) return true;
  return principal.employeeId === employeeId;
}

export function publicPlace(place: Place, admin: boolean): Place {
  // Never expose BSSID lists — unused server-side and sensitive.
  return {
    ...place,
    bssid_list: [],
    address:
      admin || place.type !== "office"
        ? place.address
        : "Офис (адрес скрыт)",
  };
}

export function scopeEmployees(
  employees: Employee[],
  principal: AccessPrincipal,
): Employee[] {
  if (principal.canManage) return employees;
  return employees
    .filter((e) => e.id === principal.employeeId)
    .map((e) => ({ ...e }));
}

export function scopeVisits(visits: Visit[], principal: AccessPrincipal): Visit[] {
  if (principal.canManage) return visits;
  return visits.filter((v) => v.employee_id === principal.employeeId);
}

export function scopeDays(
  days: Record<string, DaySummary>,
  principal: AccessPrincipal,
  demoDate: string,
): Record<string, DaySummary> {
  if (principal.canManage) return days;
  const key = `${principal.employeeId}:${demoDate}`;
  const mine = days[key];
  return mine ? { [key]: mine } : {};
}

export function scopePunches(
  punches: BitrixPunch[],
  principal: AccessPrincipal,
): BitrixPunch[] {
  if (principal.canManage) return punches;
  return punches.filter((p) => p.employee_id === principal.employeeId);
}

export function scopePlaces(places: Place[], principal: AccessPrincipal): Place[] {
  return places.map((p) => publicPlace(p, principal.canManage));
}

export function scopeCases(
  cases: CaseOption[],
  visits: Visit[],
  principal: AccessPrincipal,
): CaseOption[] {
  if (principal.canManage) return cases;
  const ids = new Set(
    visits
      .filter((v) => v.employee_id === principal.employeeId && v.case_id)
      .map((v) => v.case_id as string),
  );
  // allow choosing among all case options for linking own visits
  return cases;
}
