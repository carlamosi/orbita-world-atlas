import type { CountryProgressRow, GameSessionRow, UnlockRow } from "@/lib/db/orbita-db";
import { COUNTRIES } from "@/lib/countries";
import { currentStreak } from "@/lib/streak";
import { dateKey } from "@/lib/streak";

/**
 * Pure unlock evaluator.
 *
 * - Stateless. Given the current world state, decides the new value of every
 *   unlock row. Idempotent: re-running with the same state produces the same
 *   output, so calling this on every session end is safe.
 * - Called only from the repo layer (recordSessionEnd → reEvaluateUnlocks),
 *   never from a component render path.
 * - Adding a new achievement: define it in DEFINITIONS, return rows from
 *   evaluator. No schema change required.
 */

export interface UnlockDef {
  key: string;
  title: string;
  description: string;
  category: "milestone" | "skill" | "speed" | "streak" | "region";
}

export const DEFINITIONS: readonly UnlockDef[] = [
  { key: "first_100", title: "Centurion", description: "Answer 100 total questions.", category: "milestone" },
  { key: "first_500", title: "500 club", description: "Answer 500 total questions.", category: "milestone" },
  { key: "perfectionist", title: "Perfectionist", description: "Finish a session with 100% accuracy (≥10 questions).", category: "skill" },
  { key: "streak_3", title: "On a roll", description: "Practice 3 days in a row.", category: "streak" },
  { key: "streak_7", title: "Orbital habit", description: "Practice 7 days in a row.", category: "streak" },
  { key: "speed_demon", title: "Speed demon", description: "Score 30+ in a 60s Speed Round.", category: "speed" },
  { key: "africa_mastered", title: "Africa mastered", description: "Reach 80% confidence on every African country (any skill).", category: "region" },
  { key: "europe_mastered", title: "Europe mastered", description: "Reach 80% confidence on every European country (any skill).", category: "region" },
  { key: "asia_mastered", title: "Asia mastered", description: "Reach 80% confidence on every Asian country (any skill).", category: "region" },
  { key: "americas_mastered", title: "Americas mastered", description: "Reach 80% confidence on every American country (any skill).", category: "region" },
  { key: "oceania_mastered", title: "Oceania mastered", description: "Reach 80% confidence on every Oceanian country (any skill).", category: "region" },
];

export interface UnlockEvalInput {
  progress: CountryProgressRow[];
  sessions: GameSessionRow[];
  now: number;
  existing: Map<string, UnlockRow>;
}

export function evaluateUnlocks(input: UnlockEvalInput): UnlockRow[] {
  const totals = input.sessions.reduce(
    (acc, s) => {
      acc.q += s.totalQuestions;
      return acc;
    },
    { q: 0 },
  );

  const perfectSessions = input.sessions.filter(
    (s) => s.totalQuestions >= 10 && s.correct === s.totalQuestions,
  );

  const speedBest = input.sessions
    .filter((s) => s.mode === "speed")
    .reduce((m, s) => Math.max(m, s.score), 0);

  const activeDays = new Set(input.sessions.map((s) => dateKey(s.createdAt)));
  const streak = currentStreak(activeDays);

  const byIso = new Map(input.progress.map((p) => [p.iso3, p]));
  function regionMastered(continent: string): number {
    const list = COUNTRIES.filter((c) => c.continent === continent);
    if (list.length === 0) return 0;
    const mastered = list.filter((c) => {
      const p = byIso.get(c.iso3);
      if (!p) return false;
      return Object.values(p.skills).some((s) => s && s.confidence >= 0.8);
    }).length;
    return mastered / list.length;
  }

  const candidates: Array<{ key: string; progress: number; unlocked: boolean }> = [
    { key: "first_100", progress: Math.min(1, totals.q / 100), unlocked: totals.q >= 100 },
    { key: "first_500", progress: Math.min(1, totals.q / 500), unlocked: totals.q >= 500 },
    { key: "perfectionist", progress: perfectSessions.length > 0 ? 1 : 0, unlocked: perfectSessions.length > 0 },
    { key: "streak_3", progress: Math.min(1, streak / 3), unlocked: streak >= 3 },
    { key: "streak_7", progress: Math.min(1, streak / 7), unlocked: streak >= 7 },
    { key: "speed_demon", progress: Math.min(1, speedBest / 30), unlocked: speedBest >= 30 },
    { key: "africa_mastered", progress: regionMastered("Africa"), unlocked: regionMastered("Africa") >= 1 },
    { key: "europe_mastered", progress: regionMastered("Europe"), unlocked: regionMastered("Europe") >= 1 },
    { key: "asia_mastered", progress: regionMastered("Asia"), unlocked: regionMastered("Asia") >= 1 },
    { key: "americas_mastered", progress: regionMastered("Americas"), unlocked: regionMastered("Americas") >= 1 },
    { key: "oceania_mastered", progress: regionMastered("Oceania"), unlocked: regionMastered("Oceania") >= 1 },
  ];

  const deltas: UnlockRow[] = [];
  for (const c of candidates) {
    const prev = input.existing.get(c.key);
    const prevUnlocked = prev?.unlockedAt != null;
    const nextProgress = Number(c.progress.toFixed(3));
    const unlockedAt = prevUnlocked
      ? prev!.unlockedAt
      : c.unlocked
        ? input.now
        : null;
    const changed =
      !prev ||
      prev.progress !== nextProgress ||
      prev.unlockedAt !== unlockedAt;
    if (changed) {
      deltas.push({
        key: c.key,
        progress: nextProgress,
        unlockedAt,
        updatedAt: input.now,
      });
    }
  }
  return deltas;
}

export function defByKey(key: string): UnlockDef | undefined {
  return DEFINITIONS.find((d) => d.key === key);
}
