import { lazy, Suspense, useEffect, useMemo, useState, useCallback } from "react";
import { COUNTRIES, pickRandomCountries } from "@/lib/countries";
import { createSessionStore } from "@/features/engine/useSession";
import { useAutoAdvance } from "@/features/engine/useAutoAdvance";
import { useSkipHotkey } from "@/hooks/useSkipHotkey";
import { SessionHud } from "@/features/engine/SessionHud";
import { SessionEnd } from "@/features/engine/SessionEnd";
import { PromptPill } from "@/features/engine/PromptPill";
import { FeedbackBar } from "@/features/engine/FeedbackBar";
import { HardInput } from "@/features/engine/HardInput";
import { Button } from "@/components/ui/orbita-button";
import { FlagImage } from "@/components/ui/FlagImage";
import { useAnswerHotkeys } from "@/hooks/useAnswerHotkeys";
import {
  ContinentSelect,
  useContinentPref,
  type ContinentChoice,
} from "@/features/engine/ContinentSelect";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { spring } from "@/lib/motion";
import type { Country } from "@/types/country";

const Globe3D = lazy(() => import("@/features/globe/Globe3D"));

const useNameSession = createSessionStore({ mode: "name", skill: "name" });

type Mode = "easy" | "hard";

export default function NamePage() {
  const s = useNameSession();
  const [mode, setMode] = useState<Mode>("easy");
  const current = s.queue[s.index] ?? null;
  const finished = s.endedAt !== null;

  useEffect(() => {
    if (s.queue.length === 0 && !s.loading) s.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useAutoAdvance({ answerState: s.answerState, finished, next: s.next });

  const onSkip = useCallback(() => {
    if (!finished && current && s.answerState === "idle") s.reveal();
  }, [finished, current, s]);
  useSkipHotkey(onSkip);

  // Tight POV on the mystery country — but never reveal its name in label form.
  const pov = useMemo(() => {
    if (!current) return undefined;
    return { lat: current.coordinates[0], lng: current.coordinates[1], altitude: 1.2 };
  }, [current]);

  // 4 options for easy mode — stable per question
  const options = useMemo(() => {
    if (!current) return [];
    const others = pickRandomCountries(3, new Set([current.iso3]));
    return shuffle([current, ...others]);
  }, [current]);

  return (
    <div className="relative min-h-dvh pt-20">
      <div className="absolute inset-0">
        <Suspense fallback={<GlobeFallback />}>
          <Globe3D
            countries={COUNTRIES}
            highlightIso3={
              s.answerState === "idle" || s.answerState === "correct"
                ? current?.iso3
                : null
            }
            revealIso3={
              s.answerState === "wrong" || s.answerState === "revealed" ? current?.iso3 : null
            }
            pointOfView={pov}
          />
        </Suspense>
      </div>

      {!finished && current && (
        <>
          <div className="absolute top-24 inset-x-0 z-20 flex justify-center">
            <PromptPill
              keyId={current.iso3}
              index={s.index}
              total={s.queue.length}
              title="Name this country"
              hint={mode === "easy" ? "Pick 1–4" : "Type to answer"}
            />
          </div>

          <div className="absolute top-24 left-4 md:left-6 z-20">
            <SessionHud {...stats(s)} />
          </div>

          <div className="absolute top-24 right-4 md:right-6 z-20 flex flex-col gap-2 items-end">
            <ModeToggle value={mode} onChange={setMode} />
            <Button
              size="sm"
              variant="secondary"
              disabled={s.hintUsed || s.answerState !== "idle"}
              onClick={() => s.useHint()}
            >
              {s.hintUsed ? "Hint used" : "Hint"}
            </Button>
          </div>

          {s.hintUsed && s.answerState === "idle" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute bottom-56 left-1/2 -translate-x-1/2 z-20"
            >
              <Badge tone="neon">Hint: {current.continent}</Badge>
            </motion.div>
          )}

          {/* Answer surface */}
          <div className="absolute bottom-8 inset-x-0 z-30 px-4">
            {s.answerState === "idle" ? (
              mode === "easy" ? (
                <EasyOptions
                  options={options}
                  targetIso3={current.iso3}
                  onPick={(iso3) => s.submit(iso3 === current.iso3)}
                />
              ) : (
                <HardInput target={current} onSubmit={(ok) => s.submit(ok)} />
              )
            ) : (
              <FeedbackBar
                show
                state={s.answerState as "correct" | "wrong" | "revealed"}
                title={current.name}
                subtitle={`Capital: ${current.capital ?? "—"}`}
                onNext={() => s.next()}
                onSkip={s.answerState === "wrong" ? () => s.reveal() : undefined}
                hideNext
              />
            )}
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
        onReplay={() => s.start()}
      />
    </div>
  );
}

function stats(s: ReturnType<typeof useNameSession.getState>) {
  return {
    score: s.score,
    combo: s.combo,
    correct: s.correct,
    wrong: s.wrong,
    index: s.index,
    total: s.queue.length,
  };
}

function ModeToggle({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="glass rounded-full p-1 flex text-[12px] font-mono uppercase tracking-wider">
      {(["easy", "hard"] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={cn(
            "px-3 py-1 rounded-full transition-colors",
            value === m ? "bg-white/10 text-white" : "text-white/55 hover:text-white",
          )}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

function EasyOptions({
  options,
  targetIso3,
  onPick,
}: {
  options: Country[];
  targetIso3: string;
  onPick: (iso3: string) => void;
}) {
  const hotkeyItems = useMemo(
    () => options.map((o) => ({ id: o.iso3 })),
    [options],
  );
  const onPickById = useCallback((id: string) => onPick(id), [onPick]);
  useAnswerHotkeys(hotkeyItems, onPickById);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.soft}
      className="max-w-2xl mx-auto grid grid-cols-2 gap-3"
    >
      {options.map((o, i) => (
        <button
          key={o.iso3}
          onClick={() => onPick(o.iso3)}
          className={cn(
            "glass rounded-2xl px-5 py-4 text-left transition-all duration-200",
            "hover:border-white/25 hover:-translate-y-0.5 hover:shadow-[0_20px_60px_-25px_color-mix(in_oklab,var(--violet)_55%,transparent)]",
            "outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cyan)]/60",
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/40">
                {i + 1} · {o.continent}
              </div>
              <div className="font-display text-lg text-white tracking-tight">{o.name}</div>
            </div>
            <FlagImage iso2={o.iso2} alt={o.name} className="w-12 h-8 shrink-0" />
          </div>
        </button>
      ))}
      <input type="hidden" data-target={targetIso3} />
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
