import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { spring } from "@/lib/motion";

interface Props {
  keyId: string | number;
  index: number;
  total: number;
  title: ReactNode;
  hint?: ReactNode;
}

/**
 * Cinematic, ultra-compact prompt pill.
 * Designed to sit at the top of an immersive view (globe, flag, etc.)
 * without ever covering the primary subject.
 */
export function PromptPill({ keyId, index, total, title, hint }: Props) {
  return (
    <motion.div
      key={keyId}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.soft}
      className="pointer-events-none px-4"
    >
      <div className="glass rounded-full pl-4 pr-5 py-2 flex items-center gap-3 pointer-events-auto max-w-[min(92vw,640px)] mx-auto">
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/45 whitespace-nowrap tabular-nums">
          {index + 1} / {total}
        </span>
        <span className="h-3 w-px bg-white/15 shrink-0" />
        <span className="font-display text-sm md:text-base text-white tracking-tight truncate">
          {title}
        </span>
        {hint && (
          <>
            <span className="h-3 w-px bg-white/15 shrink-0" />
            <span className="text-[11px] text-white/55 whitespace-nowrap">{hint}</span>
          </>
        )}
      </div>
    </motion.div>
  );
}
