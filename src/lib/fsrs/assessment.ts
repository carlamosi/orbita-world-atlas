import type { FsrsState, Grade } from "./engine";

export interface ValidationResult {
  correct: boolean;
  softCorrect: boolean; // e.g., spelling near-miss or spatial near-miss
}

export interface QuestionAttempt {
  validationResult: ValidationResult;
  responseMs: number;
  attemptNumber: number;
  hintsUsed: number;
  questionType: string; // e.g. "location", "capital", "flag"
  memoryState: FsrsState | null;
  overdueMs: number;
}

/**
 * Pure function to compute the FSRS grade from raw behavioral signals.
 * Resolves conflicts between signals like speed, accuracy, and attempts.
 */
export function assess(attempt: QuestionAttempt): Grade {
  const { validationResult, responseMs, attemptNumber, hintsUsed, questionType, overdueMs } = attempt;
  
  // 1. Correctness is decisive
  if (!validationResult.correct) {
    return 0; // Again
  }
  
  let grade: Grade = 2; // Base Good
  
  // 2. Soft-correct penalty
  if (validationResult.softCorrect) {
    grade = 1; // Max Hard for a soft-correct
  }
  
  // 3. Attempt penalty
  if (attemptNumber >= 2) {
    grade = Math.min(grade, 1) as Grade; // Max Hard if multiple attempts
  }
  
  // 4. Hint penalty
  if (hintsUsed > 0) {
    grade = Math.min(grade, 1) as Grade; // Max Hard if hints used
  }
  
  // 5. Response time modifiers
  let isVeryFast = false;
  let isSlow = false;
  
  if (questionType === "location") {
    if (responseMs < 2000) isVeryFast = true;
    else if (responseMs >= 12000) isSlow = true;
  } else if (questionType === "capital") {
    if (responseMs < 4000) isVeryFast = true;
    else if (responseMs >= 20000) isSlow = true;
  } else if (questionType === "flag") {
    if (responseMs < 1500) isVeryFast = true;
    else if (responseMs >= 8000) isSlow = true;
  } else {
    // Default fallback
    if (responseMs < 2000) isVeryFast = true;
    else if (responseMs >= 15000) isSlow = true;
  }
  
  // Apply time modifiers (only if no negative penalties have applied yet)
  if (isVeryFast && grade === 2) {
    grade = 3; // Easy
  } else if (isSlow) {
    grade = Math.max(0, grade - 1) as Grade;
  }
  
  // 6. Overdue bonus
  // If memory is more durable than predicted (overdue but remembered perfectly)
  if (
    grade === 2 && 
    overdueMs > 0 && 
    overdueMs < 7 * 86400000 && // Not severely overdue
    attemptNumber === 1 && 
    hintsUsed === 0 && 
    !validationResult.softCorrect
  ) {
    grade = 3; // Easy
  }
  
  return Math.min(3, Math.max(0, grade)) as Grade;
}
