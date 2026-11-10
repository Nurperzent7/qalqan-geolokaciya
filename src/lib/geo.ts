import { parseHm } from "./settings";
import type {
  DaySegment,
  DaySummary,
  GeoSettings,
  Place,
  RawPoint,
  Stay,
  Visit,
} from "./types";

const EARTH_R = 6371000;

export function haversineM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(a));
}

export function minutesBetween(a: string, b: string): number {
  return Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 60000));
}

function overlapMinutes(
  start: string,
  end: string,
  winFromMin: number,
  winToMin: number,
  dayIso: string,
): number {
  const day = dayIso.slice(0, 10);
  const winStart = Date.parse(`${day}T${padHm(winFromMin)}:00+05:00`);
  const winEnd = Date.parse(`${day}T${padHm(winToMin)}:00+05:00`);
  const s = Math.max(Date.parse(start), winStart);
  const e = Math.min(Date.parse(end), winEnd);
  return Math.max(0, Math.round((e - s) / 60000));
}

function padHm(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function isInOffice(
  point: RawPoint,
  office: Place,
): boolean {
  if (point.wifi_bssid && office.bssid_list.includes(point.wifi_bssid)) {
    return true;
  }
  return haversineM(point.lat, point.lon, office.lat, office.lon) <= office.radius_m;
}

export function findPlace(
  lat: number,
  lon: number,
  places: Place[],
  accuracyMedian = 20,
): Place | null {
  const candidates = places
    .filter((p) => p.status === "approved")
    .map((p) => ({
      place: p,
      dist: haversineM(lat, lon, p.lat, p.lon),
      limit: p.radius_m + Math.min(accuracyMedian, 50),
    }))
    .filter((c) => c.dist <= c.limit)
    .sort((a, b) => a.dist - b.dist);
  return candidates[0]?.place ?? null;
}

export function detectStays(
  points: RawPoint[],
  places: Place[],
  settings: GeoSettings,
  employeeId: string,
): Stay[] {
  const usable = points
    .filter((p) => p.accuracy_m <= settings.max_accuracy_m)
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));

  const stays: Stay[] = [];
  let i = 0;
  while (i < usable.length) {
    const anchor = usable[i];
    let j = i + 1;
    let sumLat = anchor.lat;
    let sumLon = anchor.lon;
    let count = 1;
    let mock = anchor.mock;

    while (j < usable.length) {
      const p = usable[j];
      const dist = haversineM(anchor.lat, anchor.lon, p.lat, p.lon);
      if (dist > settings.stay_radius_m) break;
      sumLat += p.lat;
      sumLon += p.lon;
      count += 1;
      mock = mock || p.mock;
      j += 1;
    }

    const start = usable[i].ts;
    const end = usable[j - 1].ts;
    const dur = minutesBetween(start, end);
    if (dur >= settings.personal_stop_min) {
      const cLat = sumLat / count;
      const cLon = sumLon / count;
      const place = findPlace(cLat, cLon, places);
      stays.push({
        id: `stay-${employeeId}-${i}`,
        employee_id: employeeId,
        start,
        end,
        place_id: place?.id ?? null,
        mock_flag: mock,
      });
    }
    i = Math.max(j, i + 1);
  }

  // merge same-place stays with <10 min gap
  const merged: Stay[] = [];
  for (const s of stays) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      prev.place_id &&
      prev.place_id === s.place_id &&
      minutesBetween(prev.end, s.start) < 10
    ) {
      prev.end = s.end;
      prev.mock_flag = prev.mock_flag || s.mock_flag;
    } else {
      merged.push({ ...s });
    }
  }
  return merged;
}

export function officeIntervals(
  points: RawPoint[],
  office: Place,
  settings: GeoSettings,
): Array<{ start: string; end: string }> {
  const sorted = [...points].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  if (!sorted.length) return [];

  const flags = sorted.map((p) => isInOffice(p, office));
  const intervals: Array<{ start: string; end: string }> = [];
  let i = 0;
  while (i < sorted.length) {
    if (!flags[i]) {
      i += 1;
      continue;
    }
    let j = i;
    while (j + 1 < sorted.length) {
      if (flags[j + 1]) {
        j += 1;
        continue;
      }
      // gap outside — absorb if shorter than office_exit_min
      let k = j + 1;
      while (k < sorted.length && !flags[k]) k += 1;
      if (k >= sorted.length) break;
      const gap = minutesBetween(sorted[j].ts, sorted[k].ts);
      if (gap < settings.office_exit_min) {
        j = k;
        continue;
      }
      break;
    }
    intervals.push({ start: sorted[i].ts, end: sorted[j].ts });
    i = j + 1;
  }
  return intervals;
}

