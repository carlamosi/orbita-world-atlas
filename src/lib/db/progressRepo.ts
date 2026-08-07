import { db } from "./orbita-db";
import type { ConceptProgressRow, QuestionHistoryRow } from "./orbita-db";

/**
 * Retrieves a single concept's progress state from IndexedDB.
 */
export async function getConceptProgress(conceptId: string): Promise<ConceptProgressRow | undefined> {
  return await db().concept_progress.get(conceptId);
}

/**
 * Retrieves multiple concepts' progress states from IndexedDB.
 */
export async function getConceptsProgress(conceptIds: string[]): Promise<ConceptProgressRow[]> {
  const rows = await db().concept_progress.bulkGet(conceptIds);
  return rows.filter((r): r is ConceptProgressRow => r !== undefined);
}

/**
 * Atomically updates a concept's progress and logs the question history.
 * It also queues both records into the sync outbox for background syncing.
 */
export async function recordConceptAttempt(
  progressRow: ConceptProgressRow,
  historyRow: QuestionHistoryRow
): Promise<void> {
  await db().transaction("rw", db().concept_progress, db().question_history, db().outbox, async () => {
    // 1. Write the updated FSRS state
    progressRow.dirty = 1;
    progressRow.updated_at = Date.now();
    await db().concept_progress.put(progressRow);
    
    // 2. Append to the immutable question history
    await db().question_history.put(historyRow);
    
    // 3. Add to sync outbox
    const now = Date.now();
    await db().outbox.bulkAdd([
      {
        op_id: crypto.randomUUID(),
        entity: "concept_progress",
        op: "upsert",
        payload: progressRow as unknown as Record<string, unknown>,
        created_at: now,
        attempts: 0,
        next_attempt_at: 0,
        status: "pending",
      },
      {
        op_id: historyRow.op_id, // reuse the same op_id as the history row for idempotency
        entity: "question_history",
        op: "insert",
        payload: historyRow as unknown as Record<string, unknown>,
        created_at: now,
        attempts: 0,
        next_attempt_at: 0,
        status: "pending",
      }
    ]);
  });
}
