import { COUNTRIES } from "@/lib/countries";
import type { Country } from "@/types/country";
import type { Skill, SkillStat } from "@/lib/db/orbita-db";
import { getSkillStatMap } from "@/lib/db/repo";

const DAY_MS = 86_400_000;

/** Slow exponential decay, half-life ~14 days. */
export function decay(prev: number, lastSeenAt: number, now = Date.now()): number {
  if (!lastSeenAt) return prev;
  const days = Math.max(0, (now - lastSeenAt) / DAY_MS);
  const factor = Math.pow(0.5, days / 14);
  return prev * factor;
}

/** Update a skill stat after an answer. Hint reduces gain but never increases. */
export function confidenceAfter(
  prev: SkillStat | undefined,
  correct: boolean,
  hintUsed: boolean,
  now = Date.now(),
): SkillStat {
  const base = prev ? decay(prev.confidence, prev.lastSeenAt, now) : 0.2;
  let next: number;
  if (correct) {
    const gain = hintUsed ? 0.08 : 0.18;
    next = Math.min(1, base + gain * (1 - base));
  } else {
    const loss = 0.22;
    next = Math.max(0, base - loss * base - 0.05);
  }
  return {
    confidence: Number(next.toFixed(4)),
    timesRight: (prev?.timesRight ?? 0) + (correct ? 1 : 0),
    timesWrong: (prev?.timesWrong ?? 0) + (correct ? 0 : 1),
    streak: correct ? (prev?.streak ?? 0) + 1 : 0,
    lastSeenAt: now,
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
 * Mixed-skill selection used by Speed Round + Daily Challenges.
 * Each pick is paired with the skill the player will be quizzed on.
 */
export async function selectMixedQuestions(
  n: number,
  skills: readonly Skill[],
  opts: SelectOpts = {},
): Promise<Array<{ country: Country; skill: Skill }>> {
  // Aggregate confidence across requested skills for weighting.
  const maps = await Promise.all(skills.map((s) => getSkillStatMap(s)));
  const merged = new Map<string, SkillStat>();
  for (const m of maps) {
    for (const [iso, stat] of m.entries()) {
      const cur = merged.get(iso);
      if (!cur || stat.confidence < cur.confidence) merged.set(iso, stat);
    }
  }
  const picks = selectFromPool(COUNTRIES, n, merged, opts);
  const rng = opts.rng ?? Math.random;
  return picks.map((c) => ({
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
