import Dexie, { type Table } from "dexie";

/**
 * ORBITA local-first store (Dexie v2).
 *
 * Architectural notes for Phase 3:
 *
 * - countryProgress is now **one row per country**, with a nested `skills`
 *   object. This makes adding new skills (e.g. anthems, currencies) a
 *   non-migration change and prepares the schema for future ML-style
 *   weighting (decay curves, per-skill priors) without flattening pain.
 *
 * - Unlocks live in their own table. They are **idempotent** — the pure
 *   evaluator in `src/lib/unlocks.ts` decides what is unlocked from current
 *   state and the repo just upserts. The UI never recomputes them.
 *
 * - PWA caching MUST exclude IndexedDB. IndexedDB *is* the source of truth
 *   offline; cache headers on assets must not be allowed to shadow it.
 *   See public/manifest.webmanifest and the (manifest-only) installability
 *   wiring in __root.tsx.
 */

export type Skill = "location" | "name" | "flag" | "capital";
export const ALL_SKILLS: readonly Skill[] = ["location", "name", "flag", "capital"];

export interface SkillStat {
  confidence: number; // 0..1
  timesRight: number;
  timesWrong: number;
  streak: number;
  lastSeenAt: number;
}

export interface CountryProgressRow {
  iso3: string; // primary key
  skills: Partial<Record<Skill, SkillStat>>;
  lastSeenAt: number;
}

export type GameMode =
  | "find"
  | "name"
  | "flag"
  | "capital"
  | "speed"
  | "challenge_daily"
  | "challenge_weekly";

export interface GameSessionRow {
  id?: number;
  mode: GameMode;
  skill: Skill | "mixed";
  score: number;
  totalQuestions: number;
  correct: number;
  wrong: number;
  bestCombo: number;
  durationMs: number;
  createdAt: number;
  // For challenges & speed
  periodKey?: string; // "YYYY-MM-DD" or "YYYY-Www"
  meta?: Record<string, number | string>;
}

export interface UnlockRow {
  key: string; // stable id, e.g. "streak_7"
  progress: number; // 0..1
  unlockedAt: number | null;
  updatedAt: number;
}

export interface MetaRow {
  id: "meta";
  schemaVersion: number;
  lastOpenedAt: number;
  prefs: Record<string, string>;
}

class OrbitaDB extends Dexie {
  countryProgress!: Table<CountryProgressRow, string>;
  gameSessions!: Table<GameSessionRow, number>;
  unlocks!: Table<UnlockRow, string>;
  meta!: Table<MetaRow, "meta">;

  constructor() {
    super("orbita");

    // v1 — legacy: per-skill rows keyed by `${iso3}::${skill}`.
    this.version(1).stores({
      countryProgress: "key, iso3, skill, lastSeenAt, confidence",
      gameSessions: "++id, mode, skill, createdAt",
      meta: "id",
    });

    // v2 — per-country rows with nested skill stats; unlocks table.
    this.version(2)
      .stores({
        countryProgress: "iso3, lastSeenAt",
        gameSessions: "++id, mode, skill, createdAt, periodKey",
        unlocks: "key, unlockedAt",
        meta: "id",
      })
      .upgrade(async (tx) => {
        // Aggregate v1 rows (one per iso3+skill) into v2 rows (one per iso3).
        const old = await tx
          .table<{ key: string; iso3: string; skill: Skill } & SkillStat>(
            "countryProgress",
          )
          .toArray()
          .catch(() => []);
        const grouped = new Map<string, CountryProgressRow>();
        for (const row of old) {
          const existing = grouped.get(row.iso3) ?? {
            iso3: row.iso3,
            skills: {},
            lastSeenAt: 0,
          };
          existing.skills[row.skill] = {
            confidence: row.confidence,
            timesRight: row.timesRight,
            timesWrong: row.timesWrong,
            streak: row.streak,
            lastSeenAt: row.lastSeenAt,
          };
          existing.lastSeenAt = Math.max(existing.lastSeenAt, row.lastSeenAt);
          grouped.set(row.iso3, existing);
        }
        await tx.table("countryProgress").clear();
        if (grouped.size > 0) {
          await tx.table("countryProgress").bulkPut([...grouped.values()]);
        }
      });
  }
}

let _db: OrbitaDB | null = null;

export function db(): OrbitaDB {
  if (typeof window === "undefined") {
    throw new Error("Orbita DB is browser-only");
  }
  if (!_db) {
    _db = new OrbitaDB();
    _db.meta
      .put({ id: "meta", schemaVersion: 2, lastOpenedAt: Date.now(), prefs: {} })
      .catch(() => {});
  }
  return _db;
}

export function isBrowser() {
  return typeof window !== "undefined";
}
