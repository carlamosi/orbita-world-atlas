import { cn } from "@/lib/utils";

/**
 * Generic pill-style toggle for sub-mode selection.
 * Each game mode defines its own option array and passes it here.
 *
 * Usage:
 *   <SubModeToggle
 *     options={[
 *       { value: "easy", label: "Easy" },
 *       { value: "hard", label: "Hard" },
 *     ]}
 *     value={mode}
 *     onChange={setMode}
 *   />
 */
export function SubModeToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      className="glass rounded-full p-1 flex text-[11px] font-mono uppercase tracking-wider whitespace-nowrap"
      role="group"
    >
      {options.map(({ value: v, label }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={cn(
            "px-3 py-1 rounded-full transition-colors whitespace-nowrap",
            value === v ? "bg-white/15 text-white" : "text-white/55 hover:text-white",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
