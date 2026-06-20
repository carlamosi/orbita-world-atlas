import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export const CONTINENTS = ["All", "Africa", "Americas", "Asia", "Europe", "Oceania"] as const;
export type ContinentChoice = (typeof CONTINENTS)[number];

const STORAGE_KEY = "orbita.continentPref";

export function loadContinentPref(): ContinentChoice {
  if (typeof window === "undefined") return "All";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return (CONTINENTS as readonly string[]).includes(v ?? "")
    ? (v as ContinentChoice)
    : "All";
}

export function saveContinentPref(v: ContinentChoice) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, v);
}

/**
 * Continent filter for Find / Name / Flags / Capitals HUDs. Sits directly
 * underneath SessionHud so the user can re-scope mid-flow. Persisted to
 * localStorage so the preference survives mode switches.
 */
export function ContinentSelect({
  value,
  onChange,
  className,
}: {
  value: ContinentChoice;
  onChange: (v: ContinentChoice) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "glass rounded-2xl px-2 py-1.5 flex flex-wrap gap-1 max-w-[260px]",
        className,
      )}
      role="tablist"
      aria-label="Filter by continent"
    >
      {CONTINENTS.map((c) => (
        <button
          key={c}
          type="button"
          role="tab"
          aria-selected={value === c}
          onClick={() => {
            saveContinentPref(c);
            onChange(c);
          }}
          className={cn(
            "px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider transition-colors",
            value === c
              ? "bg-white/15 text-white"
              : "text-white/55 hover:text-white",
          )}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

export function useContinentPref(): [ContinentChoice, (v: ContinentChoice) => void] {
  const [v, setV] = useState<ContinentChoice>("All");
  useEffect(() => {
    setV(loadContinentPref());
  }, []);
  return [v, setV];
}
