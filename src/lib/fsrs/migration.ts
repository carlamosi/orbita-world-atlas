import { db } from "../db/orbita-db";
import type { ConceptProgressRow, SkillStat, Skill } from "../db/orbita-db";
import { createNewState } from "./engine";

/**
 * Seeds the new FSRS `concept_progress` table from the legacy SM-2 `countryProgress` table.
 * 
 * Formula mappings (SM-2 to FSRS-5 approximation):
 * - stability = max(1, interval * 0.9) (SM-2 intervals are slightly optimistic)
 * - difficulty = map(ef) from [1.3, 2.5] -> [10, 1] 
 * - due = nextReviewAt
 */
export async function seedFsrsFromSm2(): Promise<void> {
  const legacyRows = await db().countryProgress.toArray();
  const newConcepts: ConceptProgressRow[] = [];
  
  const now = Date.now();
  
  for (const row of legacyRows) {
    const iso3 = row.iso3;
    const skills = row.skills as Partial<Record<Skill, SkillStat>>;
    
    // We only migrate the 3 core concepts. "name" is legacy.
    for (const skill of ["location", "capital", "flag"] as Skill[]) {
      const stat = skills[skill];
      if (!stat) continue;
      
      const conceptId = `${iso3}:${skill}`;
      const fsrs = createNewState(now);
      fsrs.reps = stat.timesRight + stat.timesWrong;
      
      if (stat.srs) {
        fsrs.state = "review";
        fsrs.due = stat.srs.nextReviewAt;
        fsrs.lastReviewAt = stat.srs.lastReviewedAt;
        fsrs.stability = Math.max(1, stat.srs.interval * 0.9);
        
        // SM-2 EF ranges roughly 1.3 (hard) to 2.5 (easy). FSRS D ranges 10 (hard) to 1 (easy).
        // Linear mapping: D = 10 - ((EF - 1.3) / 1.2) * 9
        const ef = Math.min(2.5, Math.max(1.3, stat.srs.ef));
        const difficulty = 10 - ((ef - 1.3) / 1.2) * 9;
        fsrs.difficulty = Math.max(1, Math.min(10, difficulty));
      } else if (stat.confidence > 0) {
        // Fallback for very old data without 'srs' object
        fsrs.state = "review";
        fsrs.stability = Math.max(1, stat.confidence * 10);
        fsrs.difficulty = 5;
        fsrs.due = stat.lastSeenAt + (fsrs.stability * 86400000);
        fsrs.lastReviewAt = stat.lastSeenAt;
      }
      
      newConcepts.push({
        conceptId,
        iso3,
        skill,
        fsrs_state: fsrs.state,
        fsrs_stability: fsrs.stability,
        fsrs_difficulty: fsrs.difficulty,
        fsrs_due: fsrs.due,
        fsrs_reps: fsrs.reps,
        fsrs_lapses: stat.timesWrong,
        fsrs_last_review: fsrs.lastReviewAt,
        updated_at: now,
        version: 1,
        dirty: 1 // Trigger sync for the newly seeded FSRS rows
      });
    }
  }
  
  if (newConcepts.length > 0) {
    await db().transaction("rw", db().concept_progress, async () => {
      // Use put to avoid throwing on duplicate keys if migration runs twice
      await db().concept_progress.bulkPut(newConcepts);
    });
    console.log(`Migrated ${newConcepts.length} concepts from SM-2 to FSRS.`);
  }
}
