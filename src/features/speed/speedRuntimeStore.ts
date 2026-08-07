import { create } from "zustand";
import type { Country } from "@/types/country";
import type { Skill } from "@/lib/db/orbita-db";
import { selectMixedQuestions } from "@/lib/mastery";
import { recordSessionEnd } from "@/lib/db/repo";
import { assess } from "@/lib/fsrs/assessment";
import { updateFsrs } from "@/lib/fsrs/engine";
import { recordConceptAttempt, getConceptProgress } from "@/lib/db/progressRepo";

/**
 * Speed Runtime — decoupled from the turn-based session engine.
 *
 * Why decoupled: 250ms timer ticks would otherwise re-render the entire
 * session tree; combo / lives mutate per-answer rather than per-question;
 * questions are pre-batched into a queue. Persistence still routes through
 * the same repo layer (Dexie cache → outbox → Supabase RPC).
 */

export type SpeedMode = "sprint60" | "marathon120" | "suddenDeath";

export interface SpeedConfig {
  mode: SpeedMode;
  continent: string;
}

interface SpeedItem {
  country: Country;
  skill: Skill;
  options: Country[];
  shownAt: number;
}

export interface SpeedState {
  config: SpeedConfig;
  status: "idle" | "running" | "ended";

  queue: SpeedItem[];
  index: number;

  timeRemainingMs: number;
  score: number;
  combo: number;
  bestCombo: number;
  lives: number;
  correct: number;
  wrong: number;

  startedAt: number;
  endedAt: number | null;

  setConfig: (patch: Partial<SpeedConfig>) => void;
  start: (mode?: SpeedMode) => Promise<void>;
  answer: (iso3: string) => void;
  skip: () => void;
  reset: () => void;
}

const SPRINT_MS = 60_000;
const MARATHON_MS = 120_000;
const TICK_MS = 250;

function modeDurationMs(m: SpeedMode): number {
  if (m === "sprint60") return SPRINT_MS;
  if (m === "marathon120") return MARATHON_MS;
  return Number.POSITIVE_INFINITY;
}

function startingLives(m: SpeedMode): number {
  return m === "suddenDeath" ? 3 : Infinity;
}

// Module-level timer registry — survives store re-init, drained by reset().
let tickHandle: ReturnType<typeof setInterval> | null = null;
const pendingTimeouts = new Set<ReturnType<typeof setTimeout>>();
// Monotonically-incrementing token: lets start()'s async continuation detect
// whether reset() was called while the queue was being built.
let currentStartToken = 0;

function clearAllTimers() {
  if (tickHandle) {
    clearInterval(tickHandle);
    tickHandle = null;
  }
  for (const t of pendingTimeouts) clearTimeout(t);
  pendingTimeouts.clear();
}

/** Call this when an external action (reset/setConfig) should abort any
 * in-flight start() continuation. Do NOT call inside start() itself. */
function invalidateStart() {
  currentStartToken++;
}

