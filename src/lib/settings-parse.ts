import { DEFAULT_SETTINGS } from "./settings";
import type { GeoSettings } from "./types";

function isHm(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

function clampInt(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const n = Math.round(value);
  if (n < min || n > max) return null;
  return n;
}

function clampCoef(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0 || value > 1) return null;
  return Math.round(value * 1000) / 1000;
}

/**
 * Accept only known settings keys with ranges. Rejects unknown keys / bad types.
 */
export function parseSettingsPatch(
  body: unknown,
): { ok: true; patch: Partial<GeoSettings> } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "body must be an object" };
  }

  const raw = body as Record<string, unknown>;
  const allowed = new Set([
    "work_window",
    "lunch_window",
    "lunch_minutes",
    "office_exit_min",
    "visit_min",
    "personal_stop_min",
    "stay_radius_m",
    "max_accuracy_m",
    "calendar_match_min",
    "no_plaud_coef",
    "gap_cut_min",
    "case_choice_days",
    "raw_retention_days",
    "draft_refresh_min",
  ]);

  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) {
      return { ok: false, error: `unknown key: ${key}` };
    }
  }

  const patch: Partial<GeoSettings> = {};

  if ("work_window" in raw) {
    const w = raw.work_window;
    if (!w || typeof w !== "object" || Array.isArray(w)) {
      return { ok: false, error: "work_window invalid" };
    }
    const from = (w as { from?: unknown }).from;
    const to = (w as { to?: unknown }).to;
    if (!isHm(from) || !isHm(to)) {
      return { ok: false, error: "work_window needs HH:MM" };
    }
    patch.work_window = { from, to };
  }

  if ("lunch_window" in raw) {
    const w = raw.lunch_window;
    if (!w || typeof w !== "object" || Array.isArray(w)) {
      return { ok: false, error: "lunch_window invalid" };
    }
    const from = (w as { from?: unknown }).from;
    const to = (w as { to?: unknown }).to;
    if (!isHm(from) || !isHm(to)) {
      return { ok: false, error: "lunch_window needs HH:MM" };
    }
    patch.lunch_window = { from, to };
  }

  const intFields: Array<[keyof GeoSettings, number, number]> = [
    ["lunch_minutes", 0, 180],
    ["office_exit_min", 1, 120],
    ["visit_min", 1, 240],
    ["personal_stop_min", 1, 120],
    ["stay_radius_m", 10, 500],
    ["max_accuracy_m", 10, 500],
    ["calendar_match_min", 0, 240],
    ["gap_cut_min", 5, 240],
    ["case_choice_days", 1, 14],
    ["raw_retention_days", 1, 90],
    ["draft_refresh_min", 1, 60],
  ];

  for (const [key, min, max] of intFields) {
    if (key in raw) {
      const n = clampInt(raw[key as string], min, max);
      if (n === null) {
        return { ok: false, error: `${key} out of range ${min}–${max}` };
      }
      (patch as Record<string, number>)[key] = n;
    }
  }

  if ("no_plaud_coef" in raw) {
    const c = clampCoef(raw.no_plaud_coef);
    if (c === null) return { ok: false, error: "no_plaud_coef must be 0–1" };
    patch.no_plaud_coef = c;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "empty patch" };
  }

  // ensure merged result still has defaults shape
  const merged = { ...DEFAULT_SETTINGS, ...patch };
  if (merged.visit_min < merged.personal_stop_min) {
    return { ok: false, error: "visit_min must be >= personal_stop_min" };
  }

  return { ok: true, patch };
}
