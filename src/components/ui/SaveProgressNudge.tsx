import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const NUDGE_KEY = "orbita.nudge.shown";

/**
 * SaveProgressNudge
 *
 * A dismissible, animated banner that appears once after a guest user
 * completes their first game session. It invites them to create an account
 * so their FSRS progress is saved and synced across devices.
 */
export function SaveProgressNudge() {
  const { signedIn, loading } = useAuth();
  const [visible, setVisible] = useState(false);
  const [learnedCount, setLearnedCount] = useState(0);

  useEffect(() => {
    if (loading || signedIn) return;
    const onSessionEnd = (ev: Event) => {
      if (sessionStorage.getItem(NUDGE_KEY)) return;
      sessionStorage.setItem(NUDGE_KEY, "1");
      const detail = (ev as CustomEvent<{ correct?: number }>).detail;
      setLearnedCount(Math.max(1, detail?.correct ?? 1));
      setTimeout(() => setVisible(true), 1200);
    };
    window.addEventListener("orbita:session-end", onSessionEnd);
    return () => window.removeEventListener("orbita:session-end", onSessionEnd);
  }, [loading, signedIn]);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setVisible(false), 12_000);
    return () => clearTimeout(t);
  }, [visible]);

  const headline =
    learnedCount > 1
      ? `You just learned ${learnedCount} countries!`
      : "You just completed your first session!";

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          id="save-progress-nudge"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 80, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 60, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm"
        >
          <div
            className="relative rounded-2xl border border-white/10 px-4 py-3.5 flex items-center gap-3 shadow-2xl"
            style={{
              background:
                "linear-gradient(135deg, rgba(15,12,38,0.97) 0%, rgba(10,12,28,0.97) 100%)",
              backdropFilter: "blur(20px)",
              boxShadow:
                "0 0 0 1px rgba(108,99,255,0.2), 0 20px 60px -10px rgba(108,99,255,0.3)",
            }}
          >
            <motion.div
              className="shrink-0 grid place-items-center size-9 rounded-xl"
              animate={{
                boxShadow: [
                  "0 0 12px rgba(0,255,178,0.4)",
                  "0 0 20px rgba(0,255,178,0.7)",
                  "0 0 12px rgba(0,255,178,0.4)",
                ],
              }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              style={{
                background: "rgba(0,255,178,0.12)",
                border: "1px solid rgba(0,255,178,0.25)",
              }}
            >
              <Globe className="size-4 text-[color:var(--neon)]" />
            </motion.div>

            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-white leading-tight">
                🌍 {headline}
              </p>
              <p className="text-[11px] text-white/55 mt-0.5 leading-tight">
                Create a free account to keep your ORBITA memory map.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Link
                to="/auth"
                search={{ mode: "signup" }}
                onClick={() => setVisible(false)}
                className="inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                style={{
                  background: "linear-gradient(135deg, var(--violet), var(--cyan))",
                  boxShadow: "0 4px 14px -4px rgba(108,99,255,0.5)",
                }}
              >
                Save your progress →
              </Link>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setVisible(false)}
                className="grid place-items-center size-7 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
