export type SyncEntity =
  | "sessions_log"
  | "country_progress"
  | "concept_progress"
  | "question_history"
  | "daily_summary"
  | "challenge_attempts"
  | "unlocks"
  | "daily_streak"
  | "profiles";

export interface Mutation {
  op_id: string;
  entity: SyncEntity;
  op: "insert" | "upsert";
  payload: Record<string, unknown>;
}

export interface PushResult {
  accepted: string[];
  rejected: { op_id: string; reason: string }[];
  canonical: { entity: SyncEntity; row: Record<string, unknown> }[];
}

export interface PullEntityResult {
  rows: Record<string, unknown>[];
  cursor: string;
}

export type PullResult = Partial<Record<SyncEntity, PullEntityResult>>;
