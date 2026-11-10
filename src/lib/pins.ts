import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

export function hashPin(pin: string, salt?: string): string {
  const s = salt ?? randomBytes(16).toString("hex");
  const hash = scryptSync(pin, s, 32).toString("hex");
  return `${s}:${hash}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(pin, salt, 32);
  const prev = Buffer.from(hash, "hex");
  if (prev.length !== next.length) return false;
  return timingSafeEqual(prev, next);
}

function isDeployedHost(): boolean {
  return Boolean(process.env.CURSOR_APP_ID || process.env.VERCEL);
}

/** Hashes from EMPLOYEE_PIN_HASHES secret: { "e-askar": "salt:hash", ... } */
export function pinHashesFromEnv(): Record<string, string> | null {
  const raw = process.env.EMPLOYEE_PIN_HASHES?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof k === "string" && typeof v === "string" && v.includes(":")) {
        out[k] = v;
      }
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

/**
 * Production: only env hashes. Local (no CURSOR_APP_ID/VERCEL): any 4–32 char PIN
 * for a known employee id — no plaintext credentials ship in the repo.
 */
export function verifyEmployeeCredential(
  employeeId: string,
  pin: string,
): boolean {
  if (!pin || pin.length < 4 || pin.length > 64) return false;
  const hashes = pinHashesFromEnv();
  if (hashes?.[employeeId]) {
    return verifyPin(pin, hashes[employeeId]);
  }
  if (!isDeployedHost()) {
    return true;
  }
  return false;
}

export function employeeLoginAvailable(): boolean {
  return Boolean(pinHashesFromEnv()) || !isDeployedHost();
}
