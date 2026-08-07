export type FsrsStateStr = "new" | "learning" | "review" | "relearning";
export type Grade = 0 | 1 | 2 | 3; // 0=Again, 1=Hard, 2=Good, 3=Easy

export interface FsrsState {
  state: FsrsStateStr;
  stability: number | null; // S (days)
  difficulty: number | null; // D [1-10]
  due: number; // epoch ms
  lastReviewAt: number; // epoch ms
  reps: number;
  lapses: number;
  learningStep: number;
  lastGrade: Grade | null;
}

// FSRS-5 default parameters
export const W = [
  0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316,
  1.0651, 0.0589, 1.5330, 0.1544, 1.0059, 1.9395,
  0.1100, 0.2900, 2.2700, 0.2400, 2.9898, 0.5100, 0.4300
];

const FACTOR = 19 / 81;
export const DAY_MS = 86400000;
const MINUTE_MS = 60000;

export const LEARNING_STEPS_MS = [1 * MINUTE_MS, 10 * MINUTE_MS];
export const RELEARNING_STEPS_MS = [10 * MINUTE_MS];

export function retrievability(stability: number | null, elapsedDays: number): number {
  if (stability === null || stability === 0) return 0;
  return Math.pow(1 + (FACTOR * elapsedDays) / stability, -1);
}

function constrainDifficulty(d: number): number {
  return Math.min(10, Math.max(1, d));
}

export function createNewState(now = Date.now()): FsrsState {
  return {
    state: "new",
    stability: null,
    difficulty: null,
    due: now,
    lastReviewAt: 0,
    reps: 0,
    lapses: 0,
    learningStep: 0,
    lastGrade: null,
  };
}

/**
 * Pure function to compute the next FSRS state given a grade.
 */
export function updateFsrs(current: FsrsState | null, grade: Grade, now = Date.now()): FsrsState {
  const state = current ?? createNewState(now);
  const next = { ...state, reps: state.reps + 1, lastReviewAt: now, lastGrade: grade };
  
  if (state.state === "new") {
    next.state = "learning";
    next.difficulty = constrainDifficulty(W[4] - Math.exp(W[5] * (grade - 1)) + 1);
    next.stability = W[grade];
    
    if (grade >= 2) {
      // Graduate immediately if Good or Easy
      next.state = "review";
      next.due = now + (next.stability * DAY_MS);
    } else {
      next.learningStep = 0;
      next.due = now + LEARNING_STEPS_MS[next.learningStep]!;
    }
    return next;
  }
  
  if (state.state === "learning" || state.state === "relearning") {
    if (grade === 0) {
      next.learningStep = 0; // restart steps
      next.due = now + (state.state === "learning" ? LEARNING_STEPS_MS[0]! : RELEARNING_STEPS_MS[0]!);
    } else if (grade >= 2) {
      // Graduate
      next.state = "review";
      next.due = now + (next.stability! * DAY_MS);
    } else {
      // Hard: advance step but don't graduate yet
      const steps = state.state === "learning" ? LEARNING_STEPS_MS : RELEARNING_STEPS_MS;
      next.learningStep = Math.min(next.learningStep + 1, steps.length - 1);
      next.due = now + steps[next.learningStep]!;
    }
    return next;
  }
  
  if (state.state === "review") {
    const elapsedDays = Math.max(0, (now - state.lastReviewAt) / DAY_MS);
    const R = retrievability(state.stability, elapsedDays);
    const S_old = state.stability!;
    const D_old = state.difficulty!;
    
    // Calculate new difficulty (FSRS formula)
    next.difficulty = constrainDifficulty(D_old - W[6] * (grade - 3));
    
    if (grade === 0) {
      // Lapse
      next.state = "relearning";
      next.lapses++;
      next.learningStep = 0;
      next.due = now + RELEARNING_STEPS_MS[0]!;
      // FSRS lapse stability formula
      next.stability = W[11] * Math.pow(D_old, -W[12]) * (Math.pow(S_old + 1, W[13]) - 1) * Math.exp(W[14] * (1 - R));
    } else {
      // Success
      const gradeMod = grade === 1 ? W[15] : grade === 2 ? 1 : W[16];
      next.stability = S_old * (
        Math.exp(W[8]) * (11 - next.difficulty) * Math.pow(S_old, -W[9]) * 
        (Math.exp(W[10] * (1 - R)) - 1) * gradeMod + 1
      );
      next.due = now + (next.stability * DAY_MS);
    }
    return next;
  }
  
  return next;
}
