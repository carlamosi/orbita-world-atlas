import { lazy, Suspense, useEffect, useMemo, useCallback } from "react";
import { COUNTRIES } from "@/lib/countries";
import { createSessionStore } from "@/features/engine/useSession";
import { useAutoAdvance } from "@/features/engine/useAutoAdvance";
import { useSkipHotkey } from "@/hooks/useSkipHotkey";
import { SessionEnd } from "@/features/engine/SessionEnd";

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

export default function FindPage() {
  const s = useFindSession();
  const [continent, setContinent] = useContinentPref();
  const current = s.queue[s.index] ?? null;
  const finished = s.endedAt !== null;

  useEffect(() => {
    if (s.queue.length === 0 && !s.loading) {
      s.start({ continent: continent === "All" ? undefined : continent });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      void s.start({ continent: c === "All" ? undefined : c });
    },
    [s, setContinent],
  );

  const pov = useMemo(() => {
    if (s.answerState !== "idle" && current) {
      return { lat: current.coordinates[0], lng: current.coordinates[1], altitude: 1.4 };
    }
    return undefined;
  }, [s.answerState, current]);

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
            pointOfView={pov}
            disableHoverLabel
            questionKey={current?.iso3 ?? null}
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
              hint={s.hintUsed ? current.continent : undefined}
            />
          </div>

          <div className="absolute top-24 left-4 md:left-6 z-20 flex flex-col gap-2">
            <ContinentSelect value={continent} onChange={restartWithContinent} />
          </div>


          <div className="absolute top-24 right-4 md:right-6 z-20">
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
        onReplay={() => s.start({ continent: continent === "All" ? undefined : continent })}
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
