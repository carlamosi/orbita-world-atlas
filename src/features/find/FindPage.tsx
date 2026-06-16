import { lazy, Suspense, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { COUNTRIES } from "@/lib/countries";
import { createSessionStore } from "@/features/engine/useSession";
import { SessionHud } from "@/features/engine/SessionHud";
import { SessionEnd } from "@/features/engine/SessionEnd";
import { Prompt } from "@/features/engine/Prompt";
import { FeedbackBar } from "@/features/engine/FeedbackBar";
import { Button } from "@/components/ui/orbita-button";
import { Badge } from "@/components/ui/orbita-badge";

const Globe3D = lazy(() => import("@/features/globe/Globe3D"));

const useFindSession = createSessionStore({ mode: "find", skill: "location" });

export default function FindPage() {
  const s = useFindSession();
  const current = s.queue[s.index] ?? null;
  const finished = s.endedAt !== null;

  useEffect(() => {
    if (s.queue.length === 0 && !s.loading) s.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
                  Find <span className="text-glow-cyan">{current.name}</span>
                </>
              }
              subtitle={`${current.continent} · ${current.subregion}`}
            />
          </div>

          <div className="absolute top-24 left-4 md:left-6 z-20">
            <SessionHud
              score={s.score}
              combo={s.combo}
              correct={s.correct}
              wrong={s.wrong}
              index={s.index}
              total={s.queue.length}
            />
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

          {s.hintUsed && s.answerState === "idle" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute bottom-32 left-1/2 -translate-x-1/2 z-20"
            >
              <Badge tone="neon">Hint: {current.continent}</Badge>
            </motion.div>
          )}

          <div className="absolute bottom-8 inset-x-0 z-30">
            <FeedbackBar
              show={s.answerState !== "idle"}
              state={(s.answerState === "idle" ? "correct" : s.answerState) as "correct" | "wrong" | "revealed"}
              title={current.name}
              subtitle={`Capital: ${current.capital ?? "—"}`}
              onNext={() => s.next()}
              onSkip={s.answerState === "wrong" ? () => s.reveal() : undefined}
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
        onReplay={() => s.start()}
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
