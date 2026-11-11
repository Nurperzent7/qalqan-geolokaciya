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

/** Persisted session — never contains the bearer token. */
export type Session = {
  id: string;
  role: SessionRole;
  employeeId: string | null;
  name: string;
  createdAt: number;
  expiresAt: number;
  storeScope: string;
};

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const STORE_STALE_MS = SESSION_TTL_MS + 60 * 60 * 1000;

const g = globalThis as unknown as {
  /** Keyed by token hash — raw bearer never stored as map key in DB. */
  __geoSessionMem?: Map<string, Session>;
};

function mem(): Map<string, Session> {
  if (!g.__geoSessionMem) g.__geoSessionMem = new Map();
  return g.__geoSessionMem;
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function sessionRowIdFromHash(hash: string): string {
  return `session:${hash}`;
}

function sessionRowId(token: string): string {
  return sessionRowIdFromHash(tokenHash(token));
}

/** Legacy per-session sandbox key (GC only). */
export function storeScopeFromToken(token: string): string {
  return `sess:${tokenHash(token).slice(0, 32)}`;
}

async function dropSessionArtifacts(session: Session, tokenHashHex: string) {
  mem().delete(tokenHashHex);
  if (hasDatabase()) {
    await deleteSnapshot(sessionRowIdFromHash(tokenHashHex));
  }
  if (session.storeScope?.startsWith("sess:")) {
    await deleteStoreSnapshot(session.storeScope);
  }
}

async function gcExpired(): Promise<void> {
  if (!hasDatabase()) {
    const now = Date.now();
    for (const [hash, s] of mem()) {
      if (s.expiresAt <= now) {
        mem().delete(hash);
        if (s.storeScope?.startsWith("sess:")) {
          await deleteStoreSnapshot(s.storeScope);
        }
      }
    }
    return;
  }
  const expired = await deleteExpiredSessionSnapshots(Date.now());
  for (const row of expired) {
    if (row.storeScope?.startsWith("sess:")) {
      await deleteStoreSnapshot(row.storeScope);
    }
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
  const hash = tokenHash(token);
  // Opaque id — not the bearer token — so Postgres payloads stay safe if leaked.
  const session: Session = {
    id: randomBytes(16).toString("hex"),
    role: input.role,
    employeeId: input.employeeId,
    name: input.name,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
    storeScope: "live:company",
  };

  mem().set(hash, session);
  if (hasDatabase()) {
    await saveSnapshot(sessionRowIdFromHash(hash), session);
  }
  return { token, session };
}

export async function getSession(token: string | null): Promise<Session | null> {
  if (!token) return null;
  const hash = tokenHash(token);

  let session = mem().get(hash) ?? null;
  if (!session && hasDatabase()) {
    session = await loadSnapshot<Session>(sessionRowIdFromHash(hash));
    if (session) mem().set(hash, session);
  }
  if (!session) return null;

  if (session.expiresAt <= Date.now()) {
    await dropSessionArtifacts(session, hash);
    return null;
  }
  if (!session.storeScope) {
    session.storeScope = "live:company";
  }
  return session;
}

export async function revokeSession(token: string | null): Promise<void> {
  if (!token) return;
  const hash = tokenHash(token);
  const session =
    mem().get(hash) ??
    (hasDatabase()
      ? await loadSnapshot<Session>(sessionRowIdFromHash(hash))
      : null);
  if (!session) {
    if (hasDatabase()) await deleteSnapshot(sessionRowIdFromHash(hash));
    return;
  }
  await dropSessionArtifacts(session, hash);
}

export function adminSecretsMatch(presented: string): {
  ok: boolean;
  simulated: boolean;
  missing?: boolean;
} {
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
