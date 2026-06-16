import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/orbita-button";
import { spring } from "@/lib/motion";
import type { ReactNode } from "react";

interface Props {
  show: boolean;
  state: "correct" | "wrong" | "revealed";
  title: ReactNode;
  subtitle?: ReactNode;
  onNext: () => void;
  onSkip?: () => void;
}

export function FeedbackBar({ show, state, title, subtitle, onNext, onSkip }: Props) {
  return (
    <AnimatePresence mode="wait">
      {show && (
        <motion.div
          key={state}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={spring.crisp}
          className="px-4 w-full max-w-md mx-auto"
        >
          <div
            className={`glass-strong rounded-2xl px-6 py-5 flex items-center justify-between gap-4 ${
              state === "correct"
                ? "shadow-[0_0_60px_-10px_color-mix(in_oklab,var(--neon)_60%,transparent)]"
                : "shadow-[0_0_60px_-10px_color-mix(in_oklab,var(--coral)_50%,transparent)]"
            }`}
          >
            <div className="text-left min-w-0">
              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/45">
                {state === "correct" ? "Nailed it" : state === "wrong" ? "Not quite" : "Revealed"}
              </div>
              <div className="font-display text-lg text-white truncate">{title}</div>
              {subtitle && <div className="text-[12px] text-white/55 truncate">{subtitle}</div>}
            </div>
            <Button size="sm" onClick={onNext}>
              Next →
            </Button>
          </div>
          {state === "wrong" && onSkip && (
            <button
              onClick={onSkip}
              className="mx-auto block mt-2 text-[11px] font-mono uppercase tracking-wider text-white/40 hover:text-white/70"
            >
              Skip
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
