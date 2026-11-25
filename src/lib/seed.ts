import type { CaseOption, Employee, Place, RawPoint } from "./types";

/** Demo day: 2026-11-10 Asia/Qyzylorda (+05) — Almaty office of a law firm */
export const DEMO_DATE = "2026-11-10";
export const TZ = "+05:00";

export const EMPLOYEES: Employee[] = [
  {
    id: "e-askar",
    name: "Аскар Бекенов",
    title: "адвокат",
    practice: "Судебная практика",
    bitrix_user_id: 11,
    role: "employee",
    collection_enabled: true,
    consent_at: "2026-10-01T10:00:00+05:00",
    last_lat: 43.2324,
    last_lon: 76.9597,
    last_status: "В офисе",
    last_seen_at: "2026-11-10T18:55:00+05:00",
  },
  {
    id: "e-ann",
    name: "Анна Серикова",
    title: "адвокат",
    practice: "Судебная практика",
    bitrix_user_id: 12,
    role: "employee",
    collection_enabled: true,
    consent_at: "2026-10-01T10:00:00+05:00",
    last_lat: 43.2382,
    last_lon: 76.9455,
    last_status: "Визит: Спецсуд г. Алматы",
    last_seen_at: "2026-11-10T16:40:00+05:00",
  },
  {
    id: "e-nurlan",
    name: "Нурлан Касымов",
    title: "руководитель",
    practice: "Корпоративная",
    bitrix_user_id: 3,
    role: "deputy",
    collection_enabled: true,
    consent_at: "2026-09-15T09:00:00+05:00",
    last_lat: 43.2405,
    last_lon: 76.918,
    last_status: "У клиента",
    last_seen_at: "2026-11-10T15:20:00+05:00",
  },
  {
    id: "e-dana",
    name: "Дана Омарова",
    title: "адвокат",
    practice: "Корпоративная",
    bitrix_user_id: 15,
    role: "employee",
    collection_enabled: false,
    consent_at: null,
    last_lat: null,
    last_lon: null,
    last_status: "Сбор выключен",
    last_seen_at: null,
  },
  {
    id: "e-aigerim",
    name: "Айгерим Жумабаева",
    title: "младший адвокат",
    practice: "Судебная практика",
    bitrix_user_id: 18,
    role: "employee",
    collection_enabled: true,
    consent_at: "2026-10-20T09:00:00+05:00",
    last_lat: 43.2501,
    last_lon: 76.9412,
    last_status: "Визит: Прокуратура г. Алматы",
    last_seen_at: "2026-11-10T14:30:00+05:00",
  },
];

export const PLACES: Place[] = [
  {
    id: "p-office",
    type: "office",
    name: "Офис QALQAN",
    address: "Алматы, пр. Достык 180, БЦ Коктем",
    lat: 43.2324,
    lon: 76.9597,
    radius_m: 75,
    source: "manual",
    status: "approved",
    // BSSID not used server-side (client values are untrusted).
    bssid_list: [],
  },
  {
    id: "p-court",
    type: "court",
    name: "Специализированный межрайонный суд г. Алматы",
    address: "Алматы, ул. Казыбек би 68",
    lat: 43.2382,
    lon: 76.9455,
    radius_m: 150,
    source: "2gis",
    source_id: "2gis-court-1",
    status: "approved",
    bssid_list: [],
  },
  {
    id: "p-prosecutor",
    type: "gov",
    name: "Прокуратура г. Алматы",
    address: "Алматы, ул. Наурызбай батыра 89",
    lat: 43.2501,
    lon: 76.9412,
    radius_m: 100,
    source: "2gis",
    source_id: "2gis-gov-1",
    status: "approved",
    bssid_list: [],
  },
  {
    id: "p-client-zakon",
    type: "client",
    name: "Клиент: Zakon.kz",
    address: "Алматы, ул. Желтоксан 115",
    lat: 43.2405,
    lon: 76.918,
    radius_m: 100,
    source: "crm",
    source_id: "crm-company-42",
    status: "approved",
    bssid_list: [],
  },
  {
    id: "p-notary",
    type: "gov",
    name: "Нотариус (импорт 2ГИС)",
    address: "Алматы, пр. Достык 160",
    lat: 43.233,
    lon: 76.956,
    radius_m: 100,
    source: "2gis",
    source_id: "2gis-gov-2",
    status: "pending",
    bssid_list: [],
  },
];

export const CASE_OPTIONS: CaseOption[] = [
  { id: "case-101", title: "Дело №101 — Нұрлы жол / иск" },
  { id: "case-88", title: "Дело №88 — Zakon.kz консалтинг" },
  { id: "case-55", title: "Дело №55 — заседание Спецсуд" },
  { id: "deal-12", title: "Сделка: Naryn Gold due diligence" },
];

