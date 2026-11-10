import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { loadSnapshot, saveSnapshot, hasDatabase } from "./db";

export type SessionRole = "admin" | "employee";

export type Session = {
  id: string;
  role: SessionRole;
  /** Set for employee sessions — data scope. */
  employeeId: string | null;
  name: string;
  createdAt: number;
  expiresAt: number;
};

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const SNAPSHOT_ID = "sessions";

type SessionStore = { sessions: Record<string, Session> };

const g = globalThis as unknown as {
  __geoSessions?: SessionStore;
  __geoSessionsHydrate?: Promise<void>;
};

function emptyStore(): SessionStore {
  return { sessions: {} };
}

function getMem(): SessionStore {
  if (!g.__geoSessions) g.__geoSessions = emptyStore();
  return g.__geoSessions;
}

async function hydrate(): Promise<SessionStore> {
  if (!hasDatabase()) return getMem();
  if (!g.__geoSessionsHydrate) {
    g.__geoSessionsHydrate = (async () => {
      const snap = await loadSnapshot<SessionStore>(SNAPSHOT_ID);
      g.__geoSessions = snap?.sessions ? snap : emptyStore();
      pruneExpired(g.__geoSessions);
    })();
  }
  await g.__geoSessionsHydrate;
  return getMem();
}

function pruneExpired(store: SessionStore) {
  const now = Date.now();
  for (const [id, s] of Object.entries(store.sessions)) {
    if (s.expiresAt <= now) delete store.sessions[id];
  }
}

async function persist(store: SessionStore) {
  if (!hasDatabase()) return;
  await saveSnapshot(SNAPSHOT_ID, store);
}

export async function createSession(input: {
  role: SessionRole;
  employeeId: string | null;
  name: string;
}): Promise<{ token: string; session: Session }> {
  const store = await hydrate();
  pruneExpired(store);
  const token = randomBytes(32).toString("hex");
  const session: Session = {
    id: token,
    role: input.role,
    employeeId: input.employeeId,
    name: input.name,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  store.sessions[token] = session;
  await persist(store);
  return { token, session };
}

export async function getSession(token: string | null): Promise<Session | null> {
  if (!token) return null;
  const store = await hydrate();
  pruneExpired(store);
  const session = store.sessions[token];
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    delete store.sessions[token];
    await persist(store);
    return null;
  }
  return session;
}

export async function revokeSession(token: string | null): Promise<void> {
  if (!token) return;
  const store = await hydrate();
  if (store.sessions[token]) {
    delete store.sessions[token];
    await persist(store);
  }
}

export function adminSecretsMatch(presented: string): {
  ok: boolean;
  simulated: boolean;
} {
  const expected = process.env.APP_ADMIN_TOKEN?.trim();
  if (!expected || !presented) {
    return { ok: false, simulated: false };
  }
  return { ok: secretsEqual(presented, expected), simulated: false };
}

function secretsEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}
