import { useEffect } from "react";

/**
 * Global Spacebar = Skip across every gameplay mode.
 *
 * Ignored when an input/textarea/contenteditable is focused, when a Radix
 * dialog is open, or when modifier keys are held.
 */
export function useSkipHotkey(onSkip: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== " " && e.code !== "Space") return;
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
      e.preventDefault();
      onSkip();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSkip, enabled]);
}
