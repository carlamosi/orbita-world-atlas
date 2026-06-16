import { create } from "zustand";
import type { Country } from "@/types/country";
import type { Skill } from "@/lib/db/orbita-db";
import { confidenceAfter, selectMixedQuestions } from "@/lib/mastery";
import { recordSessionEnd, updateSkillProgress } from "@/lib/db/repo";

/**
 * Speed Runtime — intentionally NOT a session-engine extension.
 *
 * Why decoupled:
 *  - Speed has a 250ms timer tick that would otherwise re-render the whole
 *    session tree (including HUD subscribers in other modes).
 *  - Combo & lives state mutates per-answer, not per-question round, so the
 *    turn-based "answerState idle → correct/wrong → next" cycle does not fit.
 *  - Question selection is pre-batched (queue of ~80 mixed-skill items)
 *    rather than re-fetched between turns, so the active loop is allocation-
 *    free.
 *  - Persistence goes through the *same* repo layer as useSession, so all
 *    Dexie writes remain centralised.
 */

export type SpeedMode = "sprint60" | "marathon120" | "suddenDeath";

export interface SpeedConfig {
  mode: SpeedMode;
  continent: string; // "All" or specific
}

interface SpeedItem {
  country: Country;
  skill: Skill;
  // four MCQ options resolved at queue build (deterministic per item)
  options: Country[];
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
  start: () => Promise<void>;
  answer: (iso3: string) => void;
  reset: () => void;
}

const SPRINT_MS = 60_000;
const MARATHON_MS = 120_000;
const TICK_MS = 250;

function modeDurationMs(m: SpeedMode): number {
  if (m === "sprint60") return SPRINT_MS;
  if (m === "marathon120") return MARATHON_MS;
  return Number.POSITIVE_INFINITY; // sudden death: ends on lives=0
}

function startingLives(m: SpeedMode): number {
  return m === "suddenDeath" ? 3 : Infinity;
}

let tickHandle: ReturnType<typeof setInterval> | null = null;

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

export const useSpeedRuntime = create<SpeedState>((set, get) => ({
  config: { mode: "sprint60", continent: "All" },
  status: "idle",
  queue: [],
  index: 0,
  timeRemainingMs: SPRINT_MS,
  score: 0,
  combo: 0,
  bestCombo: 0,
  lives: Infinity,
  correct: 0,
  wrong: 0,
  startedAt: 0,
  endedAt: null,

  setConfig(patch) {
    set({ config: { ...get().config, ...patch } });
  },

  async start() {
    const { config } = get();
    const { COUNTRIES } = await import("@/lib/countries");
    const picks = await selectMixedQuestions(
      80,
      ["name", "flag", "capital", "location"],
      { continent: config.continent },
    );
    const queue: SpeedItem[] = picks.map((p) => ({
      country: p.country,
      skill: p.skill,
      options: makeOptions(p.country, COUNTRIES),
    }));

    if (tickHandle) clearInterval(tickHandle);
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
      startedAt: Date.now(),
      endedAt: null,
    });

    if (Number.isFinite(modeDurationMs(config.mode))) {
      const startedAt = Date.now();
      const total = modeDurationMs(config.mode);
      tickHandle = setInterval(() => {
        const elapsed = Date.now() - startedAt;
        const remaining = Math.max(0, total - elapsed);
        if (remaining <= 0) {
          finalize();
          return;
        }
        // Cheap targeted set — only timeRemainingMs changes per tick.
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

    updateSkillProgress(item.country.iso3, item.skill, (prev) =>
      confidenceAfter(prev, isCorrect, false),
    );

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
    // Out of questions — generate more (cheap; rare for 60-120s window).
    if (get().index >= get().queue.length - 4) {
      void topUpQueue();
    }
  },

  reset() {
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = null;
    set({
      status: "idle",
      queue: [],
      index: 0,
      timeRemainingMs: modeDurationMs(get().config.mode),
      score: 0,
      combo: 0,
      bestCombo: 0,
      lives: startingLives(get().config.mode),
      correct: 0,
      wrong: 0,
      startedAt: 0,
      endedAt: null,
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
  useSpeedRuntime.setState({
    queue: [
      ...s.queue,
      ...more.map((p) => ({
        country: p.country,
        skill: p.skill,
        options: makeOptions(p.country, COUNTRIES),
      })),
    ],
  });
}

function finalize() {
  if (tickHandle) clearInterval(tickHandle);
  tickHandle = null;
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
