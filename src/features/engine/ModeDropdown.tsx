import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Premium glassmorphic dropdown menu for mode selection.
 * Replaces segmented controls to save horizontal space while
 * maintaining elegant interaction design and accessibility.
 */
export function ModeDropdown<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;

  return (
    <div className="relative z-50" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="glass flex items-center gap-2 px-4 py-1.5 rounded-full hover:bg-white/10 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cyan)]/60"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="text-[11px] font-mono uppercase tracking-wider text-white">
          {selectedLabel}
        </span>
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 text-white/50 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 top-full mt-2 w-48 p-1.5 glass rounded-[1rem] border border-white/10 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5)] bg-black/40 backdrop-blur-xl flex flex-col"
            role="listbox"
          >
            {options.map((o) => (
              <button
                key={o.value}
                role="option"
                aria-selected={value === o.value}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex items-center w-full px-3 py-2.5 rounded-xl text-[11px] font-mono uppercase tracking-wider text-left transition-colors outline-none",
                  value === o.value
                    ? "bg-white/15 text-white"
                    : "text-white/55 hover:bg-white/10 hover:text-white focus-visible:bg-white/10"
                )}
              >
                {o.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
