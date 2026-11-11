import { Pool } from "pg";

let pool: Pool | null = null;
let migrated = false;

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getPool(): Pool | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      max: 3,
    });
  }
  return pool;
}

export async function ensureSchema(): Promise<void> {
  const p = getPool();
  if (!p || migrated) return;
  await p.query(`
    CREATE TABLE IF NOT EXISTS app_snapshot (
      id TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  migrated = true;
}

export async function loadSnapshot<T>(id: string): Promise<T | null> {
  const p = getPool();
  if (!p) return null;
  await ensureSchema();
  const res = await p.query<{ payload: T }>(
    "SELECT payload FROM app_snapshot WHERE id = $1",
    [id],
  );
  return res.rows[0]?.payload ?? null;
}

export async function saveSnapshot(id: string, payload: unknown): Promise<void> {
  const p = getPool();
  if (!p) return;
  await ensureSchema();
  await p.query(
    `INSERT INTO app_snapshot (id, payload, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (id) DO UPDATE
     SET payload = EXCLUDED.payload, updated_at = now()`,
    [id, JSON.stringify(payload)],
  );
}

export async function deleteSnapshot(id: string): Promise<void> {
  const p = getPool();
  if (!p) return;
  await ensureSchema();
  await p.query("DELETE FROM app_snapshot WHERE id = $1", [id]);
}

/** Remove expired per-session rows; returns their payloads for store cleanup. */
export async function deleteExpiredSessionSnapshots(
  nowMs: number,
): Promise<Array<{ storeScope?: string }>> {
  const p = getPool();
  if (!p) return [];
  await ensureSchema();
  const res = await p.query<{ payload: { storeScope?: string } }>(
    `DELETE FROM app_snapshot
     WHERE id LIKE 'session:%'
       AND COALESCE((payload->>'expiresAt')::bigint, 0) <= $1
     RETURNING payload`,
    [nowMs],
  );
  return res.rows.map((r) => r.payload);
}

/** Drop orphaned session sandboxes older than the session TTL window. */
export async function deleteStaleStoreSnapshots(
  olderThanMs: number,
): Promise<number> {
  const p = getPool();
  if (!p) return 0;
  await ensureSchema();
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  const res = await p.query(
    `DELETE FROM app_snapshot
     WHERE id LIKE 'store:sess:%'
       AND updated_at < $1::timestamptz`,
    [cutoff],
  );
  return res.rowCount ?? 0;
}
