/**
 * Mobile / Capacitor shell helpers for employee-first UI.
 */

export function isNarrowViewport(maxWidth = 820): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(`(max-width: ${maxWidth}px)`).matches;
}

/** Employee phone shell: native app or narrow screen. */
export function preferEmployeeMobileShell(opts: {
  isAdmin: boolean;
  nativeApp: boolean;
  narrow: boolean;
}): boolean {
  if (opts.isAdmin) return false;
  return opts.nativeApp || opts.narrow;
}

export const EMPLOYEE_MOBILE_TABS = [
  "phone",
  "journal",
  "visits",
  "map",
] as const;

export type EmployeeMobileTab = (typeof EMPLOYEE_MOBILE_TABS)[number];
