import { lazy, Suspense, useEffect, useMemo, useCallback, useState } from "react";
import { COUNTRIES } from "@/lib/countries";
import { createSessionStore } from "@/features/engine/useSession";
import { useAutoAdvance } from "@/features/engine/useAutoAdvance";
import { useSkipHotkey } from "@/hooks/useSkipHotkey";
import { SessionEnd } from "@/features/engine/SessionEnd";
import { selectAllForContinent } from "@/lib/mastery";

import { FeedbackBar } from "@/features/engine/FeedbackBar";
import { PromptPill } from "@/features/engine/PromptPill";
import { Button } from "@/components/ui/orbita-button";
import {
  ContinentSelect,
  useContinentPref,
  type ContinentChoice,
} from "@/features/engine/ContinentSelect";

const Globe3D = lazy(() => import("@/features/globe/Globe3D"));

const useFindSession = createSessionStore({ mode: "find", skill: "location" });

type SessionMode = "quick" | "complete";

export default function FindPage() {
  const s = useFindSession();
  const [continent, setContinent] = useContinentPref();
  const [sessionMode, setSessionMode] = useState<SessionMode>("quick");
  const current = s.queue[s.index] ?? null;
  const finished = s.endedAt !== null;

  // Count of countries in the selected continent for UI display
  const continentCount = useMemo(() => {
    if (!continent || continent === "All") return COUNTRIES.length;
    return COUNTRIES.filter((c) => c.continent === continent).length;
  }, [continent]);

  const startSession = useCallback(
    (c: ContinentChoice, mode: SessionMode) => {
      if (mode === "complete") {
        const all = selectAllForContinent(c === "All" ? null : c);
        void s.start({ allCountries: all });
      } else {
        void s.start({ continent: c === "All" ? undefined : c });
      }
    },
    [s],
  );

  useEffect(() => {
    startSession(continent, sessionMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [continent, sessionMode]);

  useAutoAdvance({
    answerState: s.answerState,
    finished,
    next: s.next,
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
            onCountryClick={(iso3) => current && s.answerState === "idle" && s.submit(iso3 === current.iso3)}
            disableHoverLabel
            questionKey={current?.iso3 ?? null}
            activeContinent={continent === "All" ? null : continent}
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
              title={<>Find <span className="text-glow-cyan">{current.name}</span></>}
            />
          </div>

          {/* Controls row: continent + session mode + hint */}
          <div className="absolute top-24 left-4 md:left-6 z-20 flex flex-col gap-2">
            <ContinentSelect value={continent} onChange={restartWithContinent} />

            {/* Session mode selector: compact pill pair */}
            <div
              className="glass rounded-full p-1 flex flex-nowrap items-center gap-0.5 w-fit"
              role="group"
              aria-label="Session mode"
            >
              <button
                type="button"
                onClick={() => {
                  setSessionMode("quick");
                  startSession(continent, "quick");
                }}
                aria-pressed={sessionMode === "quick"}
                className={[
                  "shrink-0 px-3 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider transition-colors",
                  sessionMode === "quick"
                    ? "bg-white/15 text-white"
                    : "text-white/55 hover:text-white",
                ].join(" ")}
              >
                20 Q
              </button>
              <button
                type="button"
                onClick={() => {
                  setSessionMode("complete");
                  startSession(continent, "complete");
                }}
                aria-pressed={sessionMode === "complete"}
                title={`All ${continentCount} countries in ${continent === "All" ? "the world" : continent}`}
                className={[
                  "shrink-0 px-3 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider transition-colors",
                  sessionMode === "complete"
                    ? "bg-white/15 text-white"
                    : "text-white/55 hover:text-white",
                ].join(" ")}
              >
                All {continentCount}
              </button>
            </div>
          </div>

          <div className="absolute bottom-8 inset-x-0 z-30">
            <FeedbackBar
              show={s.answerState !== "idle"}
              state={(s.answerState === "idle" ? "correct" : s.answerState) as "correct" | "wrong" | "revealed"}
              title={current.name}
              subtitle={`Capital: ${current.capital ?? "—"}`}
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
        onReplay={() => startSession(continent, sessionMode)}
      />
    </div>
  );
}

function GlobeFallback() {
  return (
    <div className="size-full grid place-items-center">
      <div className="size-40 rounded-full bg-gradient-to-br from-violet/30 to-cyan/20 animate-breathe blur-2xl" />
    </div>
  );
}
