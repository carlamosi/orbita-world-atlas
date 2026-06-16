import { COUNTRIES } from "@/lib/countries";
import type { Country } from "@/types/country";
import type { CountryProgressRow, Skill } from "@/lib/db/repo";
import { getProgressMap } from "@/lib/db/repo";

const DAY_MS = 86_400_000;

/** Slow exponential decay, half-life ~14 days. */
export function decay(prev: number, lastSeenAt: number, now = Date.now()): number {
  if (!lastSeenAt) return prev;
  const days = Math.max(0, (now - lastSeenAt) / DAY_MS);
  const factor = Math.pow(0.5, days / 14);
  return prev * factor;
}

/** Update confidence after an answer. Hint reduces gain but never increases. */
export function confidenceAfter(
  prev: CountryProgressRow | undefined,
  correct: boolean,
  hintUsed: boolean,
  now = Date.now(),
): CountryProgressRow {
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
    key: "",
    iso3: prev?.iso3 ?? "",
    skill: prev?.skill ?? ("location" as Skill),
    confidence: Number(next.toFixed(4)),
    timesRight: (prev?.timesRight ?? 0) + (correct ? 1 : 0),
    timesWrong: (prev?.timesWrong ?? 0) + (correct ? 0 : 1),
    streak: correct ? (prev?.streak ?? 0) + 1 : 0,
    lastSeenAt: now,
  };
}

export interface SelectOpts {
  continent?: string; // "" / "All" => any
  excludeIso3?: ReadonlySet<string>;
  difficulty?: "easy" | "medium" | "hard" | null;
}

/**
 * Weighted selection: weak + long-unseen countries are favored. Returns up to `n`
 * distinct countries with no immediate repeats.
 */
export async function selectQuestions(
  skill: Skill,
  n: number,
  opts: SelectOpts = {},
): Promise<Country[]> {
  const progress = await getProgressMap(skill);
  const now = Date.now();
  const exclude = opts.excludeIso3 ?? new Set();
  const continent = opts.continent && opts.continent !== "All" ? opts.continent : null;

  const pool = COUNTRIES.filter((c) => {
    if (exclude.has(c.iso3)) return false;
    if (continent && c.continent !== continent) return false;
    if (opts.difficulty && c.difficulty !== opts.difficulty) return false;
    return true;
  });

  const weighted = pool.map((c) => {
    const p = progress.get(c.iso3);
    const conf = p ? decay(p.confidence, p.lastSeenAt, now) : 0.05;
    const daysUnseen = p ? (now - p.lastSeenAt) / DAY_MS : 365;
    // Weight: more for low confidence, more for long unseen, gentle bias toward easier countries early on.
    const weight = (1 - conf) * 2 + Math.min(daysUnseen / 14, 1) * 0.6 + 0.1;
    return { c, weight };
  });

  const picked: Country[] = [];
  const used = new Set<string>();
  while (picked.length < n && picked.length < weighted.length) {
    const candidates = weighted.filter((w) => !used.has(w.c.iso3));
    if (candidates.length === 0) break;
    const total = candidates.reduce((s, w) => s + w.weight, 0);
    let r = Math.random() * total;
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
