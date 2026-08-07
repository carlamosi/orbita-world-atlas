import { lazy, Suspense, useEffect, useMemo, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { COUNTRIES, pickRandomCountries } from "@/lib/countries";
import { createSessionStore } from "@/features/engine/useSession";
import { useAutoAdvance } from "@/features/engine/useAutoAdvance";
import { useSkipHotkey } from "@/hooks/useSkipHotkey";
import { SessionEnd } from "@/features/engine/SessionEnd";
import { PromptPill } from "@/features/engine/PromptPill";
import { FeedbackBar } from "@/features/engine/FeedbackBar";
import { ModeDropdown } from "@/features/engine/ModeDropdown";
import { HardInput } from "@/features/engine/HardInput";
import { Button } from "@/components/ui/orbita-button";
import { Badge } from "@/components/ui/orbita-badge";
import { useAnswerHotkeys } from "@/hooks/useAnswerHotkeys";
import {
  ContinentSelect,
  useContinentPref,
  type ContinentChoice,
} from "@/features/engine/ContinentSelect";
import { cn } from "@/lib/utils";
import { spring } from "@/lib/motion";
import type { Country } from "@/types/country";
import { getPref, setPref } from "@/lib/db/repo";

const Globe3D = lazy(() => import("@/features/globe/Globe3D"));

const useCapSession = createSessionStore({ mode: "capital", skill: "capital" });

type SubMode = "countryToCap" | "capToCountry" | "locator";
type Mode = "easy" | "hard";

const SUB_MODE_OPTIONS = [
  { value: "countryToCap" as const, label: "Country → Cap" },
  { value: "capToCountry" as const, label: "Cap → Country" },
  { value: "locator" as const, label: "Globe Locator" },
];

const MODE_OPTIONS = [
  { value: "easy" as const, label: "Easy" },
  { value: "hard" as const, label: "Hard" },
];

export default function CapitalsPage() {
  const s = useCapSession();
  const [sub, setSub] = useState<SubMode>("countryToCap");
  const [mode, setMode] = useState<Mode>("easy");
  const [continent, setContinent] = useContinentPref();
  const current = s.queue[s.index] ?? null;
  const finished = s.endedAt !== null;

  // Persist preferences
  useEffect(() => {
    getPref("capitals.sub").then((sb) => sb && setSub(sb as SubMode));
    getPref("capitals.mode").then((m) => m && setMode(m as Mode));
  }, []);
  useEffect(() => {
    setPref("capitals.sub", sub);
    setPref("capitals.mode", mode);
  }, [sub, mode]);

  // Restart on format changes
  useEffect(() => {
    void s.start({ continent: continent === "All" ? undefined : continent });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [continent, sub, mode]);

  useAutoAdvance({
    answerState: s.answerState,
    finished,
    next: () => s.next(),
  });

  const onSkip = useCallback(() => {
    if (!finished && current && s.answerState === "idle") s.reveal();
  }, [finished, current, s]);
  useSkipHotkey(onSkip);

  const restartWithContinent = useCallback(
    (c: ContinentChoice) => {
      setContinent(c);
    },
    [setContinent],
  );

  const valid = current && current.capital;

  const options = useMemo(() => {
    if (!current) return [];
    const others = pickRandomCountries(3, new Set([current.iso3])).filter((c) => c.capital);
    return shuffle([current, ...others].slice(0, 4));
  }, [current]);

  const pov = useMemo(() => {
    if (sub !== "locator" || !current) return undefined;
    if (s.answerState === "idle") {
      return { lat: current.coordinates[0], lng: current.coordinates[1] };
    }
    return undefined;
  }, [sub, s.answerState, current?.iso3, current?.coordinates]);

  /** Unified Top Toolbar (Responsive Left/Right Split) */
  const Toolbar = (
    <div className="w-full max-w-5xl mx-auto px-4 md:px-6 mb-4 z-20 flex flex-wrap items-center justify-between gap-4 pointer-events-auto">
      <ContinentSelect value={continent} onChange={restartWithContinent} />
      <div className="flex items-center gap-2 flex-wrap">
        <ModeDropdown options={SUB_MODE_OPTIONS} value={sub} onChange={setSub} />
        {sub !== "locator" && (
          <ModeDropdown options={MODE_OPTIONS} value={mode} onChange={setMode} />
        )}
      </div>
    </div>
  );

  if (sub === "locator") {
    return (
      <div className="relative min-h-dvh pt-20">
        <div className="absolute inset-0">
          <Suspense fallback={<GlobeFallback />}>
            <Globe3D
              countries={COUNTRIES}
              highlightIso3={s.answerState === "correct" ? current?.iso3 : null}
              revealIso3={
                s.answerState === "wrong" || s.answerState === "revealed" ? current?.iso3 : null
              }
              onCountryClick={(iso3) =>
                current && s.answerState === "idle" && s.submit(iso3 === current.iso3)
              }
              pointOfView={pov}
              disableHoverLabel
              questionKey={current?.iso3 ?? null}
              activeContinent={continent === "All" ? null : continent}
            />
          </Suspense>
        </div>
        {!finished && current && (
          <>
            <div className="absolute top-20 inset-x-0 z-20 pointer-events-none flex flex-col items-center">
              {Toolbar}
              <PromptPill
                keyId={current.iso3}
                index={s.index}
                total={s.queue.length}
                title={
                  <>
                    Find the country whose capital is{" "}
                    <span className="text-glow-cyan">{current.capital}</span>
                  </>
                }
              />
            </div>
            
            <div className="absolute bottom-8 inset-x-0 z-30 pointer-events-none">
              <div className="pointer-events-auto">
                <FeedbackBar
                  show={s.answerState !== "idle"}
                  state={s.answerState as "correct" | "wrong" | "revealed"}
                  title={`${current.name} — ${current.capital}`}
                  subtitle={`Capital of ${current.name}`}
                  onNext={() => s.next()}
                  onSkip={s.answerState === "wrong" ? () => s.reveal() : undefined}
                  hideNext
                />
              </div>
            </div>
          </>
        )}
        <SessionEnd
          show={finished}
          score={s.score}
          correct={s.correct}
          total={s.queue.length}
          wrong={s.wrong}
          bestCombo={s.bestCombo}
          durationMs={(s.endedAt ?? 0) - s.startedAt}
          onReplay={() => s.start({ continent: continent === "All" ? undefined : continent })}
        />
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh pt-20 flex flex-col items-center">
      {!finished && current && valid && (
        <>
          {Toolbar}

          <div className="flex-1 w-full flex flex-col items-center px-4 md:px-6 pb-32 max-w-5xl gap-6 md:gap-8">
            <PromptPill
              keyId={`${sub}-${current.iso3}`}
              index={s.index}
              total={s.queue.length}
              title={
                sub === "countryToCap" ? (
                  <>What's the capital of <span className="text-glow-cyan">{current.name}</span>?</>
                ) : (
                  <>Which country's capital is <span className="text-glow-cyan">{current.capital}</span>?</>
                )
              }
            />

            <div className="w-full flex justify-center">
              {mode === "easy" ? (
                <ChoiceGrid
                  options={options}
                  sub={sub}
                  target={current}
                  disabled={s.answerState !== "idle"}
                  onPick={(iso3) => s.submit(iso3 === current.iso3)}
                />
              ) : (
                <div className="w-full max-w-md mx-auto">
                  <HardInput
                    target={current}
                    matchTarget={sub === "countryToCap" ? (current.capital ?? undefined) : current.name}
                    onSubmit={(ok) => s.submit(ok)}
                    placeholder={sub === "countryToCap" ? "Type the capital…" : "Type the country…"}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="fixed bottom-0 inset-x-0 pb-6 px-4 md:px-6 z-30 pointer-events-none">
            <div className="pointer-events-auto">
              <FeedbackBar
                show={s.answerState !== "idle"}
                state={s.answerState as "correct" | "wrong" | "revealed"}
                title={`${current.name} — ${current.capital}`}
                subtitle={`Capital of ${current.name}`}
                onNext={() => s.next()}
                onSkip={s.answerState === "wrong" ? () => s.reveal() : undefined}
                hideNext
              />
            </div>
          </div>
        </>
      )}

      {!valid && current && !finished && (
        <div className="mt-20 flex flex-col items-center">
          <Badge tone="muted">No capital on file — skipping</Badge>
          <div className="mt-4">
            <Button size="sm" onClick={() => s.next()}>
              Skip
            </Button>
          </div>
        </div>
      )}

      <SessionEnd
        show={finished}
        score={s.score}
        correct={s.correct}
        total={s.queue.length}
        wrong={s.wrong}
        bestCombo={s.bestCombo}
        durationMs={(s.endedAt ?? 0) - s.startedAt}
        onReplay={() => s.start({ continent: continent === "All" ? undefined : continent })}
      />
    </div>
  );
}

function ChoiceGrid({
  options,
  sub,
  target,
  disabled,
  onPick,
}: {
  options: Country[];
  sub: SubMode;
  target: Country;
  disabled: boolean;
  onPick: (iso3: string) => void;
}) {
  const hotkeyItems = useMemo(
    () => (disabled ? [] : options.map((o) => ({ id: o.iso3 }))),
    [options, disabled],
  );
  const onPickById = useCallback((id: string) => onPick(id), [onPick]);
  useAnswerHotkeys(hotkeyItems, onPickById);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.soft}
      className="grid grid-cols-2 gap-3 w-full max-w-2xl mx-auto"
    >
      {options.map((o, i) => (
        <button
          key={o.iso3}
          onClick={() => onPick(o.iso3)}
          disabled={disabled}
          className={cn(
            "glass rounded-2xl px-5 py-4 text-left transition-all duration-200",
            "hover:border-white/25 hover:-translate-y-0.5",
            "disabled:opacity-60 disabled:hover:translate-y-0",
            "outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cyan)]/60",
          )}
        >
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/40">
            {i + 1}
          </div>
          <div className="font-display text-lg text-white tracking-tight">
            {sub === "countryToCap" ? o.capital ?? "—" : o.name}
          </div>
        </button>
      ))}
      <input type="hidden" data-target={target.iso3} />
    </motion.div>
  );
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function GlobeFallback() {
  return (
    <div className="size-full grid place-items-center">
      <div className="size-40 rounded-full bg-gradient-to-br from-violet/30 to-cyan/20 animate-breathe blur-2xl" />
    </div>
  );
}
