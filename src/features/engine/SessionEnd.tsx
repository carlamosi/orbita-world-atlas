import { AnimatePresence, motion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/orbita-badge";
import { Button } from "@/components/ui/orbita-button";
import { spring } from "@/lib/motion";

interface Props {
  show: boolean;
  score: number;
  correct: number;
  total: number;
  wrong: number;
  bestCombo: number;
  durationMs: number;
  onReplay: () => void;
}

export function SessionEnd({
  show,
  score,
  correct,
  total,
  wrong,
  bestCombo,
  durationMs,
  onReplay,
}: Props) {
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  const seconds = Math.round(durationMs / 100) / 10;
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center px-6 backdrop-blur-md bg-black/50"
        >
          <motion.div
            initial={{ y: 30, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            transition={spring.soft}
            className="glass-strong rounded-3xl p-10 max-w-md w-full text-center"
          >
            <Badge tone="cyan">Session complete</Badge>
            <div className="mt-4 font-display text-5xl text-white tracking-tight text-glow-violet">
              {score}
              <span className="text-[color:var(--muted)] text-xl font-mono ml-1">pts</span>
            </div>
            <div className="mt-2 text-white/55 text-sm">
              {correct}/{total} correct · {seconds}s
            </div>
            <div className="mt-8 grid grid-cols-3 gap-3 font-mono text-[11px] uppercase tracking-wider text-white/55">
              <Stat label="Accuracy" value={`${accuracy}%`} />
              <Stat label="Best combo" value={`×${bestCombo}`} />
              <Stat label="Wrong" value={wrong} />
            </div>
            <div className="mt-8 flex gap-3 justify-center">
              <Button onClick={onReplay}>Play again</Button>
              <Link to="/">
                <Button variant="secondary">Home</Button>
              </Link>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="glass rounded-xl py-3">
      <div className="font-display text-base text-white normal-case tracking-tight">
        {value}
      </div>
      <div className="mt-1 text-[10px]">{label}</div>
    </div>
  );
}
