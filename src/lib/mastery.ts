import { COUNTRIES } from "@/lib/countries";
import type { Country } from "@/types/country";
import type { Skill, SkillStat } from "@/lib/db/orbita-db";
import { getSkillStatMap } from "@/lib/db/repo";
import { updateSrs, retention, type SrsState } from "@/lib/spacedRepetition";
import { db } from "@/lib/db/orbita-db";
import { retrievability } from "@/lib/fsrs/engine";

const DAY_MS = 86_400_000;

/** Slow exponential decay, half-life ~14 days. */
export function decay(prev: number, lastSeenAt: number, now = Date.now()): number {
  if (!lastSeenAt) return prev;
  const days = Math.max(0, (now - lastSeenAt) / DAY_MS);
  const factor = Math.pow(0.5, days / 14);
  return prev * factor;
}

/**
 * Update a skill stat after an answer.
 *
 * Now SRS-aware: advances SM-2 state (ef/reps/interval/nextReviewAt) using
 * objective signals only — correctness, response time, hint usage. The
 * `confidence` field continues to exist for back-compat (legacy heatmap,
 * weighting, unlocks), but its source of truth is now `retention(srs)` when
 * SRS state is present.
 */
export function confidenceAfter(
  prev: SkillStat | undefined,
  correct: boolean,
  now = Date.now(),
  responseMs = 8_000,
): SkillStat {
  const srs: SrsState = updateSrs(prev?.srs, { correct, responseMs }, now);
  // Confidence mirrors retention right after review (≈1.0 if correct), but is
  // clamped to keep legacy thresholds (≥0.8 = mastered) reasonable.
  const confidence = correct
    ? Math.min(1, Math.max(0.2, retention(srs, now) * 0.4 + 0.6))
    : Math.max(0, (prev?.confidence ?? 0) * 0.5 - 0.05);

  return {
    confidence: Number(confidence.toFixed(4)),
    timesRight: (prev?.timesRight ?? 0) + (correct ? 1 : 0),
    timesWrong: (prev?.timesWrong ?? 0) + (correct ? 0 : 1),
    streak: correct ? (prev?.streak ?? 0) + 1 : 0,
    lastSeenAt: now,
    srs,
  };
}

export interface SelectOpts {
  continent?: string;
  excludeIso3?: ReadonlySet<string>;
  difficulty?: "easy" | "medium" | "hard" | null;
  rng?: () => number; // injectable for deterministic challenges
}

/**
 * Weighted selection: weak + long-unseen countries are favored.
 */
export async function selectQuestions(
  skill: Skill,
  n: number,
  opts: SelectOpts = {},
): Promise<Country[]> {
  const progress = await getSkillStatMap(skill);
  return selectFromPool(COUNTRIES, n, progress, opts);
}

/**
 * Complete Continent mode: returns every country in the given continent
 * (or all countries when continent is "All") in a fresh random order.
 * Each country is asked exactly once per session.
 */
export function selectAllForContinent(continent: string | null | undefined): Country[] {
  const pool =
    !continent || continent === "All"
      ? [...COUNTRIES]
      : COUNTRIES.filter((c) => c.continent === continent);
  // Fisher-Yates shuffle
  const arr = [...pool];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}


/**
 * Mixed-skill selection used by Speed Round + Daily Challenges.
 * Each pick is paired with the skill the player will be quizzed on.
 */
export async function selectMixedQuestions(
  n: number,
  skills: readonly Skill[],
  opts: SelectOpts = {},
): Promise<Array<{ country: Country; skill: Skill }>> {
  const concepts = await db().concept_progress.where("skill").anyOf(skills as string[]).toArray();
  const now = Date.now();
  
  const merged = new Map<string, { r: number; lastSeenAt: number }>();
  for (const c of concepts) {
    let r = 0.05;
    if (c.fsrs_state !== "new" && c.fsrs_stability) {
      r = retrievability(c.fsrs_stability, Math.max(0, (now - c.fsrs_last_review) / 86400000));
    }
    const cur = merged.get(c.iso3);
    if (!cur || r < cur.r) {
      merged.set(c.iso3, { r, lastSeenAt: c.fsrs_last_review || 0 });
    }
  }

  const exclude = opts.excludeIso3 ?? new Set();
  const continent = opts.continent && opts.continent !== "All" ? opts.continent : null;
  const rng = opts.rng ?? Math.random;

  const pool = COUNTRIES.filter((c) => {
    if (exclude.has(c.iso3)) return false;
    if (continent && c.continent !== continent) return false;
    if (opts.difficulty && c.difficulty !== opts.difficulty) return false;
    return true;
  });

  const weighted = pool.map((c) => {
    const p = merged.get(c.iso3);
    const r = p ? decay(p.r, p.lastSeenAt, now) : 0.05;
    const daysUnseen = p ? (now - p.lastSeenAt) / DAY_MS : 365;
    const weight = (1 - r) * 2 + Math.min(daysUnseen / 14, 1) * 0.6 + 0.1;
    return { c, weight };
  });

  const picked: Country[] = [];
  const used = new Set<string>();
  while (picked.length < n && picked.length < weighted.length) {
    const candidates = weighted.filter((w) => !used.has(w.c.iso3));
    if (candidates.length === 0) break;
    const total = candidates.reduce((s, w) => s + w.weight, 0);
    let r = rng() * total;
    let chosen = candidates[0]!;
    for (const w of candidates) {
      r -= w.weight;
      if (r <= 0) {
        chosen = w;
        break;
      }
    }
    picked.push(chosen.c);
    used.add(chosen.c.iso3);
  }

  return picked.map((c) => ({
    country: c,
    skill: skills[Math.floor(rng() * skills.length)]!,
  }));
}

function selectFromPool(
  source: readonly Country[],
  n: number,
  progress: Map<string, SkillStat>,
  opts: SelectOpts,
): Country[] {
  const now = Date.now();
  const exclude = opts.excludeIso3 ?? new Set();
  const continent =
    opts.continent && opts.continent !== "All" ? opts.continent : null;
  const rng = opts.rng ?? Math.random;

  const pool = source.filter((c) => {
    if (exclude.has(c.iso3)) return false;
    if (continent && c.continent !== continent) return false;
    if (opts.difficulty && c.difficulty !== opts.difficulty) return false;
    return true;
  });

  const weighted = pool.map((c) => {
    const p = progress.get(c.iso3);
    const conf = p ? decay(p.confidence, p.lastSeenAt, now) : 0.05;
    const daysUnseen = p ? (now - p.lastSeenAt) / DAY_MS : 365;
    const weight = (1 - conf) * 2 + Math.min(daysUnseen / 14, 1) * 0.6 + 0.1;
    return { c, weight };
  });

  const picked: Country[] = [];
  const used = new Set<string>();
  while (picked.length < n && picked.length < weighted.length) {
    const candidates = weighted.filter((w) => !used.has(w.c.iso3));
    if (candidates.length === 0) break;
    const total = candidates.reduce((s, w) => s + w.weight, 0);
    let r = rng() * total;
    let chosen = candidates[0]!;
    for (const w of candidates) {
      r -= w.weight;
      if (r <= 0) {
        chosen = w;
        break;
      }
    }
    picked.push(chosen.c);
    used.add(chosen.c.iso3);
  }
  return picked;
}
