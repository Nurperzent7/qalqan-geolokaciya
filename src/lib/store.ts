import { punchWorkday } from "./bitrix";
import {
  buildDaySummary,
  detectStays,
  officeIntervals,
  staysToVisits,
} from "./geo";
import { DEFAULT_SETTINGS } from "./settings";
import {
  CASE_OPTIONS,
  DEMO_DATE,
  EMPLOYEES,
  PLACES,
  seedPointsForAnn,
  seedPointsForAskar,
} from "./seed";
import type {
  BitrixPunch,
  CaseOption,
  DaySummary,
  Employee,
  GeoSettings,
  Place,
  RawPoint,
  Visit,
} from "./types";

interface StoreState {
  settings: GeoSettings;
  employees: Employee[];
  places: Place[];
  points: RawPoint[];
  visits: Visit[];
  days: Record<string, DaySummary>;
  punches: BitrixPunch[];
  cases: CaseOption[];
  caseHints: Record<string, { id: string; title: string } | null>;
  viewerId: string;
}

const g = globalThis as unknown as { __geoStore?: StoreState };

function dayKey(employeeId: string, date = DEMO_DATE) {
  return `${employeeId}:${date}`;
}

function createInitial(): StoreState {
  const settings = { ...DEFAULT_SETTINGS };
  const employees = EMPLOYEES.map((e) => ({ ...e }));
  const places = PLACES.map((p) => ({ ...p }));
  const points = [...seedPointsForAskar(), ...seedPointsForAnn()];
  const caseHints: StoreState["caseHints"] = {};
  // Askar court stay gets auto-linked to case-55
  caseHints["stay-e-askar-20"] = { id: "case-55", title: "Дело №55 — заседание Спецсуд" };
  // Ann court linked
  caseHints["stay-e-ann-3"] = { id: "case-55", title: "Дело №55 — заседание Спецсуд" };

  const state: StoreState = {
    settings,
    employees,
    places,
    points,
    visits: [],
    days: {},
    punches: [],
    cases: CASE_OPTIONS,
    caseHints,
    viewerId: "e-askar",
  };
  recomputeAll(state);
  return state;
}

export function getStore(): StoreState {
  if (!g.__geoStore) {
    g.__geoStore = createInitial();
  }
  return g.__geoStore;
}

export function resetStore() {
  g.__geoStore = createInitial();
  return g.__geoStore;
}

function recomputeEmployee(state: StoreState, employeeId: string) {
  const office = state.places.find((p) => p.type === "office" && p.status === "approved");
  if (!office) return;

  const pts = state.points.filter((p) => p.employee_id === employeeId);
  const stays = detectStays(pts, state.places, state.settings, employeeId);
  const officeInts = officeIntervals(pts, office, state.settings);

  // enrich case hints by matching stay ids freshly
  const hints: Record<string, { id: string; title: string } | null> = {};
  for (const s of stays) {
    if (state.caseHints[s.id]) hints[s.id] = state.caseHints[s.id];
    // also match by place+rough time for seed stability
    if (!hints[s.id] && s.place_id === "p-court") {
      hints[s.id] = { id: "case-55", title: "Дело №55 — заседание Спецсуд" };
      state.caseHints[s.id] = hints[s.id];
    }
  }

  const visits = staysToVisits(stays, state.places, state.settings, {
    ...state.caseHints,
    ...hints,
  });

  // keep manually linked visits from previous compute
  for (const v of state.visits.filter((x) => x.employee_id === employeeId)) {
    if (v.status === "linked" && v.link_method === "employee") {
      const idx = visits.findIndex((x) => x.start === v.start && x.place_id === v.place_id);
      if (idx >= 0) visits[idx] = { ...v };
    }
  }

  state.visits = [
    ...state.visits.filter((v) => v.employee_id !== employeeId),
    ...visits,
  ];

  const summary = buildDaySummary(
    employeeId,
    DEMO_DATE,
    officeInts,
    visits,
    stays,
    state.places,
    state.settings,
  );
  state.days[dayKey(employeeId)] = summary;

  // update last position
  const emp = state.employees.find((e) => e.id === employeeId);
  if (emp && pts.length) {
    const last = [...pts].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))[0];
    emp.last_lat = last.lat;
    emp.last_lon = last.lon;
    emp.last_seen_at = last.ts;
    const lastSeg = [...summary.segments].reverse()[0];
    emp.last_status = lastSeg?.label ?? "Нет данных";
  }
}

