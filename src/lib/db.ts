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
