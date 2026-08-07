import { useEffect, useMemo, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { COUNTRIES, pickRandomCountries } from "@/lib/countries";
import { createSessionStore } from "@/features/engine/useSession";
import { useAutoAdvance } from "@/features/engine/useAutoAdvance";
import { useSkipHotkey } from "@/hooks/useSkipHotkey";
import { SessionEnd } from "@/features/engine/SessionEnd";
import { PromptPill } from "@/features/engine/PromptPill";
import { FeedbackBar } from "@/features/engine/FeedbackBar";
import { HardInput } from "@/features/engine/HardInput";
import { ModeDropdown } from "@/features/engine/ModeDropdown";
import { FlagImage } from "@/components/ui/FlagImage";
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

const useFlagSession = createSessionStore({ mode: "flag", skill: "flag" });

type SubMode = "flagToCountry" | "countryToFlag" | "flagToType";

const SUB_MODE_OPTIONS = [
  { value: "flagToCountry" as const, label: "Flag → Country" },
  { value: "countryToFlag" as const, label: "Country → Flag" },
  { value: "flagToType" as const, label: "Flag → Type" },
];

export default function FlagsPage() {
  const s = useFlagSession();
  const [sub, setSub] = useState<SubMode>("flagToCountry");
  const [continent, setContinent] = useContinentPref();
  const current = s.queue[s.index] ?? null;
  const finished = s.endedAt !== null;

  // Persist sub-mode preference
  useEffect(() => {
    getPref("flags.sub").then((v) => v && setSub(v as SubMode));
  }, []);
  useEffect(() => {
    setPref("flags.sub", sub);
  }, [sub]);

  // Restart session whenever continent or sub-mode changes
  useEffect(() => {
    void s.start({ continent: continent === "All" ? undefined : continent });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [continent, sub]);

  useAutoAdvance({ answerState: s.answerState, finished, next: s.next });

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

  const options = useMemo(() => {
    if (!current) return [];
    const distractors = pickRandomCountries(sub === "flagToCountry" ? 3 : 5, new Set([current.iso3]));
    return shuffle([current, ...distractors]);
  }, [current, sub]);

  const hotkeyItems = useMemo(
    () =>
      s.answerState === "idle" && sub !== "flagToType"
        ? options.map((o) => ({ id: o.iso3 }))
        : [],
    [options, s.answerState, sub],
  );
  const onHotkey = useCallback(
    (id: string) => current && s.submit(id === current.iso3),
    [current, s],
  );
  useAnswerHotkeys(hotkeyItems, onHotkey);

  return (
    <div className="relative min-h-dvh pt-20 flex flex-col items-center">
      {!finished && current && (
        <>
          {/* Minimized HUD Toolbar */}
          <div className="w-full max-w-5xl mx-auto px-4 md:px-6 mb-4 z-20 flex items-center justify-between gap-4">
            <ContinentSelect value={continent} onChange={restartWithContinent} />
            <ModeDropdown
              options={SUB_MODE_OPTIONS}
              value={sub}
              onChange={setSub}
            />
          </div>

          {/* Gameplay Content Area */}
          <div className="flex-1 w-full flex flex-col items-center px-4 md:px-6 pb-32 max-w-5xl gap-6 md:gap-8">
            <PromptPill
              keyId={`${sub}-${current.iso3}`}
              index={s.index}
              total={s.queue.length}
              title={
                sub === "flagToCountry" ? (
                  "Which country owns this flag?"
                ) : sub === "countryToFlag" ? (
                  <>Find the flag of <span className="text-glow-cyan">{current.name}</span></>
                ) : (
                  "Name this flag"
                )
              }
            />

            <div className="w-full flex justify-center">
              {sub === "flagToCountry" ? (
                <FlagToCountry
                  target={current}
                  options={options}
                  disabled={s.answerState !== "idle"}
                  onPick={(iso3) => s.submit(iso3 === current.iso3)}
                />
              ) : sub === "countryToFlag" ? (
                <CountryToFlag
                  target={current}
                  options={options}
                  disabled={s.answerState !== "idle"}
                  onPick={(iso3) => s.submit(iso3 === current.iso3)}
                />
              ) : (
                <FlagToType
                  target={current}
                  onSubmit={(ok) => s.submit(ok)}
                />
              )}
            </div>
          </div>

          {/* Feedback bar */}
          <div className="fixed bottom-0 inset-x-0 pb-6 px-4 md:px-6 z-30 pointer-events-none">
            <div className="pointer-events-auto">
              <FeedbackBar
                show={s.answerState !== "idle"}
                state={s.answerState as "correct" | "wrong" | "revealed"}
                title={current.name}
                subtitle={`Capital: ${current.capital ?? "—"}`}
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

function FlagToCountry({
  target,
  options,
  disabled,
  onPick,
}: {
  target: Country;
  options: Country[];
  disabled: boolean;
  onPick: (iso3: string) => void;
}) {
  return (
    <div className="w-full grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-6 lg:gap-8 items-stretch">
      {/* Left: Floating Flag */}
      <motion.div
        key={target.iso3}
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={spring.soft}
        className="flex items-center justify-center"
      >
        <FlagImage
          iso2={target.iso2}
          alt="Mystery flag"
          size={640}
          className="w-full max-w-[480px] h-auto aspect-[3/2] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] rounded-2xl overflow-hidden"
        />
      </motion.div>

      {/* Right: Answer Stack */}
      <div className="flex flex-col justify-center gap-3 w-full">
        {options.map((o, i) => (
          <button
            key={o.iso3}
            onClick={() => onPick(o.iso3)}
            disabled={disabled}
            className={cn(
              "group relative flex items-center gap-4 w-full px-4 py-3.5 rounded-2xl glass text-left transition-all duration-200",
              "hover:border-white/20 hover:bg-white/10 hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-20px_rgba(0,0,0,0.5)]",
              "disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:bg-white/5 disabled:hover:border-white/10",
              "outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cyan)]/60",
            )}
          >
            {/* Integrated Number Badge */}
            <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-xl bg-white/5 border border-white/10 text-white/50 font-mono text-xs group-hover:text-white/90 group-hover:border-white/20 transition-colors">
              {i + 1}
            </div>
            
            <div className="font-display text-lg md:text-xl text-white tracking-tight truncate pr-2">
              {o.name}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function CountryToFlag({
  target,
  options,
  disabled,
  onPick,
}: {
  target: Country;
  options: Country[];
  disabled: boolean;
  onPick: (iso3: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-w-3xl mx-auto w-full">
      {options.map((o) => (
        <button
          key={o.iso3}
          onClick={() => onPick(o.iso3)}
          disabled={disabled}
          className={cn(
            "group relative aspect-[3/2] rounded-2xl overflow-hidden transition-transform duration-200",
            "hover:scale-[1.03] disabled:opacity-60 disabled:hover:scale-100",
            "outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cyan)]/60",
            "shadow-[0_20px_50px_-20px_rgba(0,0,0,0.6)]",
            o.iso3 === target.iso3 && "ring-2 ring-transparent",
          )}
        >
          <FlagImage iso2={o.iso2} alt={o.name} className="absolute inset-0 rounded-2xl overflow-hidden" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      ))}
    </div>
  );
}

function FlagToType({
  target,
  onSubmit,
}: {
  target: Country;
  onSubmit: (ok: boolean) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-6 w-full">
      <motion.div
        key={target.iso3}
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={spring.soft}
      >
        <FlagImage
          iso2={target.iso2}
          alt="Mystery flag"
          size={640}
          className="w-[min(58vw,340px)] lg:w-[min(34vw,400px)] aspect-[3/2] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] rounded-2xl overflow-hidden"
        />
      </motion.div>
      <div className="w-full max-w-md mx-auto">
        <HardInput target={target} onSubmit={onSubmit} placeholder="Type the country…" />
      </div>
    </div>
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
