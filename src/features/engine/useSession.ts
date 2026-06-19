import { create, type StoreApi, type UseBoundStore } from "zustand";
import type { Country } from "@/types/country";
import { confidenceAfter, selectQuestions } from "@/lib/mastery";
import {
  recordSessionEnd,
  updateSkillProgress,
  type GameMode,
  type Skill,
} from "@/lib/db/repo";

export type AnswerState = "idle" | "correct" | "wrong" | "revealed";
export const QUESTIONS_PER_SESSION = 20;

export interface SessionState {
  queue: Country[];
  index: number;
  score: number;
  combo: number;
  bestCombo: number;
  correct: number;
  wrong: number;
  answerState: AnswerState;
  hintUsed: boolean;
  startedAt: number;
  endedAt: number | null;
  loading: boolean;
  /** Epoch ms when the current question became visible. */
  questionStartedAt: number;

  current(): Country | null;
  start(opts?: { continent?: string }): Promise<void>;
  submit(isCorrect: boolean): void;
  reveal(): void;
  useHint(): void;
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
    index: 0,
    score: 0,
    combo: 0,
    bestCombo: 0,
    correct: 0,
    wrong: 0,
    answerState: "idle",
    hintUsed: false,
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
        index: 0,
        score: 0,
        combo: 0,
        bestCombo: 0,
        correct: 0,
        wrong: 0,
        answerState: "idle",
        hintUsed: false,
        startedAt: 0,
        endedAt: null,
        questionStartedAt: 0,
      });
      const q = await selectQuestions(skill, questions, {
        continent: opts?.continent,
      });
      const now = Date.now();
      set({
        queue: q,
        index: 0,
        score: 0,
        combo: 0,
        bestCombo: 0,
        correct: 0,
        wrong: 0,
        answerState: "idle",
        hintUsed: false,
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
      if (!target) return;
      const responseMs = Math.max(0, Date.now() - (s.questionStartedAt || Date.now()));
      if (isCorrect) {
        const combo = s.combo + 1;
        const base = 100;
        const comboBonus = Math.min(combo - 1, 9) * 20;
        const hintFactor = s.hintUsed ? 0.5 : 1;
        const gained = Math.round((base + comboBonus) * hintFactor);
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
      updateSkillProgress(target.iso3, skill, (prev) =>
        confidenceAfter(prev, isCorrect, s.hintUsed, Date.now(), responseMs),
      );
    },

    reveal() {
      set({ answerState: "revealed" });
    },

    useHint() {
      if (get().hintUsed) return;
      set({ hintUsed: true });
    },

    next() {
      const s = get();
      const nextIndex = s.index + 1;
      if (nextIndex >= s.queue.length) {
        const endedAt = Date.now();
        set({ endedAt, answerState: "idle", hintUsed: false, combo: 0 });
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
        return;
      }
      set({
        index: nextIndex,
        answerState: "idle",
        hintUsed: false,
        questionStartedAt: Date.now(),
      });
    },
  }));
}
