import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

/** Demo employee PINs — sample only; hashes ship, plaintext only for local docs/UI hint. */
export const DEMO_EMPLOYEE_PINS: Record<string, string> = {
  "e-askar": "1111",
  "e-ann": "2222",
  "e-nurlan": "3333",
  "e-dana": "4444",
};

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

export function buildDemoPinHashes(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, pin] of Object.entries(DEMO_EMPLOYEE_PINS)) {
    // fixed salt per id so restarts keep same hash without DB
    const salt = Buffer.from(`qalqan-pin-${id}`).toString("hex").slice(0, 32);
    out[id] = hashPin(pin, salt);
  }
  return out;
}
