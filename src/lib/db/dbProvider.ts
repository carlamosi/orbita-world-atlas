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
  if (state.current) {
    try {
      state.current.close();
    } catch {
      // ignore
    }
  }
  state.name = next;
  state.current = createOrbitaDb(next);
  for (const l of state.listeners) {
    try {
      l(state.current);
    } catch {
      // ignore
    }
  }
  return state.current;
}

export function onSwap(fn: Listener): () => void {
  state.listeners.add(fn);
  return () => state.listeners.delete(fn);
}

export function currentDbName(): string {
  return state.name;
}
