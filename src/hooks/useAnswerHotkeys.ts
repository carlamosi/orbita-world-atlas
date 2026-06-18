import { useEffect } from "react";

/**
 * Global 1–4 answer hotkeys, shared across every game mode.
 *
 * - Listens on `window` regardless of focus, hover, or mouse position.
 * - Disabled when an input is focused or when a Radix dialog/popover is open.
 * - Caller passes an ordered list of answer ids and a single callback.
 */
export function useAnswerHotkeys(
  options: ReadonlyArray<{ id: string }> | null | undefined,
  onPick: (id: string) => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled || !options || options.length === 0) return;
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const active = document.activeElement as HTMLElement | null;
      if (active) {
        const tag = active.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          active.isContentEditable
        )
          return;
      }
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > Math.min(9, options!.length)) return;
      e.preventDefault();
      onPick(options![n - 1]!.id);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [options, onPick, enabled]);
}