function recomputeAll(state: StoreState) {
  const ids = new Set(state.points.map((p) => p.employee_id));
  for (const id of ids) recomputeEmployee(state, id);
}

export function updateSettings(patch: Partial<GeoSettings>) {
  const state = getStore();
  state.settings = { ...state.settings, ...patch };
  recomputeAll(state);
  return state.settings;
}

export function setCollection(employeeId: string, enabled: boolean) {
  const state = getStore();
  const emp = state.employees.find((e) => e.id === employeeId);
  if (!emp) return null;
  emp.collection_enabled = enabled;
  if (enabled && !emp.consent_at) {
    emp.consent_at = new Date().toISOString();
  }
  if (!enabled) {
    emp.last_status = "Сбор выключен";
  }
  return emp;
}

export function approvePlace(placeId: string) {
  const state = getStore();
  const p = state.places.find((x) => x.id === placeId);
  if (!p) return null;
  p.status = "approved";
  recomputeAll(state);
  return p;
}

export function linkVisit(visitId: string, caseId: string | null, reject = false) {
  const state = getStore();
  const visit = state.visits.find((v) => v.id === visitId);
  if (!visit) return null;

  if (reject || caseId === null) {
    visit.status = "rejected";
    visit.case_id = null;
    visit.case_title = null;
    visit.link_method = "employee";
    visit.credited_minutes = 0;
  } else {
    const c = state.cases.find((x) => x.id === caseId);
    visit.status = "linked";
    visit.case_id = caseId;
    visit.case_title = c?.title ?? caseId;
    visit.link_method = "employee";
  }

  state.caseHints[`stay-${visit.employee_id}-manual`] = caseId
    ? { id: caseId, title: visit.case_title ?? caseId }
    : null;

  recomputeEmployee(state, visit.employee_id);
  return state.visits.find((v) => v.id === visitId) ?? visit;
}

export async function syncDayToBitrix(employeeId: string) {
  const state = getStore();
  const emp = state.employees.find((e) => e.id === employeeId);
  const day = state.days[dayKey(employeeId)];
  if (!emp || !day || !day.first_in || !day.last_out) {
    return { ok: false, detail: "Нет данных дня для синхронизации" };
  }

  const open = await punchWorkday({
    employeeBitrixId: emp.bitrix_user_id,
    type: "open",
    at: day.first_in,
    employeeId,
    note: "Авто-приход по геолокации (офис/первый визит)",
  });
  const close = await punchWorkday({
    employeeBitrixId: emp.bitrix_user_id,
    type: "close",
    at: day.last_out,
    employeeId,
    note: "Авто-уход по геолокации",
  });

  state.punches.push(open.punch, close.punch);
  day.bitrix_synced = open.ok && close.ok;
  day.status = "final";

  return {
    ok: open.ok && close.ok,
    mode: open.mode,
    detail: [open.detail, close.detail].filter(Boolean).join("; ") || undefined,
    punches: [open.punch, close.punch],
    day,
  };
}

export function ingestPoints(
  batch: RawPoint[],
  limits: { maxBatch: number; maxStore: number },
) {
  if (batch.length > limits.maxBatch) {
    return {
      ok: false as const,
      error: `batch too large (max ${limits.maxBatch})`,
      added: 0,
      total: getStore().points.length,
    };
  }
  const state = getStore();
  if (state.points.length >= limits.maxStore) {
    return {
      ok: false as const,
      error: "point store full",
      added: 0,
      total: state.points.length,
    };
  }
  const room = limits.maxStore - state.points.length;
  const key = (p: RawPoint) => `${p.device_id}|${p.ts}`;
  const existing = new Set(state.points.map(key));
  let added = 0;
  for (const p of batch) {
    if (added >= room) break;
    if (existing.has(key(p))) continue;
    // only allow known employees
    if (!state.employees.some((e) => e.id === p.employee_id)) continue;
    state.points.push(p);
    existing.add(key(p));
    added += 1;
  }
  const touched = new Set(batch.map((p) => p.employee_id));
  for (const id of touched) recomputeEmployee(state, id);
  return { ok: true as const, added, total: state.points.length };
}
