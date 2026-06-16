import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { spring } from "@/lib/motion";

interface Props {
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
  keyId: string | number;
}

export function Prompt({ eyebrow, title, subtitle, keyId }: Props) {
  return (
    <motion.div
      key={keyId}
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.soft}
      className="glass-strong rounded-2xl px-6 py-5 text-center max-w-xl w-full"
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/45">
        {eyebrow}
      </div>
      <div className="mt-2 font-display text-2xl md:text-3xl text-white tracking-tight">
        {title}
      </div>
      {subtitle && <div className="mt-1 text-[12px] text-white/50">{subtitle}</div>}
    </motion.div>
  );
}
