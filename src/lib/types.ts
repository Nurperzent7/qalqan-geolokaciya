export type PlaceType =
  | "office"
  | "court"
  | "gov"
  | "client"
  | "case_party";

export type PlaceStatus = "approved" | "pending";

export type SegmentKind =
  | "office"
  | "visit"
  | "travel"
  | "personal"
  | "lunch"
  | "no_data";

export type DayStatus = "draft" | "review" | "final";

export type Role = "partner" | "deputy" | "employee" | "admin";

export interface GeoSettings {
  work_window: { from: string; to: string };
  lunch_window: { from: string; to: string };
  lunch_minutes: number;
  office_exit_min: number;
  visit_min: number;
  personal_stop_min: number;
  stay_radius_m: number;
  max_accuracy_m: number;
  calendar_match_min: number;
  no_plaud_coef: number;
  gap_cut_min: number;
  case_choice_days: number;
  raw_retention_days: number;
  draft_refresh_min: number;
}

export interface Employee {
  id: string;
  name: string;
  title: string;
  practice: string;
  bitrix_user_id: number;
  role: Role;
  collection_enabled: boolean;
  consent_at: string | null;
  last_lat: number | null;
  last_lon: number | null;
  last_status: string;
  last_seen_at: string | null;
}

export interface Place {
  id: string;
  type: PlaceType;
  name: string;
  address: string;
  lat: number;
  lon: number;
  radius_m: number;
  source: "manual" | "2gis" | "crm" | "case";
  source_id?: string;
  status: PlaceStatus;
  bssid_list: string[];
}

export interface RawPoint {
  device_id: string;
  employee_id: string;
  ts: string;
  lat: number;
  lon: number;
  accuracy_m: number;
  speed_mps: number;
  is_moving: boolean;
  wifi_bssid: string | null;
  mock: boolean;
  battery: number;
}

export interface Stay {
  id: string;
  employee_id: string;
  start: string;
  end: string;
  place_id: string | null;
  mock_flag: boolean;
}

export interface Visit {
  id: string;
  employee_id: string;
  place_id: string;
  start: string;
  end: string;
  case_id: string | null;
  case_title: string | null;
  link_method: "calendar" | "case" | "employee" | null;
  status: "linked" | "awaiting_choice" | "rejected";
  credited_minutes: number;
}

export interface DaySegment {
  kind: SegmentKind;
  start: string;
  end: string;
  label: string;
  visit_id?: string;
}

export interface DaySummary {
  employee_id: string;
  date: string;
  first_in: string | null;
  last_out: string | null;
  minutes_by_kind: Record<string, number>;
  net_minutes: number;
  status: DayStatus;
  segments: DaySegment[];
  bitrix_synced: boolean;
}

export interface BitrixPunch {
  id: string;
  employee_id: string;
  type: "open" | "close" | "pause" | "resume";
  at: string;
  source: "geo_auto" | "manual";
  note: string;
}

export interface CaseOption {
  id: string;
  title: string;
}