function makeOptions(target: Country, all: readonly Country[]): Country[] {
  const pool = all.filter((c) => c.iso3 !== target.iso3);
  const out: Country[] = [target];
  while (out.length < 4) {
    const cand = pool[Math.floor(Math.random() * pool.length)]!;
    if (!out.includes(cand)) out.push(cand);
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const INITIAL_STATE = {
  status: "idle" as const,
  queue: [] as SpeedItem[],
  index: 0,
  timeRemainingMs: SPRINT_MS,
  score: 0,
  combo: 0,
  bestCombo: 0,
  lives: Infinity as number,
  correct: 0,
  wrong: 0,
  startedAt: 0,
  endedAt: null as number | null,
};

export const useSpeedRuntime = create<SpeedState>((set, get) => ({
  config: { mode: "sprint60", continent: "All" },
  ...INITIAL_STATE,

  setConfig(patch) {
    // Changing the mode mid-idle MUST also hard-reset the timer/queue UI so
    // pre-game previews and time rings reflect the new mode immediately.
    const next = { ...get().config, ...patch };
    clearAllTimers();
    invalidateStart(); // abort any in-flight start() for the previous config
    set({
      config: next,
      ...INITIAL_STATE,
      timeRemainingMs: modeDurationMs(next.mode),
      lives: startingLives(next.mode),
    });
  },

  async start(modeOverride) {
    // Always hard-reset first — no in-place mutation, no stale closures.
    // Invalidate before clearing timers, then capture our own fresh token.
    invalidateStart();
    clearAllTimers();
    const token = currentStartToken;  // our generation — valid until next invalidateStart()

    const config = modeOverride
      ? { ...get().config, mode: modeOverride }
      : get().config;

    set({
      config,
      ...INITIAL_STATE,
      timeRemainingMs: modeDurationMs(config.mode),
      lives: startingLives(config.mode),
    });

    const { COUNTRIES } = await import("@/lib/countries");
    const picks = await selectMixedQuestions(
      80,
      ["name", "flag", "capital", "location"],
      { continent: config.continent === "All" ? undefined : config.continent },
    );
    const now = Date.now();
    const queue: SpeedItem[] = picks.map((p) => ({
      country: p.country,
      skill: p.skill,
      options: makeOptions(p.country, COUNTRIES),
      shownAt: now,
    }));

    // If reset() was called while building the queue, abort cleanly.
    if (token !== currentStartToken) return;

    set({
      status: "running",
      queue,
      index: 0,
      timeRemainingMs: modeDurationMs(config.mode),
      score: 0,
      combo: 0,
      bestCombo: 0,
      lives: startingLives(config.mode),
      correct: 0,
      wrong: 0,
      startedAt: now,
      endedAt: null,
    });

    if (Number.isFinite(modeDurationMs(config.mode))) {
      const startedAt = now;
      const total = modeDurationMs(config.mode);
      tickHandle = setInterval(() => {
        if (useSpeedRuntime.getState().status !== "running") {
          clearAllTimers();
          return;
        }
        const elapsed = Date.now() - startedAt;
        const remaining = Math.max(0, total - elapsed);
        if (remaining <= 0) {
          finalize();
          return;
        }
        useSpeedRuntime.setState({ timeRemainingMs: remaining });
      }, TICK_MS);
    }
  },

  answer(iso3) {
    const s = get();
    if (s.status !== "running") return;
    const item = s.queue[s.index];
    if (!item) return;
    const isCorrect = item.country.iso3 === iso3;
    const responseMs = Math.max(0, Date.now() - item.shownAt);
    const now = Date.now();
    
    getConceptProgress(`${item.country.iso3}:${item.skill}`).then((targetConcept) => {
      if (!targetConcept) return;
      const overdueMs = Math.max(0, now - targetConcept.fsrs_due);
      const grade = assess({
        validationResult: { correct: isCorrect, softCorrect: false },
        responseMs,
        attemptNumber: 1,
        hintsUsed: 0,
        questionType: item.skill,
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
        learningStep: 0,
        lastGrade: null,
      };
      
      const nextFsrs = updateFsrs(currentFsrs, grade, now);
      
      recordConceptAttempt({
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
      }, {
        op_id: crypto.randomUUID(),
        conceptId: targetConcept.conceptId,
        sessionId: "speed-" + s.startedAt,
        grade,
        responseMs,
        correct: isCorrect,
        answeredAt: now
      }).catch(console.error);
    });

    if (isCorrect) {
      const combo = s.combo + 1;
      const mult = Math.min(5, 1 + Math.floor((combo - 1) / 3));
      const gained = 10 * mult;
      set({
        score: s.score + gained,
        combo,
        bestCombo: Math.max(s.bestCombo, combo),
        correct: s.correct + 1,
        index: s.index + 1,
      });
    } else {
      const lives = Number.isFinite(s.lives) ? s.lives - 1 : Infinity;
      set({
        combo: 0,
        wrong: s.wrong + 1,
        lives,
        index: s.index + 1,
      });
      if (lives <= 0) {
        finalize();
        return;
      }
    }
    // Stamp `shownAt` on the new current item so response time is accurate.
    const newIdx = get().index;
    const newItem = get().queue[newIdx];
    if (newItem && newItem.shownAt === 0) {
      const next = get().queue.slice();
      next[newIdx] = { ...newItem, shownAt: Date.now() };
      useSpeedRuntime.setState({ queue: next });
    } else if (newItem) {
      // Re-stamp the freshly-displayed item so its timer starts at "now".
      const next = get().queue.slice();
      next[newIdx] = { ...newItem, shownAt: Date.now() };
      useSpeedRuntime.setState({ queue: next });
    }

    if (get().index >= get().queue.length - 4) {
      void topUpQueue();
    }
  },

  skip() {
    const s = get();
    if (s.status !== "running") return;
    if (!s.queue[s.index]) return;
    set({ combo: 0, wrong: s.wrong + 1, index: s.index + 1 });
    if (get().index >= get().queue.length - 4) {
      void topUpQueue();
    }
  },

  reset() {
    clearAllTimers();
    invalidateStart();
    const cfg = get().config;
    set({
      ...INITIAL_STATE,
      timeRemainingMs: modeDurationMs(cfg.mode),
      lives: startingLives(cfg.mode),
    });
  },
}));

async function topUpQueue() {
  const s = useSpeedRuntime.getState();
  const { COUNTRIES } = await import("@/lib/countries");
  const more = await selectMixedQuestions(
    40,
    ["name", "flag", "capital", "location"],
    { continent: s.config.continent },
  );
  const now = Date.now();
  useSpeedRuntime.setState({
    queue: [
      ...s.queue,
      ...more.map((p) => ({
        country: p.country,
        skill: p.skill,
        options: makeOptions(p.country, COUNTRIES),
        shownAt: now,
      })),
    ],
  });
}

function finalize() {
  clearAllTimers();
  const s = useSpeedRuntime.getState();
  if (s.status !== "running") return;
  const endedAt = Date.now();
  useSpeedRuntime.setState({ status: "ended", endedAt, timeRemainingMs: 0 });
  recordSessionEnd({
    mode: "speed",
    skill: "mixed",
    score: s.score,
    totalQuestions: s.correct + s.wrong,
    correct: s.correct,
    wrong: s.wrong,
    bestCombo: s.bestCombo,
    durationMs: endedAt - s.startedAt,
    createdAt: endedAt,
    meta: { speedMode: s.config.mode, continent: s.config.continent },
  });
}
