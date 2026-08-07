import { create, type StoreApi, type UseBoundStore } from "zustand";
import { COUNTRIES } from "@/lib/countries";
import type { Country } from "@/types/country";
import { generateSessionQueue } from "@/lib/fsrs/planner";
import { assess } from "@/lib/fsrs/assessment";
import { updateFsrs } from "@/lib/fsrs/engine";
import { recordConceptAttempt } from "@/lib/db/progressRepo";
import { db, type ConceptProgressRow, type GameMode, type Skill } from "@/lib/db/orbita-db";
import { recordSessionEnd } from "@/lib/db/repo";

export type AnswerState = "idle" | "correct" | "wrong" | "revealed";
export const QUESTIONS_PER_SESSION = 20;

export interface SessionState {
  queue: Country[];
  conceptQueue: (ConceptProgressRow | null)[];
  index: number;
  score: number;
  combo: number;
  bestCombo: number;
  correct: number;
  wrong: number;
  answerState: AnswerState;
  startedAt: number;
  endedAt: number | null;
  loading: boolean;
  /** Epoch ms when the current question became visible. */
  questionStartedAt: number;

  current(): Country | null;
  /** Start a session. Pass `allCountries` for Complete Continent mode
   * (every country played exactly once in random order). Pass `continent`
   * for Quick Practice (20 weighted questions). */
  start(opts?: { continent?: string; allCountries?: Country[] }): Promise<void>;
  submit(isCorrect: boolean): void;
  reveal(): void;
  next(): void;
}

interface CreateOpts {
  mode: GameMode;
  skill: Skill;
  questions?: number;
}

/**
 * Shared turn-based session engine for Find / Name / Flags / Capitals and
 * Weekly Challenge. Speed Round does NOT extend this — it uses its own
 * runtime store (see `src/features/speed/speedRuntimeStore.ts`) because
 * timer ticks and combo decay have very different re-render constraints.
 */
