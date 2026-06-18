import { lazy, Suspense, useEffect, useMemo, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { COUNTRIES, pickRandomCountries } from "@/lib/countries";
import { createSessionStore } from "@/features/engine/useSession";
import { useAutoAdvance } from "@/features/engine/useAutoAdvance";
import { SessionHud } from "@/features/engine/SessionHud";
import { SessionEnd } from "@/features/engine/SessionEnd";
import { Prompt } from "@/features/engine/Prompt";
import { FeedbackBar } from "@/features/engine/FeedbackBar";
import { Button } from "@/components/ui/orbita-button";
import { Badge } from "@/components/ui/orbita-badge";
import { useAnswerHotkeys } from "@/hooks/useAnswerHotkeys";
import { cn } from "@/lib/utils";
import { spring } from "@/lib/motion";
import type { Country } from "@/types/country";
import { getPref, setPref } from "@/lib/db/repo";

const Globe3D = lazy(() => import("@/features/globe/Globe3D"));

const useCapSession = createSessionStore({ mode: "capital", skill: "capital" });

type SubMode = "countryToCap" | "capToCountry" | "locator";

const CONTINENTS = ["All", "Africa", "Americas", "Asia", "Europe", "Oceania"] as const;

export default function CapitalsPage() {
  const s = useCapSession();
  const [sub, setSub] = useState<SubMode>("countryToCap");
  const [continent, setContinent] = useState<string>("All");
  const current = s.queue[s.index] ?? null;
  const finished = s.endedAt !== null;

  useEffect(() => {
    Promise.all([getPref("capitals.sub"), getPref("capitals.continent")]).then(([sb, ct]) => {
      if (sb) setSub(sb as SubMode);
      if (ct) setContinent(ct);
    });
  }, []);
  useEffect(() => {
    setPref("capitals.sub", sub);
  }, [sub]);
  useEffect(() => {
    setPref("capitals.continent", continent);
  }, [continent]);

  useEffect(() => {
    if (s.queue.length === 0 && !s.loading) s.start({ continent });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useAutoAdvance({
    answerState: s.answerState,
    finished,
    next: () => s.next(),
  });

  // Exclude countries without a capital from the queue effectively by skipping them.
  const valid = current && current.capital;

  const options = useMemo(() => {
    if (!current) return [];
    const others = pickRandomCountries(3, new Set([current.iso3])).filter((c) => c.capital);
    return shuffle([current, ...others].slice(0, 4));
  }, [current]);

  const pov = useMemo(() => {
    if (sub !== "locator" || !current) return undefined;
    return s.answerState !== "idle"
      ? { lat: current.coordinates[0], lng: current.coordinates[1], altitude: 1.4 }
      : undefined;
  }, [sub, s.answerState, current]);

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
              onCountryClick={(iso3) => current && s.submit(iso3 === current.iso3)}
              pointOfView={pov}
            />
          </Suspense>
        </div>
        {!finished && current && (
          <>
            <div className="absolute top-24 left-1/2 -translate-x-1/2 z-20 px-4 w-full max-w-xl">
              <Prompt
                keyId={current.iso3}
                eyebrow={`Question ${s.index + 1} / ${s.queue.length}`}
                title={
                  <>
                    Which country has <span className="text-glow-cyan">{current.capital}</span> as its capital?
                  </>
                }
                subtitle={s.hintUsed ? `Hint: ${current.continent}` : "Click the country on the globe"}
              />
            </div>
            <div className="absolute top-24 left-4 md:left-6 z-20">
              <SessionHud {...stats(s)} />
            </div>
            <div className="absolute top-24 right-4 md:right-6 z-20 flex flex-col gap-2 items-end">
              <SubModeToggle value={sub} onChange={(v) => { setSub(v); s.start({ continent }); }} />
              <ContinentToggle value={continent} onChange={(v) => { setContinent(v); s.start({ continent: v }); }} />
              <Button
                size="sm"
                variant="secondary"
                disabled={s.hintUsed || s.answerState !== "idle"}
                onClick={() => s.useHint()}
              >
                {s.hintUsed ? "Hint used" : "Hint"}
              </Button>
            </div>
            <div className="absolute bottom-8 inset-x-0 z-30">
              <FeedbackBar
                show={s.answerState !== "idle"}
                state={s.answerState as "correct" | "wrong" | "revealed"}
                title={`${current.name} — ${current.capital}`}
                subtitle={current.continent}
                onNext={() => s.next()}
                onSkip={s.answerState === "wrong" ? () => s.reveal() : undefined}
                hideNext
              />
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
          onReplay={() => s.start({ continent })}
        />
      </div>
    );
  }

  // Choice modes
  return (
    <div className="relative min-h-dvh pt-24 px-6 pb-12 flex flex-col items-center">
      {!finished && current && valid && (
        <>
          <div className="w-full max-w-4xl mb-6 flex items-center justify-between gap-3 flex-wrap">
            <SessionHud {...stats(s)} />
            <div className="flex flex-col gap-2 items-end">
              <SubModeToggle value={sub} onChange={(v) => { setSub(v); s.start({ continent }); }} />
              <ContinentToggle value={continent} onChange={(v) => { setContinent(v); s.start({ continent: v }); }} />
            </div>
            <Button
              size="sm"
              variant="secondary"
              disabled={s.hintUsed || s.answerState !== "idle"}
              onClick={() => s.useHint()}
            >
              {s.hintUsed ? "Hint used" : "Hint"}
            </Button>
          </div>

          <Prompt
            keyId={`${sub}-${current.iso3}`}
            eyebrow={`Question ${s.index + 1} / ${s.queue.length}`}
            title={
              sub === "countryToCap" ? (
                <>What's the capital of <span className="text-glow-cyan">{current.name}</span>?</>
              ) : (
                <>Which country's capital is <span className="text-glow-cyan">{current.capital}</span>?</>
              )
            }
            subtitle={s.hintUsed ? `Hint: ${current.continent}` : undefined}
          />

          <ChoiceGrid
            options={options}
            sub={sub}
            target={current}
            disabled={s.answerState !== "idle"}
            onPick={(iso3) => s.submit(iso3 === current.iso3)}
          />

          <div className="mt-8 w-full">
            <FeedbackBar
              show={s.answerState !== "idle"}
              state={s.answerState as "correct" | "wrong" | "revealed"}
              title={`${current.name} — ${current.capital}`}
              subtitle={current.continent}
              onNext={() => s.next()}
              onSkip={s.answerState === "wrong" ? () => s.reveal() : undefined}
              hideNext
            />
          </div>
        </>
      )}

      {!valid && current && !finished && (
        <div className="mt-10">
          <Badge tone="muted">No capital on file — skipping</Badge>
          <div className="mt-3">
            <Button size="sm" onClick={() => s.next()}>Skip</Button>
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
        onReplay={() => s.start({ continent })}
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
      className="mt-8 grid grid-cols-2 gap-3 w-full max-w-2xl"
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
            {i + 1} · {o.continent}
          </div>
          <div className="font-display text-lg text-white tracking-tight">
            {sub === "countryToCap" ? (o.capital ?? "—") : o.name}
          </div>
        </button>
      ))}
      <input type="hidden" data-target={target.iso3} />
    </motion.div>
  );
}

function SubModeToggle({
  value,
  onChange,
}: {
  value: SubMode;
  onChange: (v: SubMode) => void;
}) {
  return (
    <div className="glass rounded-full p-1 flex text-[11px] font-mono uppercase tracking-wider">
      {(
        [
          ["countryToCap", "Country → Cap"],
          ["capToCountry", "Cap → Country"],
          ["locator", "Globe locator"],
        ] as const
      ).map(([k, label]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={cn(
            "px-3 py-1 rounded-full transition-colors whitespace-nowrap",
            value === k ? "bg-white/10 text-white" : "text-white/55 hover:text-white",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ContinentToggle({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="glass rounded-full p-1 flex text-[11px] font-mono uppercase tracking-wider flex-wrap">
      {CONTINENTS.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={cn(
            "px-2.5 py-1 rounded-full transition-colors",
            value === c ? "bg-white/10 text-white" : "text-white/55 hover:text-white",
          )}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

function stats(s: ReturnType<typeof useCapSession.getState>) {
  return {
    score: s.score,
    combo: s.combo,
    correct: s.correct,
    wrong: s.wrong,
    index: s.index,
    total: s.queue.length,
  };
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
