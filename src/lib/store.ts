import { punchWorkday } from "./bitrix";
import { deleteSnapshot, hasDatabase, loadSnapshot, saveSnapshot } from "./db";
import {
  buildDaySummary,
  detectStays,
  officeIntervals,
  staysToVisits,
} from "./geo";
import { DEFAULT_SETTINGS } from "./settings";
import { todayDate } from "./calendar";
import {
  CASE_OPTIONS,
  EMPLOYEES,
  PLACES,
  seedPointsForAigerim,
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

const g = globalThis as unknown as {
  __geoStores?: Map<string, StoreState>;
  __geoHydrate?: Map<string, Promise<void>>;
  __geoPersist?: Map<string, ReturnType<typeof setTimeout>>;
};

function stores(): Map<string, StoreState> {
  if (!g.__geoStores) g.__geoStores = new Map();
  return g.__geoStores;
}

function hydrates(): Map<string, Promise<void>> {
  if (!g.__geoHydrate) g.__geoHydrate = new Map();
  return g.__geoHydrate;
}

function persists(): Map<string, ReturnType<typeof setTimeout>> {
  if (!g.__geoPersist) g.__geoPersist = new Map();
  return g.__geoPersist;
}

function snapshotKey(scopeId: string) {
  return `store:${scopeId}`;
}

function dayKey(employeeId: string, date = todayDate()) {
  return `${employeeId}:${date}`;
}

function liveEmployees(): Employee[] {
  return EMPLOYEES.map((e) => ({
    ...e,
    last_lat: null,
    last_lon: null,
    last_status: e.collection_enabled ? "Ожидание точки" : "Сбор выключен",
    last_seen_at: null,
  }));
}

/** Empty live company state: roster + places, no fake tracks. */
function createInitial(withDemoTracks = false): StoreState {
  const settings = { ...DEFAULT_SETTINGS };
  const employees = liveEmployees();
  const places = PLACES.map((p) => ({ ...p }));
  const caseHints: StoreState["caseHints"] = {};
  const points = withDemoTracks
    ? [
        ...seedPointsForAskar(),
        ...seedPointsForAnn(),
        ...seedPointsForAigerim(),
      ]
    : [];
  if (withDemoTracks) {
    caseHints["stay-e-askar-20"] = {
      id: "case-55",
      title: "Дело №55 — заседание Спецсуд",
    };
    caseHints["stay-e-ann-3"] = {
      id: "case-55",
      title: "Дело №55 — заседание Спецсуд",
    };
    caseHints["stay-e-aigerim-4"] = {
      id: "case-101",
      title: "Дело №101 — Нұрлы жол / иск",
    };
  }

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

export function getStore(scopeId: string): StoreState {
  const map = stores();
  let state = map.get(scopeId);
  if (!state) {
    state = createInitial();
    map.set(scopeId, state);
  }
  return state;
}

function schedulePersist(scopeId: string) {
  if (!hasDatabase()) return;
  const map = persists();
  const prev = map.get(scopeId);
  if (prev) clearTimeout(prev);
  map.set(
    scopeId,
    setTimeout(() => {
      const state = getStore(scopeId);
      void saveSnapshot(snapshotKey(scopeId), state).catch(() => {
        /* ignore */
      });
    }, 250),
  );
}

/** Shared live company store (or local memory fallback). */
export async function ensureStoreReady(scopeId: string): Promise<StoreState> {
  if (!scopeId) throw new Error("store scope required");
  if (!hasDatabase()) {
    return getStore(scopeId);
  }
  const h = hydrates();
  if (!h.has(scopeId)) {
    h.set(
      scopeId,
      (async () => {
        const snap = await loadSnapshot<StoreState>(snapshotKey(scopeId));
        if (
          snap &&
          Array.isArray(snap.employees) &&
          Array.isArray(snap.points) &&
          snap.settings
        ) {
          stores().set(scopeId, snap);
          recomputeAll(snap);
        } else {
          const fresh = createInitial(false);
          stores().set(scopeId, fresh);
          await saveSnapshot(snapshotKey(scopeId), fresh);
        }
      })(),
    );
  }
  await h.get(scopeId);
  return getStore(scopeId);
}

export function resetStore(scopeId: string, opts?: { demo?: boolean }) {
  const fresh = createInitial(Boolean(opts?.demo));
  stores().set(scopeId, fresh);
  schedulePersist(scopeId);
  return fresh;
}

/** Drop in-memory + Postgres sandbox for a session scope. */
export async function deleteStoreSnapshot(scopeId: string): Promise<void> {
  if (!scopeId) return;
  const timer = persists().get(scopeId);
  if (timer) {
    clearTimeout(timer);
    persists().delete(scopeId);
  }
  stores().delete(scopeId);
  hydrates().delete(scopeId);
  if (hasDatabase()) {
    await deleteSnapshot(snapshotKey(scopeId));
  }
}

function recomputeEmployee(state: StoreState, employeeId: string) {
  const office = state.places.find(
    (p) => p.type === "office" && p.status === "approved",
  );
  if (!office) return;

  const pts = state.points.filter((p) => p.employee_id === employeeId);
  const stays = detectStays(pts, state.places, state.settings, employeeId);
  const officeInts = officeIntervals(pts, office, state.settings);

  const hints: Record<string, { id: string; title: string } | null> = {};
  for (const s of stays) {
    if (state.caseHints[s.id]) hints[s.id] = state.caseHints[s.id];
    if (!hints[s.id] && s.place_id === "p-court") {
      hints[s.id] = { id: "case-55", title: "Дело №55 — заседание Спецсуд" };
      state.caseHints[s.id] = hints[s.id];
    }
  }

  const visits = staysToVisits(stays, state.places, state.settings, {
    ...state.caseHints,
    ...hints,
  });

  for (const v of state.visits.filter((x) => x.employee_id === employeeId)) {
    if (v.status === "linked" && v.link_method === "employee") {
      const idx = visits.findIndex(
        (x) => x.start === v.start && x.place_id === v.place_id,
      );
      if (idx >= 0) visits[idx] = { ...v };
    }
  }

  state.visits = [
    ...state.visits.filter((v) => v.employee_id !== employeeId),
    ...visits,
  ];

  const summary = buildDaySummary(
    employeeId,
    todayDate(),
    officeInts,
    visits,
    stays,
    state.places,
    state.settings,
  );
  state.days[dayKey(employeeId)] = summary;

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

export function updateSettings(scopeId: string, patch: Partial<GeoSettings>) {
  const state = getStore(scopeId);
  state.settings = { ...state.settings, ...patch };
  recomputeAll(state);
  schedulePersist(scopeId);
  return state.settings;
}

export function setCollection(
  scopeId: string,
  employeeId: string,
  enabled: boolean,
) {
  const state = getStore(scopeId);
  const emp = state.employees.find((e) => e.id === employeeId);
  if (!emp) return null;
  emp.collection_enabled = enabled;
  if (enabled && !emp.consent_at) {
    emp.consent_at = new Date().toISOString();
  }
  if (!enabled) {
    emp.last_status = "Сбор выключен";
  }
  schedulePersist(scopeId);
  return emp;
}

export function approvePlace(scopeId: string, placeId: string) {
  const state = getStore(scopeId);
  const p = state.places.find((x) => x.id === placeId);
  if (!p) return null;
  p.status = "approved";
  recomputeAll(state);
  schedulePersist(scopeId);
  return p;
}

export function linkVisit(
  scopeId: string,
  visitId: string,
  caseId: string | null,
  reject = false,
) {
  const state = getStore(scopeId);
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
  schedulePersist(scopeId);
  return state.visits.find((v) => v.id === visitId) ?? visit;
}

export async function syncDayToBitrix(scopeId: string, employeeId: string) {
  const state = getStore(scopeId);
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
  schedulePersist(scopeId);

  return {
    ok: open.ok && close.ok,
    mode: open.mode,
    detail: [open.detail, close.detail].filter(Boolean).join("; ") || undefined,
    punches: [open.punch, close.punch],
    day,
  };
}

export function ingestPoints(
  scopeId: string,
  batch: RawPoint[],
  limits: { maxBatch: number; maxStore: number },
) {
  if (batch.length > limits.maxBatch) {
    return {
      ok: false as const,
      error: `batch too large (max ${limits.maxBatch})`,
      added: 0,
      total: getStore(scopeId).points.length,
    };
  }
  const state = getStore(scopeId);
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
    if (!state.employees.some((e) => e.id === p.employee_id)) continue;
    state.points.push(p);
    existing.add(key(p));
    added += 1;
  }
  const touched = new Set(batch.map((p) => p.employee_id));
  for (const id of touched) recomputeEmployee(state, id);
  if (added > 0) schedulePersist(scopeId);
  return { ok: true as const, added, total: state.points.length };
}
