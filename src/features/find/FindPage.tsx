import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/orbita-badge";
import { Button } from "@/components/ui/orbita-button";
import { spring } from "@/lib/motion";
import { useFindStore, TOTAL_QUESTIONS, ALL_COUNTRIES } from "./findStore";

const Globe3D = lazy(() => import("@/features/globe/Globe3D"));

export default function FindPage() {
  const store = useFindStore();
  const { queue, index, score, combo, correct, wrong, answerState, hintUsed, endedAt, startedAt } =
    store;

  useEffect(() => {
    if (queue.length === 0) store.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = queue[index] ?? null;
  const finished = endedAt !== null;

  const pov = useMemo(() => {
    if (answerState === "correct" || answerState === "revealed" || answerState === "wrong") {
      if (current) return { lat: current.coordinates[0], lng: current.coordinates[1], altitude: 1.4 };
    }
    return undefined;
  }, [answerState, current]);

  return (
    <div className="relative min-h-dvh pt-20">
      {/* Globe canvas — full bleed */}
      <div className="absolute inset-0 -z-0">
        <Suspense fallback={<GlobeFallback />}>
          <Globe3D
            countries={ALL_COUNTRIES}
            highlightIso3={answerState === "correct" ? current?.iso3 : null}
            revealIso3={answerState === "wrong" || answerState === "revealed" ? current?.iso3 : null}
            onCountryClick={(iso3) => store.guess(iso3)}
            pointOfView={pov}
          />
        </Suspense>
      </div>

      {/* HUD */}
      {!finished && current && (
        <>
          {/* Top prompt */}
          <motion.div
            key={current.iso3}
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring.soft}
            className="absolute top-24 left-1/2 -translate-x-1/2 z-20 px-4 w-full max-w-xl"
          >
            <div className="glass-strong rounded-2xl px-6 py-5 text-center">
              <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/45">
                Question {index + 1} / {TOTAL_QUESTIONS}
              </div>
              <div className="mt-2 font-display text-2xl md:text-3xl text-white tracking-tight">
                Find <span className="text-glow-cyan">{current.name}</span>
              </div>
              <div className="mt-1 text-[12px] text-white/50">
                {current.continent} · {current.subregion}
              </div>
            </div>
          </motion.div>

          {/* Left: score */}
          <div className="absolute top-24 left-4 md:left-6 z-20">
            <div className="glass rounded-2xl px-4 py-3 font-mono text-[11px] uppercase tracking-wider text-white/60 space-y-1 min-w-[140px]">
              <Row label="Score" value={score} />
              <Row label="Combo" value={`×${combo}`} />
              <Row label="Right" value={correct} />
              <Row label="Wrong" value={wrong} />
            </div>
          </div>

          {/* Right: hint */}
          <div className="absolute top-24 right-4 md:right-6 z-20">
            <Button
              size="sm"
              variant="secondary"
              disabled={hintUsed || answerState !== "idle"}
              onClick={() => store.useHint()}
            >
              {hintUsed ? "Hint used" : "Hint"}
            </Button>
          </div>

          {/* Hint orbit indicator */}
          {hintUsed && answerState === "idle" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute bottom-32 left-1/2 -translate-x-1/2 z-20"
            >
              <Badge tone="neon">
                Hint: continent · {current.continent}
              </Badge>
            </motion.div>
          )}

          {/* Bottom feedback */}
          <AnimatePresence mode="wait">
            {answerState !== "idle" && (
              <motion.div
                key={answerState}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={spring.crisp}
                className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 px-4 w-full max-w-md"
              >
                <div
                  className={`glass-strong rounded-2xl px-6 py-5 text-center flex items-center justify-between gap-4 ${
                    answerState === "correct"
                      ? "shadow-[0_0_60px_-10px_color-mix(in_oklab,var(--neon)_60%,transparent)]"
                      : "shadow-[0_0_60px_-10px_color-mix(in_oklab,var(--coral)_50%,transparent)]"
                  }`}
                >
                  <div className="text-left">
                    <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/45">
                      {answerState === "correct" ? "Nailed it" : "It was here"}
                    </div>
                    <div className="font-display text-lg text-white">{current.name}</div>
                    <div className="text-[12px] text-white/55">
                      Capital: {current.capital ?? "—"}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => store.next()}>
                    Next →
                  </Button>
                </div>
                {answerState === "wrong" && (
                  <button
                    onClick={() => store.reveal()}
                    className="mx-auto block mt-2 text-[11px] font-mono uppercase tracking-wider text-white/40 hover:text-white/70"
                  >
                    Skip
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* Session end */}
      <AnimatePresence>
        {finished && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center px-6 backdrop-blur-md bg-black/40"
          >
            <motion.div
              initial={{ y: 30, scale: 0.96, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              transition={spring.soft}
              className="glass-strong rounded-3xl p-10 max-w-md w-full text-center"
            >
              <Badge tone="cyan">Session complete</Badge>
              <h2 className="mt-4 font-display text-4xl text-white tracking-tight text-glow-violet">
                {score} pts
              </h2>
              <div className="mt-2 text-white/55 text-sm">
                {correct}/{TOTAL_QUESTIONS} correct ·{" "}
                {Math.round(((endedAt! - startedAt) / 1000) * 10) / 10}s
              </div>
              <div className="mt-8 grid grid-cols-3 gap-3 font-mono text-[11px] uppercase tracking-wider text-white/55">
                <Stat label="Accuracy" value={`${Math.round((correct / TOTAL_QUESTIONS) * 100)}%`} />
                <Stat label="Best combo" value={`×${store.bestCombo}`} />
                <Stat label="Wrong" value={wrong} />
              </div>
              <div className="mt-8 flex gap-3 justify-center">
                <Button onClick={() => store.start()}>Play again</Button>
                <Link to="/">
                  <Button variant="secondary">Home</Button>
                </Link>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between gap-6">
      <span>{label}</span>
      <span className="text-white">{value}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="glass rounded-xl py-3">
      <div className="font-display text-base text-white normal-case tracking-tight">{value}</div>
      <div className="mt-1 text-[10px]">{label}</div>
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
