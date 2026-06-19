/**
 * Spaced repetition (SM-2 derived, no user grading).
 *
 * Quality is inferred from objective signals — correctness, response time,
 * and whether a hint was used. The classic SM-2 EF/interval recurrence then
 * advances `nextReviewAt`. Stored alongside skill stats as JSON inside
 * `country_progress.skills[skill]` so Supabase merge-by-version continues to
 * work without schema changes.
 */

const DAY_MS = 86_400_000;
const FAST_MS = 4_000;          // ≤ 4s → "fast & confident"
const NORMAL_MS = 12_000;       // ≤ 12s → "normal"

export interface SrsState {
  /** Easiness factor (SM-2), clamped to [1.3, 2.8]. */
  ef: number;
  /** Successful repetitions in a row. Reset to 0 on lapse. */
  reps: number;
  /** Current interval in days. */
  interval: number;
  /** Epoch ms when this item is next due. */
  nextReviewAt: number;
  /** Epoch ms of the most recent answer. */
  lastReviewedAt: number;
}

export interface SrsInput {
  correct: boolean;
  responseMs: number;
  hintUsed: boolean;
}

export function initSrs(now = Date.now()): SrsState {
  return {
    ef: 2.5,
    reps: 0,
    interval: 0,
    nextReviewAt: now,
    lastReviewedAt: 0,
  };
}

function quality({ correct, responseMs, hintUsed }: SrsInput): number {
  if (!correct) return 1;
  if (hintUsed) return 3;
  if (responseMs <= FAST_MS) return 5;
  if (responseMs <= NORMAL_MS) return 4;
  return 3;
}

export function updateSrs(
  prev: SrsState | undefined,
  input: SrsInput,
  now = Date.now(),
): SrsState {
  const base = prev ?? initSrs(now);
  const q = quality(input);

  // EF update (SM-2): ef' = ef + (0.1 - (5-q)*(0.08 + (5-q)*0.02))
  let ef = base.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (ef < 1.3) ef = 1.3;
  if (ef > 2.8) ef = 2.8;

  let reps: number;
  let interval: number;
  if (q < 3) {
    // Lapse — restart but keep EF (clamped)
    reps = 0;
    interval = 1;
  } else {
    reps = base.reps + 1;
    if (reps === 1) interval = 1;
    else if (reps === 2) interval = 3;
    else interval = Math.round(base.interval * ef);
    if (interval < 1) interval = 1;
  }

  return {
    ef: Number(ef.toFixed(4)),
    reps,
    interval,
    lastReviewedAt: now,
    nextReviewAt: now + interval * DAY_MS,
  };
}

/**
 * Retention estimate (0..1) — exponential decay anchored to interval.
 * Lets the UI surface a "confidence" without needing a separate model.
 */
export function retention(srs: SrsState | undefined, now = Date.now()): number {
  if (!srs || srs.reps === 0) return 0;
  const elapsedDays = Math.max(0, (now - srs.lastReviewedAt) / DAY_MS);
  // Stability ~ interval; retention = exp(-t/S)
  const r = Math.exp(-elapsedDays / Math.max(0.5, srs.interval));
  return Math.max(0, Math.min(1, r));
}

export function isDue(srs: SrsState | undefined, now = Date.now()): boolean {
  if (!srs) return true;
  return srs.nextReviewAt <= now;
}

export function isOverdue(srs: SrsState | undefined, now = Date.now()): boolean {
  if (!srs) return false;
  return srs.nextReviewAt < now - DAY_MS;
}

export const SRS_CONSTANTS = { DAY_MS, FAST_MS, NORMAL_MS };
