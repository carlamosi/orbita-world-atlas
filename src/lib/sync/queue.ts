/**
 * Sync queue helpers.
 *
 * Supabase is the sole backend for ORBITA. Dexie is the offline cache and
 * write-ahead outbox; this module enqueues mutations locally and the push
 * worker drains them through the Supabase `sync_push` RPC. No alternative
 * backend exists — there is no edge-function fallback, no hybrid layer.
 *
 * All writes are fire-and-forget against the local Dexie outbox — no
 * network calls happen here. The push worker drains it.
 */

import { db } from "@/lib/db/orbita-db";
import { getClientId, newOpId } from "./clientId";
import type { SyncEntity } from "./types";
import type { OutboxRow } from "@/lib/db/orbita-db";

export interface EnqueueArgs {
  op_id?: string;
  entity: SyncEntity;
  op: "insert" | "upsert";
  payload: Record<string, unknown>;
}

export function buildEnqueueRow(args: EnqueueArgs): OutboxRow {
  const payload = { ...args.payload, client_id: getClientId() };
  return {
    op_id: args.op_id ?? newOpId(),
    entity: args.entity,
    op: args.op,
    payload,
    created_at: Date.now(),
    attempts: 0,
    next_attempt_at: Date.now(),
    status: "pending",
  };
}

/** Fire-and-forget enqueue used from the gameplay hot path. */
export function enqueue(args: EnqueueArgs): void {
  if (typeof window === "undefined") return;
  try {
    const row = buildEnqueueRow(args);
    void db().outbox.put(row).catch(() => {});
  } catch {
    // swallow — sync failures must never affect gameplay
  }
}
