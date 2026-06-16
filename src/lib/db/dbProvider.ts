/**
 * Per-user Dexie DB provider.
 *
 * DB name pattern: `orbita-${serverUserId ?? 'local'}`. Anonymous users use
 * `orbita-local`. On sign-in, we swap to a per-user DB.
 *
 * The shared singleton ref lives here. `orbita-db.ts#db()` reads it and
 * initialises a default local DB synchronously if none exists yet.
 */
import { createOrbitaDb, type OrbitaDB } from "./orbita-db";

type Listener = (db: OrbitaDB) => void;

interface State {
  current: OrbitaDB | null;
  name: string;
  listeners: Set<Listener>;
}

const state: State = {
  current: null,
  name: "orbita-local",
  listeners: new Set(),
};

export function getCurrent(): OrbitaDB | null {
  return state.current;
}

export function setCurrent(db: OrbitaDB, name: string) {
  state.current = db;
  state.name = name;
}

export function getDbSync(): OrbitaDB {
  if (!state.current) throw new Error("Orbita DB not initialised");
  return state.current;
}

export async function ensureDb(): Promise<OrbitaDB> {
  if (state.current) return state.current;
  state.current = createOrbitaDb(state.name);
  return state.current;
}

export async function swap(userId: string | null): Promise<OrbitaDB> {
  const next = `orbita-${userId ?? "local"}`;
  if (state.current && state.name === next) return state.current;

  const prev = state.current;
  const prevName = state.name;
  const nextDb = createOrbitaDb(next);

  // Anonymous → signed-in promotion: if local has data and the per-user DB
  // is empty, copy rows across and enqueue them to the cloud.
  if (userId && prev && prevName === "orbita-local") {
    try {
      await mergeLocalIntoUserDb(prev, nextDb);
    } catch (e) {
      console.warn("[dbProvider] merge skipped:", e);
    }
  }

  if (prev) {
    try { prev.close(); } catch { /* ignore */ }
  }

  state.name = next;
  state.current = nextDb;
  for (const l of state.listeners) {
    try { l(state.current); } catch { /* ignore */ }
  }
  return state.current;
}

async function mergeLocalIntoUserDb(local: OrbitaDB, target: OrbitaDB) {
  const [progress, unlocks, sessions] = await Promise.all([
    local.countryProgress.toArray().catch(() => []),
    local.unlocks.toArray().catch(() => []),
    local.gameSessions.toArray().catch(() => []),
  ]);
  const targetCount = await target.countryProgress.count().catch(() => 0);
  if (targetCount > 0) return;
  const { getClientId, newOpId } = await import("@/lib/sync/clientId");
  const cid = getClientId();
  const now = Date.now();

  if (progress.length) await target.countryProgress.bulkPut(progress).catch(() => {});
  if (unlocks.length) await target.unlocks.bulkPut(unlocks).catch(() => {});
  if (sessions.length) await target.gameSessions.bulkPut(sessions).catch(() => {});

  const rows = [
    ...progress.map((r) => ({
      op_id: newOpId(),
      entity: "country_progress" as const,
      op: "upsert" as const,
      payload: {
        country_code: r.iso3,
        skills: r.skills,
        skill_versions: r.skill_versions ?? {},
        last_seen_at: new Date(r.lastSeenAt || now).toISOString(),
        client_id: cid,
      },
      created_at: now,
      attempts: 0,
      next_attempt_at: now,
      status: "pending" as const,
    })),
    ...unlocks.map((u) => ({
      op_id: newOpId(),
      entity: "unlocks" as const,
      op: "upsert" as const,
      payload: {
        key: u.key,
        progress: u.progress,
        unlocked_at: u.unlockedAt ? new Date(u.unlockedAt).toISOString() : null,
        client_id: cid,
      },
      created_at: now,
      attempts: 0,
      next_attempt_at: now,
      status: "pending" as const,
    })),
  ];
  if (rows.length) await target.outbox.bulkPut(rows).catch(() => {});
}

export function onSwap(fn: Listener): () => void {
  state.listeners.add(fn);
  return () => state.listeners.delete(fn);
}

export function currentDbName(): string {
  return state.name;
}
