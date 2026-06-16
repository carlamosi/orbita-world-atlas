import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLiveQuery } from "dexie-react-hooks";
import { COUNTRIES, COUNTRY_BY_ISO3 } from "@/lib/countries";
import { db } from "@/lib/db/orbita-db";
import { Badge } from "@/components/ui/orbita-badge";
import { Button } from "@/components/ui/orbita-button";
import { FlagImage } from "@/components/ui/FlagImage";
import { cn } from "@/lib/utils";
import { spring } from "@/lib/motion";
import { Link } from "@tanstack/react-router";
import type { Country } from "@/types/country";

const Globe3D = lazy(() => import("@/features/globe/Globe3D"));

const CONTINENTS = ["All", "Africa", "Americas", "Asia", "Europe", "Oceania"] as const;

export default function ExplorerPage() {
  const [selectedIso3, setSelectedIso3] = useState<string>("FRA");
  const [continent, setContinent] = useState<string>("All");
  const [query, setQuery] = useState("");

  const selected = COUNTRY_BY_ISO3.get(selectedIso3) ?? null;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return COUNTRIES.filter((c) => {
      if (continent !== "All" && c.continent !== continent) return false;
      if (q && !c.name.toLowerCase().includes(q) && !c.capital?.toLowerCase().includes(q))
        return false;
      return true;
    }).slice(0, 60);
  }, [continent, query]);

  const pov = useMemo(
    () => (selected ? { lat: selected.coordinates[0], lng: selected.coordinates[1], altitude: 1.7 } : undefined),
    [selected],
  );

  return (
    <div className="relative min-h-dvh pt-24 pb-10 px-4">
      <div className="mx-auto max-w-[1400px] grid lg:grid-cols-[1fr,440px] gap-4 h-[calc(100dvh-7rem)]">
        {/* GLOBE */}
        <div className="relative rounded-3xl overflow-hidden border border-white/10 glass">
          <div className="absolute inset-0">
            <Suspense fallback={<div className="size-full" />}>
              <Globe3D
                countries={COUNTRIES}
                highlightIso3={selectedIso3}
                onCountryClick={setSelectedIso3}
                pointOfView={pov}
                quality="medium"
              />
            </Suspense>
          </div>
          <div className="absolute top-3 left-3 right-3 flex items-center gap-2 flex-wrap">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search countries or capitals…"
              className="glass rounded-full px-4 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30 min-w-[220px] flex-1"
            />
            <div className="glass rounded-full p-1 flex text-[11px] font-mono uppercase tracking-wider flex-wrap">
              {CONTINENTS.map((c) => (
                <button
                  key={c}
                  onClick={() => setContinent(c)}
                  className={cn(
                    "px-2.5 py-1 rounded-full transition-colors",
                    continent === c ? "bg-white/10 text-white" : "text-white/55 hover:text-white",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const pool = results.length > 0 ? results : COUNTRIES;
                setSelectedIso3(pool[Math.floor(Math.random() * pool.length)]!.iso3);
              }}
            >
              Shuffle
            </Button>
          </div>

          {/* result rail */}
          {(query || continent !== "All") && (
            <div className="absolute bottom-3 left-3 right-3 glass-strong rounded-2xl px-3 py-2 overflow-x-auto">
              <div className="flex gap-2">
                {results.map((c) => (
                  <button
                    key={c.iso3}
                    onClick={() => setSelectedIso3(c.iso3)}
                    className={cn(
                      "shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] transition-colors",
                      selectedIso3 === c.iso3
                        ? "bg-white/15 text-white"
                        : "text-white/65 hover:text-white hover:bg-white/8",
                    )}
                  >
                    <FlagImage iso2={c.iso2} alt={c.name} className="w-5 h-3.5 rounded-sm" />
                    {c.name}
                  </button>
                ))}
                {results.length === 0 && (
                  <span className="text-white/45 text-sm px-2 py-1">No matches.</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* PANEL */}
        <div className="relative">
          <AnimatePresence mode="wait">
            {selected && <CountryPanel key={selected.iso3} country={selected} onSelect={setSelectedIso3} />}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function CountryPanel({
  country,
  onSelect,
}: {
  country: Country;
  onSelect: (iso3: string) => void;
}) {
  const row = useLiveQuery(
    () => db().countryProgress.get(country.iso3),
    [country.iso3],
  );

  return (
    <motion.div
      initial={{ opacity: 0, x: 20, filter: "blur(6px)" }}
      animate={{ opacity: 1, x: 0, filter: "blur(0)" }}
      exit={{ opacity: 0, x: 10, filter: "blur(6px)" }}
      transition={spring.soft}
      className="glass-strong rounded-3xl p-6 h-full overflow-y-auto"
    >
      <div className="flex items-start gap-4">
        <FlagImage
          iso2={country.iso2}
          alt={country.name}
          size={640}
          className="w-28 aspect-[3/2] shrink-0"
        />
        <div className="min-w-0">
          <Badge tone="violet">{country.continent}</Badge>
          <h1 className="mt-2 font-display text-3xl text-white tracking-tight text-glow-violet truncate">
            {country.name}
          </h1>
          <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-white/45 mt-1">
            {country.iso3} · {country.subregion || "—"}
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 font-mono text-[11px] uppercase tracking-wider text-white/55">
        <Stat label="Capital" value={country.capital ?? "—"} />
        <Stat label="Population" value={fmt(country.population)} />
        <Stat label="Area" value={`${fmt(country.area)} km²`} />
        <Stat label="Difficulty" value={country.difficulty} />
        <Stat label="Currencies" value={country.currencies.join(", ") || "—"} className="col-span-2" />
        <Stat label="Languages" value={country.languages.join(", ") || "—"} className="col-span-2" />
      </div>

      <div className="mt-6">
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/45 mb-2">
          Your mastery
        </div>
        <div className="space-y-2">
          {(["name", "flag", "capital", "location"] as const).map((sk) => {
            const v = row?.skills?.[sk]?.confidence ?? 0;
            return (
              <div key={sk}>
                <div className="flex justify-between text-[11px] font-mono uppercase tracking-wider text-white/55">
                  <span>{sk}</span>
                  <span className="text-white">{Math.round(v * 100)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/8 overflow-hidden mt-1">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(2, v * 100)}%`,
                      background:
                        v >= 0.8
                          ? "var(--neon)"
                          : v >= 0.4
                            ? "var(--cyan)"
                            : "var(--coral)",
                      boxShadow: v >= 0.8 ? "0 0 12px color-mix(in oklab, var(--neon) 60%, transparent)" : undefined,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {country.borders.length > 0 && (
        <div className="mt-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/45 mb-2">
            Neighbours
          </div>
          <div className="flex flex-wrap gap-1.5">
            {country.borders.map((iso) => {
              const n = COUNTRY_BY_ISO3.get(iso);
              if (!n) return null;
              return (
                <button
                  key={iso}
                  onClick={() => onSelect(iso)}
                  className="glass rounded-full px-3 py-1 text-[12px] text-white/75 hover:text-white hover:border-white/25 transition-colors flex items-center gap-2"
                >
                  <FlagImage iso2={n.iso2} alt={n.name} className="w-4 h-3 rounded-sm" />
                  {n.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-7 flex gap-2 flex-wrap">
        <Link to="/name"><Button size="sm">Practice Name</Button></Link>
        <Link to="/flags"><Button size="sm" variant="secondary">Flags</Button></Link>
        <Link to="/capitals"><Button size="sm" variant="secondary">Capitals</Button></Link>
      </div>
    </motion.div>
  );
}

function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("glass rounded-xl px-3 py-2", className)}>
      <div className="text-[10px]">{label}</div>
      <div className="mt-0.5 font-display text-[14px] text-white normal-case tracking-tight truncate">
        {value}
      </div>
    </div>
  );
}

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}
