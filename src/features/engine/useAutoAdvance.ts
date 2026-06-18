import { useEffect } from "react";
import type { AnswerState } from "./useSession";

interface Opts {
  /** Current answer state of the session. */
  answerState: AnswerState;
  /** Whether the session has ended (don't auto-advance past the end). */
  finished: boolean;
  /** Called to advance to the next question. */
  next: () => void;
  /** Optional override; defaults: correct 900ms, wrong/revealed 1500ms. */
  correctDelayMs?: number;
  /** Wrong/revealed dwell — slightly longer so users can absorb the answer. */
  wrongDelayMs?: number;
  /** Allow callers to opt out (e.g. paused, modal open). */
  enabled?: boolean;
}

/**
 * Auto-advances a session shortly after feedback resolves. Keeps the flow
 * continuous — no manual "Next" clicks except on the final results screen.
 */
export function useAutoAdvance({
  answerState,
  finished,
  next,
  correctDelayMs = 900,
  wrongDelayMs = 1500,
  enabled = true,
}: Opts) {
  useEffect(() => {
    if (!enabled || finished) return;
    if (answerState === "idle") return;
    const delay = answerState === "correct" ? correctDelayMs : wrongDelayMs;
    const id = window.setTimeout(() => next(), delay);
    return () => window.clearTimeout(id);
  }, [answerState, finished, next, correctDelayMs, wrongDelayMs, enabled]);
}
