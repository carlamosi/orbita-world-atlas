import Dexie, { type Table } from "dexie";

export type Skill = "location" | "name" | "flag" | "capital";

export interface CountryProgressRow {
  key: string; // `${iso3}::${skill}`
  iso3: string;
  skill: Skill;
  confidence: number; // 0..1
  timesRight: number;
  timesWrong: number;
  streak: number;
  lastSeenAt: number;
}

export type GameMode = "find" | "name" | "flag" | "capital";

export interface GameSessionRow {
  id?: number;
  mode: GameMode;
  skill: Skill;
  score: number;
  totalQuestions: number;
  correct: number;
  wrong: number;
  bestCombo: number;
  durationMs: number;
  createdAt: number;
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
  meta!: Table<MetaRow, "meta">;

  constructor() {
    super("orbita");
    // v1 — initial schema. Bump and add upgrade() in migrations.ts for future versions.
    this.version(1).stores({
      countryProgress: "key, iso3, skill, lastSeenAt, confidence",
      gameSessions: "++id, mode, skill, createdAt",
      meta: "id",
    });
  }
}

let _db: OrbitaDB | null = null;

export function db(): OrbitaDB {
  if (typeof window === "undefined") {
    // Server-safe noop — gameplay routes are ssr:false, but defend regardless.
    throw new Error("Orbita DB is browser-only");
  }
  if (!_db) {
    _db = new OrbitaDB();
    _db.meta
      .put({
        id: "meta",
        schemaVersion: 1,
        lastOpenedAt: Date.now(),
        prefs: {},
      })
      .catch(() => {});
  }
  return _db;
}

export function isBrowser() {
  return typeof window !== "undefined";
}
