/**
 * Push + pull workers. Both run on intervals and listen to visibility.
 * They are explicitly fire-and-forget — failures never propagate to gameplay.
 */
import { db } from "@/lib/db/orbita-db";
import { syncPush, syncPull } from "./sync.functions";
import { useSyncStore } from "./useSyncStore";
import type { Mutation, SyncEntity } from "./types";

const MAX_ATTEMPTS = 10;
const BATCH = 50;
const PULL_INTERVAL_MS = 60_000;
const PUSH_INTERVAL_MS = 4_000;

let pushTimer: ReturnType<typeof setInterval> | null = null;
let pullTimer: ReturnType<typeof setInterval> | null = null;
let started = false;
let pushing = false;
let pulling = false;

function backoff(attempts: number): number {
  const base = Math.min(60_000, 1_000 * 2 ** attempts);
  return Date.now() + base + Math.random() * 500;
}

async function refreshQueued() {
  try {
    const n = await db().outbox.where("status").notEqual("dead").count();
    useSyncStore.getState().setQueued(n);
  } catch {
    // ignore
  }
}

async function runPushOnce() {
  if (pushing) return;
  if (!useSyncStore.getState().signedIn) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    useSyncStore.getState().setStatus("offline");
    return;
  }
  pushing = true;
  try {
    const now = Date.now();
    const due = await db()
      .outbox.where("status")
      .equals("pending")
      .filter((r) => r.next_attempt_at <= now)
      .limit(BATCH)
      .toArray();
    if (due.length === 0) {
      await refreshQueued();
      const queued = useSyncStore.getState().queued;
      useSyncStore.getState().setStatus(queued > 0 ? "queued" : "synced");
      return;
    }
    useSyncStore.getState().setStatus("syncing");
    const ids = due.map((d) => d.id!).filter((x) => x != null);
    await db().outbox.where("id").anyOf(ids).modify({ status: "in_flight" });
    const mutations: Mutation[] = due.map((r) => ({
      op_id: r.op_id,
      entity: r.entity,
      op: r.op,
      payload: r.payload,
    }));
    try {
      const result = await syncPush({ data: { mutations } });
      const acceptedSet = new Set(result.accepted);
      const rejectedMap = new Map(result.rejected.map((r) => [r.op_id, r.reason]));
      for (const r of due) {
        if (acceptedSet.has(r.op_id)) {
          await db().outbox.delete(r.id!);
        } else if (rejectedMap.has(r.op_id)) {
          const reason = rejectedMap.get(r.op_id) ?? "rejected";
          const attempts = r.attempts + 1;
          if (attempts >= MAX_ATTEMPTS) {
            await db().outbox.update(r.id!, {
              status: "dead",
              last_error: reason,
              attempts,
            } as Partial<typeof r>);
          } else {
            await db().outbox.update(r.id!, {
              status: "pending",
              attempts,
              next_attempt_at: backoff(attempts),
              last_error: reason,
            } as Partial<typeof r>);
          }
        } else {
          await db().outbox.update(r.id!, { status: "pending" } as Partial<typeof r>);
        }
      }
      // apply canonical patches (country_progress only at the moment)
      for (const c of result.canonical) {
        if (c.entity === "country_progress") {
          const row = c.row as Record<string, unknown>;
          const iso3 = String(row.country_code);
          const skills = (row.skills ?? {}) as Record<string, unknown>;
          const versions = (row.skill_versions ?? {}) as Record<string, number>;
          try {
            const existing = await db().countryProgress.get(iso3);
            await db().countryProgress.put({
              iso3,
              skills: skills as never,
              skill_versions: versions as never,
              lastSeenAt: existing?.lastSeenAt ?? Date.now(),
              updated_at: Date.now(),
              dirty: 0,
            });
          } catch {
            // ignore
          }
        }
      }
      useSyncStore.getState().setLastPush(Date.now());
      useSyncStore.getState().setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "push failed";
      for (const r of due) {
        const attempts = r.attempts + 1;
        await db().outbox.update(r.id!, {
          status: attempts >= MAX_ATTEMPTS ? "dead" : "pending",
          attempts,
          next_attempt_at: backoff(attempts),
          last_error: msg,
        } as Partial<typeof r>);
      }
      useSyncStore.getState().setError(msg);
      useSyncStore.getState().setStatus("error");
    }
    await refreshQueued();
    const queued = useSyncStore.getState().queued;
    if (useSyncStore.getState().status !== "error") {
      useSyncStore.getState().setStatus(queued > 0 ? "queued" : "synced");
    }
  } finally {
    pushing = false;
  }
}