function pt(
  employeeId: string,
  hm: string,
  lat: number,
  lon: number,
  extra: Partial<RawPoint> = {},
): RawPoint {
  return {
    device_id: `d-${employeeId}`,
    employee_id: employeeId,
    ts: `${DEMO_DATE}T${hm}:00${TZ}`,
    lat,
    lon,
    accuracy_m: 12,
    speed_mps: 0,
    is_moving: false,
    wifi_bssid: null,
    mock: false,
    battery: 0.7,
    ...extra,
  };
}

/** Sample track for Askar: office → smoke → court visit → shop → office */
export function seedPointsForAskar(): RawPoint[] {
  const office = { lat: 43.2324, lon: 76.9597 };
  const yard = { lat: 43.2326, lon: 76.9602 };
  const court = { lat: 43.2382, lon: 76.9455 };
  const shop = { lat: 43.242, lon: 76.938 };
  const points: RawPoint[] = [];

  // morning in office with Wi-Fi
  for (const hm of ["09:05", "09:20", "09:40", "10:00", "10:30", "11:00", "11:30"]) {
    points.push(
      pt("e-askar", hm, office.lat, office.lon, {
        wifi_bssid: "a4:2b:b0:11:22:33",
        is_moving: false,
      }),
    );
  }
  // smoke break ~10 min outside
  points.push(pt("e-askar", "11:40", yard.lat, yard.lon, { is_moving: false }));
  points.push(pt("e-askar", "11:45", yard.lat + 0.0001, yard.lon, { is_moving: false }));
  points.push(pt("e-askar", "11:50", yard.lat, yard.lon + 0.0001, { is_moving: false }));

  // back office briefly
  points.push(
    pt("e-askar", "12:00", office.lat, office.lon, {
      wifi_bssid: "a4:2b:b0:11:22:33",
    }),
  );

  // travel to court
  points.push(
    pt("e-askar", "12:20", 43.25, 76.935, { is_moving: true, speed_mps: 8 }),
  );
  points.push(
    pt("e-askar", "12:40", 43.242, 76.94, { is_moving: true, speed_mps: 7 }),
  );

  // court visit 13:00–15:10
  for (const hm of ["13:00", "13:20", "13:40", "14:00", "14:20", "14:40", "15:00", "15:10"]) {
    points.push(pt("e-askar", hm, court.lat, court.lon));
  }

  // shop stop ~15 min
  points.push(pt("e-askar", "15:25", shop.lat, shop.lon));
  points.push(pt("e-askar", "15:30", shop.lat + 0.00005, shop.lon));
  points.push(pt("e-askar", "15:40", shop.lat, shop.lon + 0.00005));

  // back to office until evening
  for (const hm of ["16:10", "16:40", "17:10", "17:40", "18:10", "18:40", "18:55"]) {
    points.push(
      pt("e-askar", hm, office.lat, office.lon, {
        wifi_bssid: "a4:2b:b0:11:22:33",
      }),
    );
  }

  return points;
}

export function seedPointsForAnn(): RawPoint[] {
  const office = { lat: 43.2324, lon: 76.9597 };
  const court = { lat: 43.2382, lon: 76.9455 };
  const points: RawPoint[] = [];
  for (const hm of ["09:15", "09:45", "10:15"]) {
    points.push(
      pt("e-ann", hm, office.lat, office.lon, {
        wifi_bssid: "a4:2b:b0:11:22:33",
      }),
    );
  }
  for (const hm of ["11:00", "11:30", "12:00", "12:30", "13:00", "14:00", "15:00", "16:00", "16:40"]) {
    points.push(pt("e-ann", hm, court.lat, court.lon));
  }
  return points;
}

/** Aigerim: morning office → prosecutor visit → back */
export function seedPointsForAigerim(): RawPoint[] {
  const office = { lat: 43.2324, lon: 76.9597 };
  const prosecutor = { lat: 43.2501, lon: 76.9412 };
  const points: RawPoint[] = [];
  for (const hm of ["09:10", "09:40", "10:10", "10:40"]) {
    points.push(
      pt("e-aigerim", hm, office.lat, office.lon, {
        wifi_bssid: "a4:2b:b0:11:22:33",
      }),
    );
  }
  for (const hm of [
    "11:20",
    "11:50",
    "12:20",
    "12:50",
    "13:20",
    "13:50",
    "14:20",
    "14:30",
  ]) {
    points.push(pt("e-aigerim", hm, prosecutor.lat, prosecutor.lon));
  }
  for (const hm of ["15:10", "15:40", "16:10", "16:40", "17:10"]) {
    points.push(
      pt("e-aigerim", hm, office.lat, office.lon, {
        wifi_bssid: "a4:2b:b0:11:22:33",
      }),
    );
  }
  return points;
}
