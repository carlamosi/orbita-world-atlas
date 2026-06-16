import { motion } from "framer-motion";
import { spring } from "@/lib/motion";

interface Props {
  score: number;
  combo: number;
  correct: number;
  wrong: number;
  index: number;
  total: number;
}

export function SessionHud({ score, combo, correct, wrong, index, total }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={spring.soft}
      className="glass rounded-2xl px-4 py-3 font-mono text-[11px] uppercase tracking-wider text-white/60 space-y-1 min-w-[150px]"
    >
      <Row label="Score" value={score} />
      <Row label="Combo" value={`×${combo}`} accent={combo >= 3} />
      <Row label="Right" value={correct} />
      <Row label="Wrong" value={wrong} />
      <Row label="Q" value={`${index + 1}/${total}`} />
    </motion.div>
  );
}

function Row({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div className="flex justify-between gap-6">
      <span>{label}</span>
      <span className={accent ? "text-[color:var(--neon)]" : "text-white"}>{value}</span>
    </div>
  );
}