const CURSOR_KEYS: SyncEntity[] = [
  "country_progress",
  "sessions_log",
  "unlocks",
  "challenge_attempts",
  "daily_streak",
  "profiles",
];

async function getCursors(): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  for (const k of CURSOR_KEYS) {
    const row = await db().sync_meta.get(`cursor_${k}`);
    out[k] = row?.value ?? null;
  }
  return out;
}

async function runPullOnce() {
  if (pulling) return;
  if (!useSyncStore.getState().signedIn) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  pulling = true;
  try {
    const cursors = await getCursors();
    const result = await syncPull({ data: { cursors } });
    for (const [entity, payload] of Object.entries(result)) {
      if (!payload) continue;
      const rows = payload.rows ?? [];
      if (entity === "country_progress") {
        for (const r of rows) {
          const row = r as Record<string, unknown>;
          const iso3 = String(row.country_code);
          await db()
            .countryProgress.put({
              iso3,
              skills: (row.skills ?? {}) as never,
              skill_versions: (row.skill_versions ?? {}) as never,
              lastSeenAt: row.last_seen_at ? Date.parse(String(row.last_seen_at)) : Date.now(),
              updated_at: Date.now(),
              dirty: 0,
            })
            .catch(() => {});
        }
      } else if (entity === "unlocks") {
        for (const r of rows) {
          const row = r as Record<string, unknown>;
          await db()
            .unlocks.put({
              key: String(row.key),
              progress: Number(row.progress ?? 0),
              unlockedAt: row.unlocked_at ? Date.parse(String(row.unlocked_at)) : null,
              updatedAt: Date.now(),
            })
            .catch(() => {});
        }
      }
      // sessions_log / challenge_attempts / daily_streak / profiles are append-only;
      // we keep cursor advancing but do not mirror to Dexie (local is authoritative).
      await db()
        .sync_meta.put({ key: `cursor_${entity}`, value: payload.cursor })
        .catch(() => {});
    }
    useSyncStore.getState().setLastPull(Date.now());
    useSyncStore.getState().setError(null);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "pull failed";
    useSyncStore.getState().setError(msg);
  } finally {
    pulling = false;
  }
}

export function startSyncWorkers() {
  if (started) return;
  started = true;
  pushTimer = setInterval(() => void runPushOnce(), PUSH_INTERVAL_MS);
  pullTimer = setInterval(() => void runPullOnce(), PULL_INTERVAL_MS);
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibility);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
  }
  void runPullOnce();
  void runPushOnce();
}

export function stopSyncWorkers() {
  started = false;
  if (pushTimer) clearInterval(pushTimer);
  if (pullTimer) clearInterval(pullTimer);
  pushTimer = null;
  pullTimer = null;
  if (typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", onVisibility);
  }
  if (typeof window !== "undefined") {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
  }
}

function onVisibility() {
  if (document.visibilityState === "visible") {
    void runPullOnce();
    void runPushOnce();
  }
}
function onOnline() {
  void runPushOnce();
  void runPullOnce();
}
function onOffline() {
  useSyncStore.getState().setStatus("offline");
}

export function forceSync() {
  void runPullOnce();
  void runPushOnce();
}

/** Clear all pull cursors then trigger a fresh full pull. */
export async function forceFullResync() {
  try {
    for (const k of CURSOR_KEYS) {
      await db().sync_meta.delete(`cursor_${k}`).catch(() => {});
    }
  } catch {
    // ignore
  }
  void runPullOnce();
  void runPushOnce();
}

export { refreshQueued };
