/**
 * Per-user Dexie DB provider.
 *
 * DB name pattern: `orbita-${serverUserId ?? 'local'}`.
 * Anonymous users use `orbita-local`. On sign-in, we swap to a per-user DB.
 * Existing repo code calls `db()` from orbita-db; that file delegates here.
 */
import type { OrbitaDB } from "./orbita-db";

type Listener = (db: OrbitaDB) => void;

let _current: OrbitaDB | null = null;
let _currentName = "orbita-local";
const _listeners = new Set<Listener>();

async function createDb(name: string): Promise<OrbitaDB> {
  const mod = await import("./orbita-db");
  return mod.createOrbitaDb(name);
}

export function getDbSync(): OrbitaDB {
  if (!_current) throw new Error("Orbita DB not initialised; call ensureDb() first");
  return _current;
}

export async function ensureDb(): Promise<OrbitaDB> {
  if (_current) return _current;
  _current = await createDb(_currentName);
  return _current;
}

/** Swap to a different user DB (or back to local on sign-out). */
export async function swap(userId: string | null): Promise<OrbitaDB> {
  const next = `orbita-${userId ?? "local"}`;
  if (_current && next === _currentName) return _current;
  if (_current) {
    try {
      _current.close();
    } catch {
      // ignore
    }
  }
  _currentName = next;
  _current = await createDb(next);
  for (const l of _listeners) {
    try {
      l(_current);
    } catch {
      // ignore
    }
  }
  return _current;
}

export function onSwap(fn: Listener): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function currentDbName(): string {
  return _currentName;
}
