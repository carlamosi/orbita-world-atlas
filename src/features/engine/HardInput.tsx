import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { spring } from "@/lib/motion";
import { exactMatch, fuzzyMatch } from "@/lib/fuzzy";
import type { Country } from "@/types/country";

interface Props {
  target: Country;
  matchTarget?: string;
  onSubmit: (ok: boolean) => void;
  placeholder?: string;
}

/**
 * Shared typing surface for Name Hard, Flags Hard, Capitals Hard, and future typing modes.
 * - No Submit button.
 * - Instant validation on every keystroke via `exactMatch` (correct => submit).
 * - Enter still works as a fallback (uses `fuzzyMatch` to be forgiving).
 */
export function HardInput({ target, matchTarget, onSubmit, placeholder = "Type the country…" }: Props) {
  const [val, setVal] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  // Re-focus and clear when target changes
  useEffect(() => {
    ref.current?.focus();
    setVal("");
  }, [target.iso3]);

  const expectedText = matchTarget ?? target.name;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.soft}
      className="max-w-md mx-auto glass-strong rounded-2xl p-4 flex items-center gap-3"
    >
      <input
        ref={ref}
        value={val}
        onChange={(e) => {
          const v = e.target.value;
          setVal(v);
          if (exactMatch(v, expectedText)) onSubmit(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (val.trim()) onSubmit(fuzzyMatch(val, expectedText));
          }
        }}
        placeholder={placeholder}
        className="flex-1 bg-transparent outline-none text-white placeholder:text-white/35 font-display text-lg"
        autoComplete="off"
        autoCapitalize="words"
        spellCheck={false}
      />
    </motion.div>
  );
}
