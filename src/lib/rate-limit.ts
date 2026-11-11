/**
 * Sliding-window rate limiter.
 * Uses Postgres when DATABASE_URL is set so counters are shared across isolates;
 * falls back to in-process Map locally.
 */

import {
  deleteSnapshot,
  hasDatabase,
  loadSnapshot,
  saveSnapshot,
} from "./db";

const buckets = new Map<string, number[]>();

type BucketPayload = { hits: number[] };

function memoryRateLimit(
  key: string,
  max: number,
  windowMs: number,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const prev = buckets.get(key) ?? [];
  const recent = prev.filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    buckets.set(key, recent);
    const oldest = recent[0] ?? now;
    const retryAfterSec = Math.max(
      1,
      Math.ceil((windowMs - (now - oldest)) / 1000),
    );
    return { ok: false, retryAfterSec };
  }
  recent.push(now);
  buckets.set(key, recent);
  if (buckets.size > 5_000) {
    const first = buckets.keys().next().value;
    if (first) buckets.delete(first);
  }
  return { ok: true };
}

function rowId(key: string): string {
  return `ratelimit:${key.slice(0, 180)}`;
}

export async function rateLimit(
  key: string,
  max: number,
  windowMs: number,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  if (!hasDatabase()) {
    return memoryRateLimit(key, max, windowMs);
  }

  const now = Date.now();
  const id = rowId(key);
  try {
    const snap = await loadSnapshot<BucketPayload>(id);
    const recent = (snap?.hits ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      await saveSnapshot(id, { hits: recent });
      const oldest = recent[0] ?? now;
      const retryAfterSec = Math.max(
        1,
        Math.ceil((windowMs - (now - oldest)) / 1000),
      );
      return { ok: false, retryAfterSec };
    }
    recent.push(now);
    await saveSnapshot(id, { hits: recent });
    return { ok: true };
  } catch {
    // If DB is unavailable, degrade to memory rather than open the floodgates.
    return memoryRateLimit(key, max, windowMs);
  }
}

/** Optional cleanup helper for tests / GC. */
export async function clearRateLimit(key: string): Promise<void> {
  buckets.delete(key);
  if (hasDatabase()) await deleteSnapshot(rowId(key));
}
