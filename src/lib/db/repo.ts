import {
  db,
  isBrowser,
  ALL_SKILLS,
  type CountryProgressRow,
  type GameSessionRow,
  type Skill,
  type GameMode,
  type SkillStat,
  type UnlockRow,
} from "./orbita-db";
import { evaluateUnlocks, type UnlockEvalInput } from "@/lib/unlocks";
import { dateKey } from "@/lib/streak";
import { enqueue } from "@/lib/sync/queue";
import { newOpId } from "@/lib/sync/clientId";

/* ───────────────────────── country progress ───────────────────────── */

export async function getCountryProgress(
  iso3: string,
): Promise<CountryProgressRow | undefined> {
  if (!isBrowser()) return undefined;
  try {
    return await db().countryProgress.get(iso3);
  } catch {
    return undefined;
  }
}

export async function getAllProgress(): Promise<CountryProgressRow[]> {
  if (!isBrowser()) return [];
  try {
    return await db().countryProgress.toArray();
  } catch {
    return [];
  }
}

export async function getSkillStatMap(skill: Skill): Promise<Map<string, SkillStat>> {
  const rows = await getAllProgress();
  const out = new Map<string, SkillStat>();
  for (const r of rows) {
    const s = r.skills[skill];
    if (s) out.set(r.iso3, s);
  }
  return out;
}

export async function updateSkillProgress(
  iso3: string,
  skill: Skill,
  mutator: (prev: SkillStat | undefined) => SkillStat,
): Promise<void> {
  if (!isBrowser()) return;
  try {
    let nextRow: CountryProgressRow | null = null;
    await db().transaction("rw", db().countryProgress, async () => {
      const prev = await db().countryProgress.get(iso3);
      const skills = { ...(prev?.skills ?? {}) };
      skills[skill] = mutator(skills[skill]);
      const skill_versions = { ...(prev?.skill_versions ?? {}) };
      skill_versions[skill] = (skill_versions[skill] ?? 0) + 1;
      const next: CountryProgressRow = {
        iso3,
        skills,
        skill_versions,
        lastSeenAt: Math.max(prev?.lastSeenAt ?? 0, skills[skill]!.lastSeenAt),
        updated_at: Date.now(),
        dirty: 1,
      };
      await db().countryProgress.put(next);
      nextRow = next;
    });
    if (nextRow) {
      const row = nextRow as CountryProgressRow;
      enqueue({
        entity: "country_progress",
        op: "upsert",
        payload: {
          country_code: row.iso3,
          skills: row.skills,
          skill_versions: row.skill_versions ?? {},
          last_seen_at: new Date(row.lastSeenAt).toISOString(),
        },
      });
    }
  } catch (e) {
    console.warn("[orbita-db] updateSkillProgress failed", e);
  }
}

/* ───────────────────────── sessions ───────────────────────── */

export async function recordSession(row: Omit<GameSessionRow, "id">) {
  if (!isBrowser()) return;
  try {
    await db().gameSessions.add(row);
  } catch (e) {
    console.warn("[orbita-db] recordSession failed", e);
  }
}

export async function getRecentSessions(limit = 20): Promise<GameSessionRow[]> {
  if (!isBrowser()) return [];
  try {
    return await db()
      .gameSessions.orderBy("createdAt")
      .reverse()
      .limit(limit)
      .toArray();
  } catch {
    return [];
  }
}

export async function getAllSessions(): Promise<GameSessionRow[]> {
  if (!isBrowser()) return [];
  try {
    return await db().gameSessions.toArray();
  } catch {
    return [];
  }
}

/**
 * Atomic "end of session" composer. The session engine (or speed runtime,
 * or challenge runtime) calls exactly this once when a session resolves.
 *
 * Writes performed:
 *   1. gameSessions: append the row
 *   2. unlocks:      re-evaluate via pure function, upsert deltas
 *
 * The UI layer never touches the unlock evaluator — it is invoked here so
 * the rule is idempotent regardless of how many times a screen re-renders.
 */
export async function recordSessionEnd(row: Omit<GameSessionRow, "id">) {
  if (!isBrowser()) return;
  try {
    await db().gameSessions.add(row);
    await reEvaluateUnlocks();
  } catch (e) {
    console.warn("[orbita-db] recordSessionEnd failed", e);
  }
}

/* ───────────────────────── unlocks ───────────────────────── */

export async function getUnlocks(): Promise<UnlockRow[]> {
  if (!isBrowser()) return [];
  try {
    return await db().unlocks.toArray();
  } catch {
    return [];
  }
}

export async function reEvaluateUnlocks(): Promise<UnlockRow[]> {
  if (!isBrowser()) return [];
  const [progress, sessions, current] = await Promise.all([
    getAllProgress(),
    getAllSessions(),
    getUnlocks(),
  ]);
  const input: UnlockEvalInput = {
    progress,
    sessions,
    now: Date.now(),
    existing: new Map(current.map((u) => [u.key, u])),
  };
  const deltas = evaluateUnlocks(input);
  if (deltas.length === 0) return current;
  try {
    await db().unlocks.bulkPut(deltas);
  } catch (e) {
    console.warn("[orbita-db] bulk unlocks put failed", e);
  }
  return [...current.filter((c) => !deltas.find((d) => d.key === c.key)), ...deltas];
}

/* ───────────────────────── streak helpers ───────────────────────── */

/** Derived from gameSessions — no extra table. */
export async function getDailyActivity(): Promise<Map<string, number>> {
  const sessions = await getAllSessions();
  const m = new Map<string, number>();
  for (const s of sessions) {
    const k = dateKey(s.createdAt);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

/* ───────────────────────── prefs ───────────────────────── */

export async function getPref(key: string): Promise<string | null> {
  if (!isBrowser()) return null;
  try {
    const m = await db().meta.get("meta");
    return m?.prefs?.[key] ?? null;
  } catch {
    return null;
  }
}

export async function setPref(key: string, value: string) {
  if (!isBrowser()) return;
  try {
    const m = await db().meta.get("meta");
    const prefs = { ...(m?.prefs ?? {}), [key]: value };
    await db().meta.put({
      id: "meta",
      schemaVersion: m?.schemaVersion ?? 2,
      lastOpenedAt: Date.now(),
      prefs,
    });
  } catch (e) {
    console.warn("[orbita-db] setPref failed", e);
  }
}

/* ───────────────────────── reset (debug) ───────────────────────── */

export async function resetAll() {
  if (!isBrowser()) return;
  await Promise.all([
    db().countryProgress.clear(),
    db().gameSessions.clear(),
    db().unlocks.clear(),
  ]);
}

export { ALL_SKILLS };
export type { CountryProgressRow, GameSessionRow, Skill, GameMode, SkillStat, UnlockRow };
