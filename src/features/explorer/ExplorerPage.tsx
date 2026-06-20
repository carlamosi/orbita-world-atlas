import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
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
import { EXPEDITIONS, findExpedition } from "./expeditions";
import { ExpeditionsPanel } from "./Expeditions";

const Globe3D = lazy(() => import("@/features/globe/Globe3D"));

const CONTINENTS = ["All", "Africa", "Americas", "Asia", "Europe", "Oceania"] as const;

type Layer = "explore" | "country" | "expedition";

/**
 * Atlas / Explorer.
 *
 * Layout invariants:
 *  - Top-level container is `min-h-dvh` with a fixed HUD band (tabs + search)
 *    sitting OUTSIDE the globe — never overlaid on it.
 *  - Below the HUD: a stable CSS grid (1-col mobile, 2-col ≥lg).
 *  - Globe is contained in its grid cell, fills available height. No absolute
 *    overlays leak across cells. No `position: absolute` on the panel.
 *  - The panel column scrolls internally; nothing escapes the cell box.
 */
export default function ExplorerPage() {
  const [layer, setLayer] = useState<Layer>("explore");
  // Default POV opens on Spain (ESP). Last-selected country is persisted to
  // localStorage so subsequent visits restore the user's prior camera focus.
  const [selectedIso3, setSelectedIso3] = useState<string>(() => {
    if (typeof window === "undefined") return "ESP";
    const saved = window.localStorage.getItem("orbita.explorer.lastIso3");
    return saved && COUNTRY_BY_ISO3.has(saved) ? saved : "ESP";
  });
  const [continent, setContinent] = useState<string>("All");
  const [query, setQuery] = useState("");
  const [expeditionId, setExpeditionId] = useState<string | null>(null);
  const [expeditionStep, setExpeditionStep] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const l = url.searchParams.get("layer") as Layer | null;
    const iso = url.searchParams.get("iso");
    const exp = url.searchParams.get("exp");
    if (l) setLayer(l);
    if (iso && COUNTRY_BY_ISO3.has(iso)) setSelectedIso3(iso);
    if (exp && findExpedition(exp)) {
      setExpeditionId(exp);
      setLayer("expedition");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("layer", layer);
    if (selectedIso3) {
      url.searchParams.set("iso", selectedIso3);
      window.localStorage.setItem("orbita.explorer.lastIso3", selectedIso3);
    } else url.searchParams.delete("iso");
    if (expeditionId) url.searchParams.set("exp", expeditionId);
    else url.searchParams.delete("exp");
    window.history.replaceState({}, "", url.toString());
  }, [layer, selectedIso3, expeditionId]);

  const selected = COUNTRY_BY_ISO3.get(selectedIso3) ?? null;
  const expedition = expeditionId ? findExpedition(expeditionId) ?? null : null;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return COUNTRIES.filter((c) => {
      if (continent !== "All" && c.continent !== continent) return false;
      if (q && !c.name.toLowerCase().includes(q) && !c.capital?.toLowerCase().includes(q))
        return false;
      return true;
    }).slice(0, 60);
  }, [continent, query]);

  const focusIso3 =
    layer === "expedition" && expedition
      ? expedition.iso3s[expeditionStep] ?? null
      : selectedIso3;

  const pov = useMemo(() => {
    const iso = focusIso3;
    const c = iso ? COUNTRY_BY_ISO3.get(iso) : null;
    return c ? { lat: c.coordinates[0], lng: c.coordinates[1], altitude: 1.7 } : undefined;
  }, [focusIso3]);

  const handleGlobeClick = useCallback(
    (iso3: string) => {
      setSelectedIso3(iso3);
      if (layer === "explore") setLayer("country");
    },
    [layer],
  );

  const handleExpeditionFocus = useCallback((iso3: string) => {
    setSelectedIso3(iso3);
  }, []);

  return (
    <div className="min-h-dvh pt-20 pb-6 px-4 lg:px-8 flex flex-col">
      {/* HUD BAND — outside the grid, always visible */}
      <header className="mx-auto w-full max-w-[1440px] flex flex-wrap items-center gap-3 py-3">
        <LayerTabs value={layer} onChange={setLayer} />
        {layer === "explore" && (
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search countries or capitals…"
              className="glass rounded-full px-4 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30 min-w-[200px] flex-1"
            />
            <div className="glass rounded-full p-1 hidden md:flex text-[11px] font-mono uppercase tracking-wider">
              {CONTINENTS.map((c) => (
                <button
                  key={c}
                  onClick={() => setContinent(c)}
                  className={cn(
                    "px-2.5 py-1 rounded-full transition-colors",
                    continent === c
                      ? "bg-white/10 text-white"
                      : "text-white/55 hover:text-white",
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
                setSelectedIso3(
                  pool[Math.floor(Math.random() * pool.length)]!.iso3,
                );
              }}
            >
              Shuffle
            </Button>
          </>
        )}
      </header>

      {/* MAIN GRID — stable 2-col on lg+ */}
      <div
        className="mx-auto w-full max-w-[1440px] mt-3 grid gap-4 flex-1 min-h-0
          grid-cols-1
          lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]"
      >
        {/* GLOBE CELL */}
        <div className="relative rounded-3xl overflow-hidden border border-white/10 glass min-h-[420px] lg:min-h-0">
          <Suspense fallback={<div className="size-full" />}>
            <Globe3D
              countries={COUNTRIES}
              highlightIso3={focusIso3 ?? null}
              onCountryClick={handleGlobeClick}
              pointOfView={pov}
              quality="medium"
            />
          </Suspense>

          {/* Inline result rail — INSIDE the globe cell, doesn't escape */}
          {layer === "explore" && (query || continent !== "All") && (
            <div className="absolute bottom-3 left-3 right-3 glass-strong rounded-2xl px-3 py-2 overflow-x-auto z-10">
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

        {/* PANEL CELL — internally scrollable */}
        <aside className="min-h-0 lg:overflow-hidden">
          <div className="h-full lg:overflow-y-auto pr-1">
            <AnimatePresence mode="wait">
              {layer === "expedition" ? (
                <ExpeditionsPanel
                  key="expedition-panel"
                  selected={expedition}
                  step={expeditionStep}
                  onSelect={(id) => {
                    setExpeditionId(id);
                    setExpeditionStep(0);
                  }}
                  onStep={setExpeditionStep}
                  onFocusIso3={handleExpeditionFocus}
                />
              ) : layer === "country" && selected ? (
                <CountryPanel
                  key={selected.iso3}
                  country={selected}
                  onSelect={setSelectedIso3}
                />
              ) : (
                <ExploreHint key="hint" onPickExpedition={() => setLayer("expedition")} />
              )}
            </AnimatePresence>
          </div>
        </aside>
      </div>
    </div>
  );
}

function LayerTabs({ value, onChange }: { value: Layer; onChange: (v: Layer) => void }) {
  const tabs: Array<{ id: Layer; label: string }> = [
    { id: "explore", label: "Explore" },
    { id: "country", label: "Country" },
    { id: "expedition", label: "Expeditions" },
  ];
  return (
    <div className="glass-strong rounded-full p-1 flex text-[11px] font-mono uppercase tracking-wider">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "px-3 py-1.5 rounded-full transition-colors whitespace-nowrap",
            value === t.id ? "bg-white/15 text-white" : "text-white/55 hover:text-white",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function ExploreHint({ onPickExpedition }: { onPickExpedition: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={spring.soft}
      className="glass-strong rounded-3xl p-6"
    >
      <Badge tone="cyan">Atlas Mode</Badge>
      <h2 className="mt-3 font-display text-2xl text-white tracking-tight text-glow-violet">
        Free exploration
      </h2>
      <p className="mt-2 text-white/55 text-[13px]">
        Pan and rotate the globe. Click any country to open its intelligence
        card, or follow a guided expedition.
      </p>
      <div className="mt-5 space-y-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/45">
          Featured journeys
        </div>
        {EXPEDITIONS.slice(0, 3).map((e) => (
          <button
            key={e.id}
            onClick={onPickExpedition}
            className="w-full text-left glass rounded-2xl p-3 hover:border-white/25 transition-all"
          >
            <div className="font-display text-sm text-white tracking-tight">
              {e.title}
            </div>
            <div className="text-[11px] text-white/55 mt-0.5">{e.subtitle}</div>
          </button>
        ))}
      </div>
    </motion.div>
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
      className="glass-strong rounded-3xl p-6"
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
        <Stat
          label="Currencies"
          value={country.currencies.join(", ") || "—"}
          className="col-span-2"
        />
        <Stat
          label="Languages"
          value={country.languages.join(", ") || "—"}
          className="col-span-2"
        />
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
                      boxShadow:
                        v >= 0.8
                          ? "0 0 12px color-mix(in oklab, var(--neon) 60%, transparent)"
                          : undefined,
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
