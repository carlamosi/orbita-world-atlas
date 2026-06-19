import { useEffect } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Compass } from "lucide-react";
import { COUNTRY_BY_ISO3 } from "@/lib/countries";
import { Badge } from "@/components/ui/orbita-badge";
import { Button } from "@/components/ui/orbita-button";
import { FlagImage } from "@/components/ui/FlagImage";
import { EXPEDITIONS, type Expedition } from "./expeditions";
import { cn } from "@/lib/utils";
import { spring } from "@/lib/motion";

interface Props {
  selected: Expedition | null;
  step: number;
  onSelect: (id: string | null) => void;
  onStep: (step: number) => void;
  onFocusIso3: (iso3: string) => void;
}

export function ExpeditionsPanel({ selected, step, onSelect, onStep, onFocusIso3 }: Props) {
  // ← / → navigate within expedition
  useEffect(() => {
    if (!selected) return;
    function onKey(e: KeyboardEvent) {
      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || active?.isContentEditable) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        onStep(Math.min(selected!.iso3s.length - 1, step + 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        onStep(Math.max(0, step - 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, step, onStep]);

  // Auto-focus globe whenever step changes
  useEffect(() => {
    if (!selected) return;
    const iso = selected.iso3s[step];
    if (iso) onFocusIso3(iso);
  }, [selected, step, onFocusIso3]);

  if (!selected) {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={spring.soft}
        className="glass-strong rounded-3xl p-6 h-full overflow-y-auto"
      >
        <Badge tone="violet">Guided Expeditions</Badge>
        <h2 className="mt-3 font-display text-2xl text-white tracking-tight text-glow-violet">
          Pick a journey
        </h2>
        <p className="mt-2 text-white/55 text-[13px]">
          Ordered tours through curated countries. Step through with ← / →.
        </p>
        <div className="mt-5 space-y-2">
          {EXPEDITIONS.map((e) => (
            <button
              key={e.id}
              onClick={() => onSelect(e.id)}
              className="w-full text-left glass rounded-2xl p-4 hover:border-white/25 hover:-translate-y-0.5 transition-all"
            >
              <div className="flex items-center gap-2">
                <Compass className="size-4 text-[color:var(--cyan)]" />
                <div className="font-display text-base text-white tracking-tight">{e.title}</div>
                <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-white/40">
                  {e.iso3s.length} stops
                </span>
              </div>
              <div className="mt-1 text-[12px] text-white/55">{e.subtitle}</div>
            </button>
          ))}
        </div>
      </motion.div>
    );
  }

  const iso = selected.iso3s[step];
  const country = iso ? COUNTRY_BY_ISO3.get(iso) : null;
  const atEnd = step >= selected.iso3s.length - 1;
  const atStart = step <= 0;

  return (
    <motion.div
      key={selected.id}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={spring.soft}
      className="glass-strong rounded-3xl p-6 h-full overflow-y-auto"
    >
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => onSelect(null)}
          className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/45 hover:text-white"
        >
          ← All expeditions
        </button>
        <span className="font-mono text-[10px] uppercase tracking-wider text-white/45">
          {step + 1} / {selected.iso3s.length}
        </span>
      </div>

      <h2 className="mt-3 font-display text-2xl text-white tracking-tight text-glow-violet">
        {selected.title}
      </h2>

      {country && (
        <motion.div
          key={country.iso3}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.soft}
          className="mt-5"
        >
          <div className="flex items-start gap-4">
            <FlagImage
              iso2={country.iso2}
              alt={country.name}
              size={320}
              className="w-24 aspect-[3/2] shrink-0"
            />
            <div className="min-w-0">
              <Badge tone="cyan">{country.continent}</Badge>
              <div className="mt-2 font-display text-2xl text-white tracking-tight truncate">
                {country.name}
              </div>
              <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/45 mt-1">
                Capital: {country.capital ?? "—"}
              </div>
            </div>
          </div>
          <p className="mt-4 text-[13px] text-white/65 leading-relaxed">
            {country.subregion ? `${country.subregion} · ` : ""}
            Population {new Intl.NumberFormat("en-US").format(country.population)}.
            {country.borders.length > 0
              ? ` Shares borders with ${country.borders.length} ${country.borders.length === 1 ? "country" : "countries"}.`
              : " An island or otherwise without land borders."}
          </p>
        </motion.div>
      )}

      <div className="mt-6 flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={atStart}
          onClick={() => onStep(step - 1)}
        >
          <ChevronLeft className="size-4" /> Prev
        </Button>
        <Button size="sm" disabled={atEnd} onClick={() => onStep(step + 1)}>
          Next <ChevronRight className="size-4" />
        </Button>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-white/40">
          ← / → keys
        </span>
      </div>

      <div className="mt-6">
        <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/45 mb-2">
          Itinerary
        </div>
        <div className="flex flex-wrap gap-1.5">
          {selected.iso3s.map((id, i) => {
            const c = COUNTRY_BY_ISO3.get(id);
            if (!c) return null;
            return (
              <button
                key={id}
                onClick={() => onStep(i)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] transition-colors flex items-center gap-1.5",
                  i === step
                    ? "bg-white/15 text-white"
                    : "text-white/55 hover:text-white hover:bg-white/8",
                )}
              >
                <FlagImage iso2={c.iso2} alt={c.name} className="w-4 h-3 rounded-sm" />
                {c.name}
              </button>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
