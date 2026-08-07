import Dexie, { type Table } from "dexie";
import { ensureDb, getDbSync } from "./dbProvider";
import type { FsrsStateStr, Grade } from "../fsrs/engine";

/**
 * ORBITA local-first store (Dexie v3 with sync support).
 *
 * v3 additions over v2:
 * - countryProgress gains `skill_versions` (per-skill monotonic counters)
 * - gameSessions gains `op_id` (uuid for exactly-once cloud insert)
 * - new tables: `outbox` (sync queue) and `sync_meta` (cursors/client_id)
 * - new table: `challengeAttempts` (append-only per question)
 *
 * The DB is opened via dbProvider so it can be swapped per signed-in user
 * (DB name: `orbita-${userId ?? 'local'}`). Existing repo code that calls
 * `db()` keeps working because db() delegates to the provider.
 */

export type Skill = "location" | "name" | "flag" | "capital";
export const ALL_SKILLS: readonly Skill[] = ["location", "name", "flag", "capital"];

export interface SkillStat {
  confidence: number;
  timesRight: number;
  timesWrong: number;
  streak: number;
  lastSeenAt: number;
  /** SM-2 spaced-repetition state, populated by the SRS engine. */
  srs?: {
    ef: number;
    reps: number;
    interval: number;
    nextReviewAt: number;
    lastReviewedAt: number;
  };
}

export interface CountryProgressRow {
  iso3: string;
  skills: Partial<Record<Skill, SkillStat>>;
  /** monotonic counters per skill, bumped on every local mutation */
  skill_versions?: Partial<Record<Skill, number>>;
  lastSeenAt: number;
  updated_at?: number;
  dirty?: 0 | 1;
}

export interface ConceptProgressRow {
  conceptId: string; // PK: e.g., "FRA:location"
  iso3: string;
  skill: string;
  fsrs_state: FsrsStateStr;
  fsrs_stability: number | null;
  fsrs_difficulty: number | null;
  fsrs_due: number;
  fsrs_reps: number;
  fsrs_lapses: number;
  fsrs_last_review: number;
  updated_at: number;
  version: number;
  dirty: 0 | 1;
}

export interface QuestionHistoryRow {
  op_id: string; // PK
  conceptId: string;
  sessionId: string;
  grade: Grade;
  responseMs: number;
  correct: boolean;
  answeredAt: number;
}

export interface DailySummaryRow {
  dateKey: string; // PK: "YYYY-MM-DD"
  reviewsCount: number;
  correctCount: number;
  timeSpentMs: number;
  updated_at: number;
  dirty: 0 | 1;
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
  op_id?: string;
  mode: GameMode;
  skill: Skill | "mixed";
  score: number;
  totalQuestions: number;
  correct: number;
  wrong: number;
  bestCombo: number;
  durationMs: number;
  createdAt: number;
  periodKey?: string;
  meta?: Record<string, number | string>;
  updated_at?: number;
  dirty?: 0 | 1;
}

export interface ChallengeAttemptRow {
  id?: number;
  op_id: string;
  kind: "daily" | "weekly";
  periodKey: string;
  questionIndex: number;
  correct: boolean;
  ms: number;
  createdAt: number;
}

export interface UnlockRow {
  key: string;
  progress: number;
  unlockedAt: number | null;
  updatedAt: number;
}

export interface MetaRow {
  id: "meta";
  schemaVersion: number;
  lastOpenedAt: number;
  prefs: Record<string, string>;
}

export interface OutboxRow {
  id?: number;
  op_id: string;
  entity:
    | "sessions_log"
    | "country_progress"
    | "challenge_attempts"
    | "unlocks"
    | "daily_streak"
    | "profiles"
    | "concept_progress"
    | "question_history"
    | "daily_summary";
  op: "insert" | "upsert";
  payload: Record<string, unknown>;
  created_at: number;
  attempts: number;
  next_attempt_at: number;
  status: "pending" | "in_flight" | "dead";
  last_error?: string;
}

export interface SyncMetaRow {
  key: string;
  value: string;
}

export class OrbitaDB extends Dexie {
  countryProgress!: Table<CountryProgressRow, string>;
  gameSessions!: Table<GameSessionRow, number>;
  challengeAttempts!: Table<ChallengeAttemptRow, number>;
  unlocks!: Table<UnlockRow, string>;
  meta!: Table<MetaRow, "meta">;
  outbox!: Table<OutboxRow, number>;
  sync_meta!: Table<SyncMetaRow, string>;
  concept_progress!: Table<ConceptProgressRow, string>;
  question_history!: Table<QuestionHistoryRow, string>;
  daily_summary!: Table<DailySummaryRow, string>;

  constructor(name: string) {
    super(name);

    this.version(1).stores({
      countryProgress: "key, iso3, skill, lastSeenAt, confidence",
      gameSessions: "++id, mode, skill, createdAt",
      meta: "id",
    });

    this.version(2)
      .stores({
        countryProgress: "iso3, lastSeenAt",
        gameSessions: "++id, mode, skill, createdAt, periodKey",
        unlocks: "key, unlockedAt",
        meta: "id",
      })
      .upgrade(async (tx) => {
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

    // v3: add sync-support fields and tables
    this.version(3).stores({
      countryProgress: "iso3, lastSeenAt, updated_at",
      gameSessions: "++id, &op_id, mode, skill, createdAt, periodKey, updated_at",
      challengeAttempts: "++id, &op_id, [kind+periodKey+questionIndex], createdAt",
      unlocks: "key, unlockedAt, updatedAt",
      meta: "id",
      outbox: "++id, &op_id, entity, status, next_attempt_at, created_at",
      sync_meta: "&key",
    });

    // v4: add FSRS tables
    this.version(4).stores({
      concept_progress: "conceptId, fsrs_due, dirty, updated_at",
      question_history: "op_id, conceptId, answeredAt",
      daily_summary: "dateKey, dirty",
    });
  }
}

export function createOrbitaDb(name: string): OrbitaDB {
  const d = new OrbitaDB(name);
  d.meta
    .put({ id: "meta", schemaVersion: 3, lastOpenedAt: Date.now(), prefs: {} })
    .catch(() => {});
  return d;
}

/**
 * Sync accessor used by all existing repo code. The first call opens the
 * local DB synchronously so repo code can keep its non-async API; auth-aware
 * swaps later replace the singleton via dbProvider.swap().
 */
import { getCurrent, setCurrent } from "./dbProvider";

export function db(): OrbitaDB {
  if (typeof window === "undefined") {
    throw new Error("Orbita DB is browser-only");
  }
  const cur = getCurrent();
  if (cur) return cur;
  const fresh = createOrbitaDb("orbita-local");
  setCurrent(fresh, "orbita-local");
  return fresh;
}

export function isBrowser() {
  return typeof window !== "undefined";
}
