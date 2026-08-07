/**
 * migrateGuestProgress.ts
 *
 * When a user signs in or creates an account, any FSRS progress accumulated
 * as a guest (stored in `orbita-local` IndexedDB) is atomically merged into
 * their personal DB (`orbita-${userId}`).
 *
 * Conflict resolution: whichever row has more FSRS repetitions wins — this
 * represents more genuine memory work. The guest DB is deleted after a
 * successful migration to prevent double-importing on future logins.
 */
import Dexie from "dexie";
import { createOrbitaDb, type OrbitaDB } from "@/lib/db/orbita-db";
import { authDebug } from "@/lib/auth/debug";

const GUEST_DB_NAME = "orbita-local";

export async function migrateGuestProgress(
  userDb: OrbitaDB,
  userId: string,
): Promise<{ migrated: number; skipped: number }> {
  const guestDbExists = await Dexie.exists(GUEST_DB_NAME);
  if (!guestDbExists) {
    authDebug("migrate:no_guest_db", { userId });
    return { migrated: 0, skipped: 0 };
  }

  const guestDb = createOrbitaDb(GUEST_DB_NAME);
  let migrated = 0;
  let skipped = 0;

  try {
    authDebug("migrate:start", { userId });

    // 1. concept_progress: merge by FSRS reps (more reps = more work done)
    const guestConcepts = await guestDb.concept_progress.toArray();
    if (guestConcepts.length > 0) {
      const existing = await userDb.concept_progress
        .where("conceptId").anyOf(guestConcepts.map((c) => c.conceptId)).toArray();
      const existingMap = new Map(existing.map((c) => [c.conceptId, c]));

      const toUpsert = guestConcepts
        .map((guest) => {
          const ex = existingMap.get(guest.conceptId);
          if (!ex || guest.fsrs_reps > ex.fsrs_reps) {
            return { ...guest, user_id: userId, dirty: 1 as const };
          }
          skipped++;
          return null;
        })
        .filter(Boolean) as typeof guestConcepts;

      if (toUpsert.length > 0) {
        await userDb.concept_progress.bulkPut(toUpsert);
        migrated += toUpsert.length;
      }
      authDebug("migrate:concept_progress", { upserted: toUpsert.length, skipped, userId });
    }

    // 2. question_history: append-only; op_id UUID prevents duplicates
    const guestHistory = await guestDb.question_history.toArray();
    if (guestHistory.length > 0) {
      await userDb.question_history.bulkPut(guestHistory).catch(() => {});
      migrated += guestHistory.length;
      authDebug("migrate:question_history", { count: guestHistory.length, userId });
    }

    // 3. gameSessions: strip auto-increment id; assign fresh op_id if missing
    const guestSessions = await guestDb.gameSessions.toArray();
    if (guestSessions.length > 0) {
      const rows = guestSessions.map(({ id: _id, ...rest }) => ({
        ...rest,
        op_id: rest.op_id ?? crypto.randomUUID(),
        dirty: 1 as const,
      }));
      await userDb.gameSessions.bulkPut(rows).catch(() => {});
      migrated += rows.length;
      authDebug("migrate:game_sessions", { count: rows.length, userId });
    }

    // 4. countryProgress (SM-2 legacy): merge skills, keep highest confidence
    const guestCP = await guestDb.countryProgress.toArray();
    if (guestCP.length > 0) {
      const exCP = await userDb.countryProgress
        .where("iso3").anyOf(guestCP.map((c) => c.iso3)).toArray();
      const exMap = new Map(exCP.map((c) => [c.iso3, c]));

      const rows = guestCP.map((guest) => {
        const ex = exMap.get(guest.iso3);
        if (!ex) return { ...guest, dirty: 1 as const };
        const mergedSkills = { ...ex.skills };
        for (const [skill, stat] of Object.entries(guest.skills)) {
          const exStat = ex.skills[skill as keyof typeof ex.skills];
          if (!exStat || (stat && stat.confidence > exStat.confidence)) {
            (mergedSkills as Record<string, typeof stat>)[skill] = stat;
          }
        }
        return {
          ...ex,
          skills: mergedSkills,
          lastSeenAt: Math.max(ex.lastSeenAt, guest.lastSeenAt),
          dirty: 1 as const,
        };
      });
      await userDb.countryProgress.bulkPut(rows).catch(() => {});
      authDebug("migrate:country_progress", { count: rows.length, userId });
    }

    // 5. unlocks: keep the more advanced progress
    const guestUnlocks = await guestDb.unlocks.toArray();
    if (guestUnlocks.length > 0) {
      const exUnlocks = await userDb.unlocks
        .where("key").anyOf(guestUnlocks.map((u) => u.key)).toArray();
      const exUnlockMap = new Map(exUnlocks.map((u) => [u.key, u]));
      const toUpsert = guestUnlocks.filter((g) => {
        const ex = exUnlockMap.get(g.key);
        return !ex || g.progress > ex.progress;
      });
      if (toUpsert.length > 0) {
        await userDb.unlocks.bulkPut(toUpsert).catch(() => {});
        authDebug("migrate:unlocks", { count: toUpsert.length, userId });
      }
    }

    // 6. Delete guest DB — prevents double-migration on future logins
    await guestDb.close();
    await Dexie.delete(GUEST_DB_NAME);
    authDebug("migrate:complete", { userId, migrated, skipped });
    return { migrated, skipped };
  } catch (err) {
    authDebug("migrate:error", { userId, error: err instanceof Error ? err.message : String(err) });
    return { migrated, skipped };
  } finally {
    try { guestDb.close(); } catch { /* ignore */ }
  }
}
