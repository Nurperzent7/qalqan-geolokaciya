/** Simple in-process sliding window limiter (per isolate). */

const buckets = new Map<string, number[]>();

export function rateLimit(
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
    const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
    return { ok: false, retryAfterSec };
  }
  recent.push(now);
  buckets.set(key, recent);
  // prevent unbounded map growth
  if (buckets.size > 5_000) {
    const first = buckets.keys().next().value;
    if (first) buckets.delete(first);
  }
  return { ok: true };
}
