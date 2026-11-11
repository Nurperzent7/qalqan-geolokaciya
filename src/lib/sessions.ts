import { createHash, randomBytes, timingSafeEqual } from "crypto";
import {
  deleteExpiredSessionSnapshots,
  deleteSnapshot,
  deleteStaleStoreSnapshots,
  hasDatabase,
  loadSnapshot,
  saveSnapshot,
} from "./db";
import { deleteStoreSnapshot } from "./store";

export type SessionRole = "admin" | "employee";

export type Session = {
  id: string;
  role: SessionRole;
  /** Set for employee sessions — data scope. */
  employeeId: string | null;
  name: string;
  createdAt: number;
  expiresAt: number;
  /** Postgres sandbox key for this session's store (store:{storeScope}). */
  storeScope: string;
};

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const STORE_STALE_MS = SESSION_TTL_MS + 60 * 60 * 1000;

const g = globalThis as unknown as {
  __geoSessionMem?: Map<string, Session>;
};

function mem(): Map<string, Session> {
  if (!g.__geoSessionMem) g.__geoSessionMem = new Map();
  return g.__geoSessionMem;
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function sessionRowId(token: string): string {
  return `session:${tokenHash(token)}`;
}

/** Same derivation as storeScopeFor(session principal). */
export function storeScopeFromToken(token: string): string {
  return `sess:${tokenHash(token).slice(0, 32)}`;
}

async function dropSessionArtifacts(session: Session, token: string) {
  mem().delete(token);
  if (hasDatabase()) {
    await deleteSnapshot(sessionRowId(token));
  }
  await deleteStoreSnapshot(session.storeScope);
}

async function gcExpired(): Promise<void> {
  if (!hasDatabase()) {
    const now = Date.now();
    for (const [token, s] of mem()) {
      if (s.expiresAt <= now) {
        mem().delete(token);
        await deleteStoreSnapshot(s.storeScope);
      }
    }
    return;
  }
  const expired = await deleteExpiredSessionSnapshots(Date.now());
  for (const row of expired) {
    if (row.storeScope) await deleteStoreSnapshot(row.storeScope);
  }
  await deleteStaleStoreSnapshots(STORE_STALE_MS);
}

export async function createSession(input: {
  role: SessionRole;
  employeeId: string | null;
  name: string;
}): Promise<{ token: string; session: Session }> {
  await gcExpired().catch(() => {
    /* best-effort cleanup */
  });

  const token = randomBytes(32).toString("hex");
  const session: Session = {
    id: token,
    role: input.role,
    employeeId: input.employeeId,
    name: input.name,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
    storeScope: storeScopeFromToken(token),
  };

  mem().set(token, session);
  if (hasDatabase()) {
    await saveSnapshot(sessionRowId(token), session);
  }
  return { token, session };
}

export async function getSession(token: string | null): Promise<Session | null> {
  if (!token) return null;

  let session = mem().get(token) ?? null;
  if (!session && hasDatabase()) {
    session = await loadSnapshot<Session>(sessionRowId(token));
    if (session) mem().set(token, session);
  }
  if (!session) return null;

  if (session.expiresAt <= Date.now()) {
    await dropSessionArtifacts(session, token);
    return null;
  }
  // Backfill storeScope for any legacy rows
  if (!session.storeScope) {
    session.storeScope = storeScopeFromToken(token);
  }
  return session;
}

export async function revokeSession(token: string | null): Promise<void> {
  if (!token) return;
  const session =
    mem().get(token) ??
    (hasDatabase() ? await loadSnapshot<Session>(sessionRowId(token)) : null);
  if (!session) {
    // Still try store cleanup from token derivation
    await deleteStoreSnapshot(storeScopeFromToken(token));
    if (hasDatabase()) await deleteSnapshot(sessionRowId(token));
    return;
  }
  await dropSessionArtifacts(
    { ...session, storeScope: session.storeScope || storeScopeFromToken(token) },
    token,
  );
}

export function adminSecretsMatch(presented: string): {
  ok: boolean;
  simulated: boolean;
  missing?: boolean;
} {
  // Dynamic key so Next never inlines an empty value at build time
  const raw = process.env["APP_ADMIN_TOKEN"];
  const expected = raw?.trim().replace(/^["']|["']$/g, "") ?? "";
  const got = presented.trim().replace(/^["']|["']$/g, "");
  if (!expected) {
    return { ok: false, simulated: false, missing: true };
  }
  if (!got) {
    return { ok: false, simulated: false };
  }
  return { ok: secretsEqual(got, expected), simulated: false };
}

function secretsEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}
