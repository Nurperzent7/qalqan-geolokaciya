import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

/** Minimum employee secret length on deployed hosts (blocks 6-digit PINs). */
export const MIN_EMPLOYEE_SECRET_LEN = 12;

const ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"; // no 0/O/1/l

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

/**
 * Strong employee password: 16 chars from mixed alphabet (~94 bits).
 * Replaces weak 6-digit numeric PINs for public deployment.
 */
export function generateEmployeePin(): string {
  const bytes = randomBytes(16);
  let out = "";
  for (let i = 0; i < 16; i += 1) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

/** Dummy scrypt so missing-user and bad-password paths take similar time. */
export function burnVerifyCost(): void {
  verifyPin("timing-pad-value", hashPin("timing-pad-value"));
}

function isDeployedHost(): boolean {
  return Boolean(process.env.CURSOR_APP_ID || process.env.VERCEL);
}

/** Optional override from EMPLOYEE_PIN_HASHES secret. */
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
 * Check secret against store hashes first, then env.
 * Deployed hosts require ≥12 characters (old 6-digit PINs no longer work).
 */
export function verifyEmployeeCredential(
  employeeId: string,
  pin: string,
  storeHashes?: Record<string, string> | null,
): boolean {
  if (!pin || pin.length > 64) return false;
  if (isDeployedHost() && pin.length < MIN_EMPLOYEE_SECRET_LEN) return false;
  if (!isDeployedHost() && pin.length < 4) return false;

  const stored = storeHashes?.[employeeId] || pinHashesFromEnv()?.[employeeId];
  if (stored) return verifyPin(pin, stored);
  if (!isDeployedHost()) return true;
  return false;
}

export function employeeLoginAvailable(): boolean {
  return true;
}
