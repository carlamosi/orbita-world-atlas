import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { COUNTRIES, pickRandomCountries } from "@/lib/countries";
import { createSessionStore } from "@/features/engine/useSession";
import { useAutoAdvance } from "@/features/engine/useAutoAdvance";
import { useSkipHotkey } from "@/hooks/useSkipHotkey";
import { SessionHud } from "@/features/engine/SessionHud";
import { SessionEnd } from "@/features/engine/SessionEnd";
import { Prompt } from "@/features/engine/Prompt";
import { FeedbackBar } from "@/features/engine/FeedbackBar";
import { HardInput } from "@/features/engine/HardInput";
import { FlagImage } from "@/components/ui/FlagImage";
import { Button } from "@/components/ui/orbita-button";
import { useAnswerHotkeys } from "@/hooks/useAnswerHotkeys";
import { cn } from "@/lib/utils";
import { spring } from "@/lib/motion";
import type { Country } from "@/types/country";
import { getPref, setPref } from "@/lib/db/repo";

const useFlagSession = createSessionStore({ mode: "flag", skill: "flag" });

type SubMode = "flagToCountry" | "countryToFlag" | "flagToType";

export default function FlagsPage() {
  const s = useFlagSession();
  const [sub, setSub] = useState<SubMode>("flagToCountry");
  const current = s.queue[s.index] ?? null;
  const finished = s.endedAt !== null;

  useEffect(() => {
    getPref("flags.sub").then((v) => v && setSub(v as SubMode));
  }, []);
  useEffect(() => {
    setPref("flags.sub", sub);
  }, [sub]);

  useEffect(() => {
    if (s.queue.length === 0 && !s.loading) s.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useAutoAdvance({ answerState: s.answerState, finished, next: s.next });

  const options = useMemo(() => {
    if (!current) return [];
    const distractors = pickRandomCountries(sub === "flagToCountry" ? 3 : 5, new Set([current.iso3]));
    return shuffle([current, ...distractors]);
  }, [current, sub]);

  const hotkeyItems = useMemo(
    () => (s.answerState === "idle" ? options.map((o) => ({ id: o.iso3 })) : []),
    [options, s.answerState],
  );
  const onHotkey = useCallback(
    (id: string) => current && s.submit(id === current.iso3),
    [current, s],
  );
  useAnswerHotkeys(hotkeyItems, onHotkey);

  return (
    <div className="relative min-h-dvh pt-24 px-6 pb-12 flex flex-col items-center">
      {!finished && current && (
        <>
          <div className="w-full max-w-4xl mb-6 flex items-center justify-between gap-4 flex-wrap">
            <SessionHud {...stats(s)} />
            <SubModeToggle value={sub} onChange={(v) => { setSub(v); s.start(); }} />
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
              sub === "flagToCountry" ? (
                <>Which country owns this flag?</>
              ) : (
                <>Find the flag of <span className="text-glow-cyan">{current.name}</span></>
              )
            }
            subtitle={s.hintUsed ? `Hint: ${current.continent}` : undefined}
          />

          {/* Main board */}
          <div className="mt-8 w-full max-w-4xl">
            {sub === "flagToCountry" ? (
              <FlagToCountry
                target={current}
                options={options}
                disabled={s.answerState !== "idle"}
                onPick={(iso3) => s.submit(iso3 === current.iso3)}
              />
            ) : (
              <CountryToFlag
                target={current}
                options={options}
                disabled={s.answerState !== "idle"}
                onPick={(iso3) => s.submit(iso3 === current.iso3)}
              />
            )}
          </div>

          {/* Feedback (also drives Next) */}
          <div className="mt-8 w-full">
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

          <ConfettiBurst show={s.answerState === "correct"} />
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

function stats(s: ReturnType<typeof useFlagSession.getState>) {
  return {
    score: s.score,
    combo: s.combo,
    correct: s.correct,
    wrong: s.wrong,
    index: s.index,
    total: s.queue.length,
  };
}

function SubModeToggle({
  value,
  onChange,
}: {
  value: SubMode;
  onChange: (v: SubMode) => void;
}) {
  return (
    <div className="glass rounded-full p-1 flex text-[12px] font-mono uppercase tracking-wider">
      {(
        [
          ["flagToCountry", "Flag → Country"],
          ["countryToFlag", "Country → Flag"],
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
    <div className="flex flex-col items-center gap-8">
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
          className="w-[min(72vw,420px)] aspect-[3/2] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)]"
        />
      </motion.div>
      <div className="grid grid-cols-2 gap-3 w-full max-w-2xl">
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
            <div className="font-display text-lg text-white tracking-tight">{o.name}</div>
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
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
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
          <FlagImage iso2={o.iso2} alt={o.name} className="absolute inset-0 rounded-none" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      ))}
    </div>
  );
}

function ConfettiBurst({ show }: { show: boolean }) {
  const particles = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * 320,
        y: -Math.random() * 260 - 60,
        rot: Math.random() * 360,
        color: ["#6C63FF", "#00D4FF", "#00FFB2", "#FF6B6B"][i % 4]!,
      })),
    [],
  );
  return (
    <AnimatePresence>
      {show && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-40 grid place-items-center motion-reduce:hidden"
        >
          {particles.map((p) => (
            <motion.span
              key={p.id}
              initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
              animate={{ x: p.x, y: p.y, opacity: 0, rotate: p.rot }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
              className="absolute size-2 rounded-sm"
              style={{ background: p.color, boxShadow: `0 0 12px ${p.color}` }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
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
