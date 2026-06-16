import { create } from "zustand";
import { COUNTRIES, pickRandomCountries } from "@/lib/countries";
import type { Country } from "@/types/country";

const QUESTIONS = 20;

export type AnswerState = "idle" | "correct" | "wrong" | "revealed";

interface FindSession {
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
  current(): Country | null;
  start: () => void;
  guess: (iso3: string) => void;
  useHint: () => void;
  next: () => void;
  reveal: () => void;
}

export const useFindStore = create<FindSession>((set, get) => ({
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
  current() {
    const s = get();
    return s.queue[s.index] ?? null;
  },
  start() {
    set({
      queue: pickRandomCountries(QUESTIONS),
      index: 0,
      score: 0,
      combo: 0,
      bestCombo: 0,
      correct: 0,
      wrong: 0,
      answerState: "idle",
      hintUsed: false,
      startedAt: Date.now(),
      endedAt: null,
    });
  },
  guess(iso3) {
    const s = get();
    if (s.answerState !== "idle") return;
    const target = s.queue[s.index];
    if (!target) return;
    if (iso3 === target.iso3) {
      const combo = s.combo + 1;
      const base = 100;
      const comboBonus = Math.min(combo - 1, 9) * 20;
      const hintPenalty = s.hintUsed ? 0.5 : 1;
      const gained = Math.round((base + comboBonus) * hintPenalty);
      set({
        score: s.score + gained,
        combo,
        bestCombo: Math.max(s.bestCombo, combo),
        correct: s.correct + 1,
        answerState: "correct",
      });
    } else {
      set({
        combo: 0,
        wrong: s.wrong + 1,
        answerState: "wrong",
      });
    }
  },
  useHint() {
    if (get().hintUsed) return;
    set({ hintUsed: true });
  },
  reveal() {
    set({ answerState: "revealed" });
  },
  next() {
    const s = get();
    const nextIndex = s.index + 1;
    if (nextIndex >= s.queue.length) {
      set({ endedAt: Date.now(), answerState: "idle" });
      return;
    }
    set({ index: nextIndex, answerState: "idle", hintUsed: false });
  },
}));

export const TOTAL_QUESTIONS = QUESTIONS;
export const ALL_COUNTRIES = COUNTRIES;
