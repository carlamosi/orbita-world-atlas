import type { ConceptProgressRow } from "../db/orbita-db";
import { retrievability } from "./engine";

export interface PlannerConfig {
  maxNewPerSession?: number;
  sessionSize?: number;
}

/**
 * Generates an ordered queue of concepts to study based on FSRS priority buckets.
 */
export function generateSessionQueue(
  allConcepts: ConceptProgressRow[], 
  explorationIso3?: string, 
  config: PlannerConfig = {}
): ConceptProgressRow[] {
  const now = Date.now();
  const sessionSize = config.sessionSize || 20;
  const maxNew = config.maxNewPerSession || 5;
  
  const bucketA: ConceptProgressRow[] = []; // Learning / Relearning
  const bucketB: ConceptProgressRow[] = []; // Overdue / Due Review
  const bucketC: ConceptProgressRow[] = []; // Weak
  const bucketD: ConceptProgressRow[] = []; // Exploration context
  const bucketE: ConceptProgressRow[] = []; // New
  
  for (const concept of allConcepts) {
    if (concept.fsrs_state === "learning" || concept.fsrs_state === "relearning") {
      if (concept.fsrs_due <= now) {
        bucketA.push(concept);
      }
    } else if (concept.fsrs_state === "review") {
      if (concept.fsrs_due <= now) {
        bucketB.push(concept);
      } else {
        const elapsedDays = Math.max(0, (now - concept.fsrs_last_review) / 86400000);
        const R = retrievability(concept.fsrs_stability, elapsedDays);
        if (R < 0.50) {
          bucketC.push(concept);
        }
      }
    } else if (concept.fsrs_state === "new") {
      if (explorationIso3 && concept.iso3 === explorationIso3) {
        bucketD.push(concept);
      } else {
        bucketE.push(concept);
      }
    }
  }
  
  // Sort A & B by how overdue they are (due - now)
  bucketA.sort((a, b) => a.fsrs_due - b.fsrs_due);
  bucketB.sort((a, b) => a.fsrs_due - b.fsrs_due);
  
  // Build raw queue by appending buckets in priority order
  let rawQueue: ConceptProgressRow[] = [];
  rawQueue.push(...bucketA);
  rawQueue.push(...bucketB);
  rawQueue.push(...bucketC);
  rawQueue.push(...bucketD);
  rawQueue.push(...bucketE.slice(0, Math.max(0, maxNew - bucketD.length)));
  
  // Truncate to desired session size
  if (rawQueue.length > sessionSize) {
    rawQueue = rawQueue.slice(0, sessionSize);
  }
  
  return applyAntiRepetitionConstraints(rawQueue);
}

/**
 * Reorders the queue to prevent repetitive patterns (e.g. same skill 3x in a row, or same country consecutively).
 */
function applyAntiRepetitionConstraints(queue: ConceptProgressRow[]): ConceptProgressRow[] {
  if (queue.length <= 1) return queue;
  
  const result: ConceptProgressRow[] = [];
  const remaining = [...queue];
  
  // Greedy approach to satisfy constraints
  while (remaining.length > 0) {
    let bestIdx = 0;
    
    // Find the first item that doesn't violate constraints
    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      if (isValidNext(result, candidate)) {
        bestIdx = i;
        break;
      }
    }
    
    // If no item is perfectly valid, we just take the first one to avoid infinite loop
    result.push(remaining.splice(bestIdx, 1)[0]);
  }
  
  return result;
}

function isValidNext(currentQueue: ConceptProgressRow[], nextItem: ConceptProgressRow): boolean {
  if (currentQueue.length === 0) return true;
  
  const last = currentQueue[currentQueue.length - 1];
  
  // 1. Do not ask about the exact same country consecutively
  if (last.iso3 === nextItem.iso3) return false;
  
  // 2. Do not ask the exact same skill type > 2 times consecutively
  if (currentQueue.length >= 2) {
    const secondLast = currentQueue[currentQueue.length - 2];
    if (last.skill === nextItem.skill && secondLast.skill === nextItem.skill) {
      return false;
    }
  }
  
  return true;
}
