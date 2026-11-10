import type { GeoSettings } from "./types";

export const DEFAULT_SETTINGS: GeoSettings = {
  work_window: { from: "09:00", to: "19:00" },
  lunch_window: { from: "12:30", to: "14:00" },
  lunch_minutes: 60,
  office_exit_min: 5,
  visit_min: 10,
  personal_stop_min: 5,
  stay_radius_m: 75,
  max_accuracy_m: 100,
  calendar_match_min: 60,
  no_plaud_coef: 0.75,
  gap_cut_min: 60,
  case_choice_days: 2,
  raw_retention_days: 30,
  draft_refresh_min: 5,
};

export function parseHm(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}