export function staysToVisits(
  stays: Stay[],
  places: Place[],
  settings: GeoSettings,
  caseHints: Record<string, { id: string; title: string } | null>,
): Visit[] {
  const byId = Object.fromEntries(places.map((p) => [p.id, p]));
  const visits: Visit[] = [];

  for (const s of stays) {
    if (!s.place_id) continue;
    const place = byId[s.place_id];
    if (!place || place.type === "office") continue;
    const dur = minutesBetween(s.start, s.end);
    if (dur < settings.visit_min) continue;
    if (s.mock_flag) continue;

    const hint = caseHints[s.id] ?? null;
    visits.push({
      id: `visit-${s.id}`,
      employee_id: s.employee_id,
      place_id: s.place_id,
      start: s.start,
      end: s.end,
      case_id: hint?.id ?? null,
      case_title: hint?.title ?? null,
      link_method: hint ? "case" : null,
      status: hint ? "linked" : "awaiting_choice",
      credited_minutes: hint
        ? dur
        : Math.round(dur * settings.no_plaud_coef),
    });
  }
  return visits;
}

export function buildDaySummary(
  employeeId: string,
  date: string,
  officeInts: Array<{ start: string; end: string }>,
  visits: Visit[],
  stays: Stay[],
  places: Place[],
  settings: GeoSettings,
): DaySummary {
  const placeById = Object.fromEntries(places.map((p) => [p.id, p]));
  const segments: DaySegment[] = [];

  for (const o of officeInts) {
    segments.push({
      kind: "office",
      start: o.start,
      end: o.end,
      label: "Офис",
    });
  }

  for (const v of visits.filter((x) => x.status === "linked")) {
    const place = placeById[v.place_id];
    segments.push({
      kind: "visit",
      start: v.start,
      end: v.end,
      label: place ? `Визит: ${place.name}` : "Визит",
      visit_id: v.id,
    });
  }

  for (const s of stays) {
    if (s.place_id) {
      const p = placeById[s.place_id];
      if (p?.type === "office") continue;
      const linked = visits.find(
        (v) => v.start === s.start && v.status === "linked",
      );
      if (linked) continue;
    }
    segments.push({
      kind: "personal",
      start: s.start,
      end: s.end,
      label: s.place_id ? "Остановка без дела" : "Личный выход",
    });
  }

  segments.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

  // travel between work segments
  const workish = segments.filter((s) => s.kind === "office" || s.kind === "visit");
  const withTravel: DaySegment[] = [];
  for (let i = 0; i < segments.length; i++) {
    withTravel.push(segments[i]);
  }
  for (let i = 0; i < workish.length - 1; i++) {
    const a = workish[i];
    const b = workish[i + 1];
    const gap = minutesBetween(a.end, b.start);
    if (gap >= 5 && gap < settings.gap_cut_min) {
      withTravel.push({
        kind: "travel",
        start: a.end,
        end: b.start,
        label: "Дорога",
      });
    }
  }
  withTravel.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

  const work = withTravel.filter((x) =>
    ["office", "visit", "travel"].includes(x.kind),
  );
  let net = 0;
  let first_in: string | null = null;
  let last_out: string | null = null;

  if (work.length) {
    first_in = work[0].start;
    last_out = work[work.length - 1].end;
    const total = minutesBetween(first_in, last_out);
    const lunchFrom = parseHm(settings.lunch_window.from);
    const lunchTo = parseHm(settings.lunch_window.to);
    const personal = withTravel.filter((x) => x.kind === "personal");
    const personalInWin = personal.reduce(
      (acc, x) => acc + overlapMinutes(x.start, x.end, lunchFrom, lunchTo, date),
      0,
    );
    const personalTotal = personal.reduce(
      (acc, x) => acc + minutesBetween(x.start, x.end),
      0,
    );
    const personalOutWin = personalTotal - personalInWin;
    const busyInWin = withTravel
      .filter((x) => x.kind === "visit")
      .reduce(
        (acc, x) => acc + overlapMinutes(x.start, x.end, lunchFrom, lunchTo, date),
        0,
      );
    const lunch = Math.min(
      settings.lunch_minutes,
      Math.max(lunchTo - lunchFrom - busyInWin, 0),
    );
    const extra = Math.max(0, personalInWin - settings.lunch_minutes);
    net = total - personalOutWin - lunch - extra;
  }

  const minutes_by_kind: Record<string, number> = {};
  for (const s of withTravel) {
    minutes_by_kind[s.kind] =
      (minutes_by_kind[s.kind] ?? 0) + minutesBetween(s.start, s.end);
  }

  return {
    employee_id: employeeId,
    date,
    first_in,
    last_out,
    minutes_by_kind,
    net_minutes: Math.max(0, net),
    status: "draft",
    segments: withTravel,
    bitrix_synced: false,
  };
}
