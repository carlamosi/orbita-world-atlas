import {
  db,
  isBrowser,
  type CountryProgressRow,
  type GameSessionRow,
  type Skill,
  type GameMode,
} from "./orbita-db";

const key = (iso3: string, skill: Skill) => `${iso3}::${skill}`;

export async function getProgress(skill: Skill): Promise<CountryProgressRow[]> {
  if (!isBrowser()) return [];
  try {
    return await db().countryProgress.where("skill").equals(skill).toArray();
  } catch {
    return [];
  }
}

export async function getProgressMap(
  skill: Skill,
): Promise<Map<string, CountryProgressRow>> {
  const rows = await getProgress(skill);
  return new Map(rows.map((r) => [r.iso3, r]));
}

export async function upsertProgress(
  iso3: string,
  skill: Skill,
  patch: (prev: CountryProgressRow | undefined) => CountryProgressRow,
) {
  if (!isBrowser()) return;
  try {
    const k = key(iso3, skill);
    const prev = await db().countryProgress.get(k);
    const next = patch(prev);
    await db().countryProgress.put({ ...next, key: k, iso3, skill });
  } catch (e) {
    console.warn("[orbita-db] upsertProgress failed", e);
  }
}

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
    return await db().gameSessions.orderBy("createdAt").reverse().limit(limit).toArray();
  } catch {
    return [];
  }
}

export async function getSkillSummary(skill: Skill) {
  const rows = await getProgress(skill);
  if (rows.length === 0) return { mastered: 0, total: 0, avg: 0 };
  const mastered = rows.filter((r) => r.confidence >= 0.8).length;
  const avg = rows.reduce((s, r) => s + r.confidence, 0) / rows.length;
  return { mastered, total: rows.length, avg };
}

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
      schemaVersion: m?.schemaVersion ?? 1,
      lastOpenedAt: Date.now(),
      prefs,
    });
  } catch (e) {
    console.warn("[orbita-db] setPref failed", e);
  }
}

export type { CountryProgressRow, GameSessionRow, Skill, GameMode };