export function createSessionStore({
  mode,
  skill,
  questions = QUESTIONS_PER_SESSION,
}: CreateOpts): UseBoundStore<StoreApi<SessionState>> {
  return create<SessionState>((set, get) => ({
    queue: [],
    conceptQueue: [],
    index: 0,
    score: 0,
    combo: 0,
    bestCombo: 0,
    correct: 0,
    wrong: 0,
    answerState: "idle",
    startedAt: 0,
    endedAt: null,
    loading: false,
    questionStartedAt: 0,

    current() {
      const s = get();
      return s.queue[s.index] ?? null;
    },

    async start(opts) {
      set({
        loading: true,
        queue: [],
        conceptQueue: [],
        index: 0,
        score: 0,
        combo: 0,
        bestCombo: 0,
        correct: 0,
        wrong: 0,
        answerState: "idle",
        startedAt: 0,
        endedAt: null,
        questionStartedAt: 0,
      });

      let q: Country[] = [];
      let cq: (ConceptProgressRow | null)[] = [];
      
      if (opts?.allCountries && opts.allCountries.length > 0) {
        // Complete Continent mode: use the pre-built shuffled array directly.
        q = [...opts.allCountries];
        for (let i = q.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [q[i], q[j]] = [q[j]!, q[i]!];
        }
        cq = Array(q.length).fill(null);
      } else {
        // FSRS session planner
        const allConcepts = await db().concept_progress.where("skill").equals(skill).toArray();
        let pool = allConcepts;
        
        if (opts?.continent && opts.continent !== "All") {
          const validIso3s = new Set(COUNTRIES.filter(c => c.continent === opts.continent).map(c => c.iso3));
          pool = allConcepts.filter(c => validIso3s.has(c.iso3));
        }
        
        // If there are not enough concepts seeded yet (e.g. fresh install), create dummy ones
        if (pool.length < questions) {
          const used = new Set(pool.map(c => c.iso3));
          const candidates = COUNTRIES.filter(c => !opts?.continent || opts.continent === "All" || c.continent === opts.continent);
          for (const c of candidates) {
            if (pool.length >= questions) break;
            if (!used.has(c.iso3)) {
              pool.push({
                conceptId: `${c.iso3}:${skill}`,
                iso3: c.iso3,
                skill,
                fsrs_state: "new",
                fsrs_stability: null,
                fsrs_difficulty: null,
                fsrs_due: 0,
                fsrs_reps: 0,
                fsrs_lapses: 0,
                fsrs_last_review: 0,
                updated_at: Date.now(),
                version: 1,
                dirty: 0
              });
              used.add(c.iso3);
            }
          }
        }
        
        const plannedConcepts = generateSessionQueue(pool, undefined, { sessionSize: questions });
        
        const isoToCountry = new Map(COUNTRIES.map(c => [c.iso3, c]));
        q = plannedConcepts.map(c => isoToCountry.get(c.iso3)!).filter(Boolean);
        cq = plannedConcepts;
      }

      const now = Date.now();
      set({
        queue: q,
        conceptQueue: cq,
        index: 0,
        score: 0,
        combo: 0,
        bestCombo: 0,
        correct: 0,
        wrong: 0,
        answerState: "idle",
        startedAt: now,
        endedAt: null,
        loading: false,
        questionStartedAt: now,
      });
    },

    submit(isCorrect) {
      const s = get();
      if (s.answerState !== "idle") return;
      const target = s.queue[s.index];
      const targetConcept = s.conceptQueue[s.index];
      if (!target) return;
      const responseMs = Math.max(0, Date.now() - (s.questionStartedAt || Date.now()));
      if (isCorrect) {
        const combo = s.combo + 1;
        const base = 100;
        const comboBonus = Math.min(combo - 1, 9) * 20;
        const gained = base + comboBonus;
        set({
          score: s.score + gained,
          combo,
          bestCombo: Math.max(s.bestCombo, combo),
          correct: s.correct + 1,
          answerState: "correct",
        });
      } else {
        set({ combo: 0, wrong: s.wrong + 1, answerState: "wrong" });
      }
      
      // Integrate FSRS Assessment and Write
      if (targetConcept) {
        const now = Date.now();
        const overdueMs = Math.max(0, now - targetConcept.fsrs_due);
        const grade = assess({
          validationResult: { correct: isCorrect, softCorrect: false }, // we can refine softCorrect later for maps
          responseMs,
          attemptNumber: 1, // multiple attempts logic can be expanded later
          hintsUsed: 0,
          questionType: skill,
          memoryState: null,
          overdueMs
        });
        
        const currentFsrs = {
          state: targetConcept.fsrs_state,
          stability: targetConcept.fsrs_stability,
          difficulty: targetConcept.fsrs_difficulty,
          due: targetConcept.fsrs_due,
          lastReviewAt: targetConcept.fsrs_last_review,
          reps: targetConcept.fsrs_reps,
          lapses: targetConcept.fsrs_lapses,
          learningStep: 0, // transient
          lastGrade: null,
        };
        
        const nextFsrs = updateFsrs(currentFsrs, grade, now);
        
        const updatedProgressRow: ConceptProgressRow = {
          ...targetConcept,
          fsrs_state: nextFsrs.state,
          fsrs_stability: nextFsrs.stability,
          fsrs_difficulty: nextFsrs.difficulty,
          fsrs_due: nextFsrs.due,
          fsrs_last_review: nextFsrs.lastReviewAt,
          fsrs_reps: nextFsrs.reps,
          fsrs_lapses: nextFsrs.lapses,
          version: targetConcept.version + 1,
          dirty: 1,
          updated_at: now
        };
        
        recordConceptAttempt(
          updatedProgressRow,
          {
            op_id: crypto.randomUUID(),
            conceptId: targetConcept.conceptId,
            sessionId: "session-" + s.startedAt,
            grade,
            responseMs,
            correct: isCorrect,
            answeredAt: now
          }
        ).catch(console.error);
        
        // Mutate the local queue item so any next() sees the updated state (if needed)
        s.conceptQueue[s.index] = updatedProgressRow;
      }
    },

    reveal() {
      set({ answerState: "revealed" });
    },

    next() {
      const s = get();
      const nextIndex = s.index + 1;
      if (nextIndex >= s.queue.length) {
        const endedAt = Date.now();
        set({ endedAt, answerState: "idle", combo: 0 });
        recordSessionEnd({
          mode,
          skill,
          score: s.score,
          totalQuestions: s.queue.length,
          correct: s.correct,
          wrong: s.wrong,
          bestCombo: s.bestCombo,
          durationMs: endedAt - s.startedAt,
          createdAt: endedAt,
        });
        // Signal the SaveProgressNudge for guest users
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("orbita:session-end", { detail: { score: s.score, correct: s.correct } }));
        }
        return;
      }
      set({
        index: nextIndex,
        answerState: "idle",
        questionStartedAt: Date.now(),
      });
    },
  }));
}
