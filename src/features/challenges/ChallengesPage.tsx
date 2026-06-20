import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Skill } from "@/lib/db/orbita-db";
import { generateDaily, generateWeekly, type ChallengeSet } from "@/lib/challenges";
import { Badge } from "@/components/ui/orbita-badge";
import { Button } from "@/components/ui/orbita-button";
import { FlagImage } from "@/components/ui/FlagImage";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { recordSessionEnd, updateSkillProgress } from "@/lib/db/repo";
import { confidenceAfter } from "@/lib/mastery";
import { dateKey, weekKey } from "@/lib/streak";
import type { Country } from "@/types/country";
import { pickRandomCountries } from "@/lib/countries";
import { useAnswerHotkeys } from "@/hooks/useAnswerHotkeys";
import { useSkipHotkey } from "@/hooks/useSkipHotkey";
import { useAutoAdvance } from "@/features/engine/useAutoAdvance";

type Active = {
  set: ChallengeSet;
  index: number;
  correct: number;
  wrong: number;
  score: number;
  bestCombo: number;
  combo: number;
  startedAt: number;
  answerState: "idle" | "correct" | "wrong";
};

export default function ChallengesPage() {
  const [daily, setDaily] = useState<ChallengeSet | null>(null);
  const [weekly, setWeekly] = useState<ChallengeSet | null>(null);
  const [active, setActive] = useState<Active | null>(null);

  useEffect(() => {
    generateDaily().then(setDaily);
    generateWeekly().then(setWeekly);
  }, []);

  const todayKey = dateKey();
  const thisWeekKey = weekKey();
  const sessions = useLiveQuery(() => db().gameSessions.toArray(), []) ?? [];
  const dailyBest = useMemo(
    () =>
      sessions
        .filter((s) => s.mode === "challenge_daily" && s.periodKey === todayKey)
        .reduce((m, s) => Math.max(m, s.score), 0),
    [sessions, todayKey],
  );
  const weeklyBest = useMemo(
    () =>
      sessions
        .filter((s) => s.mode === "challenge_weekly" && s.periodKey === thisWeekKey)
        .reduce((m, s) => Math.max(m, s.score), 0),
    [sessions, thisWeekKey],
  );

  if (active) {
    return (
      <ChallengeRunner
        active={active}
        setActive={setActive}
        onExit={() => setActive(null)}
      />
    );
  }

  return (
    <div className="min-h-dvh pt-24 pb-16 px-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <Badge tone="violet">Challenges</Badge>
          <h1 className="mt-3 font-display text-4xl text-white tracking-tight text-glow-violet">
            Today's orbit
          </h1>
          <p className="mt-2 text-white/55 text-[15px]">
            Deterministic question sets — everyone gets the same daily run.
          </p>
        </header>

        <div className="grid md:grid-cols-2 gap-4">
          <ChallengeCard
            kind="daily"
            set={daily}
            best={dailyBest}
            onStart={(set) =>
              setActive({
                set,
                index: 0,
                correct: 0,
                wrong: 0,
                score: 0,
                combo: 0,
                bestCombo: 0,
                startedAt: Date.now(),
                answerState: "idle",
              })
            }
          />
          <ChallengeCard
            kind="weekly"
            set={weekly}
            best={weeklyBest}
            onStart={(set) =>
              setActive({
                set,
                index: 0,
                correct: 0,
                wrong: 0,
                score: 0,
                combo: 0,
                bestCombo: 0,
                startedAt: Date.now(),
                answerState: "idle",
              })
            }
          />
        </div>
      </div>
    </div>
  );
}

function ChallengeCard({
  kind,
  set,
  best,
  onStart,
}: {
  kind: "daily" | "weekly";
  set: ChallengeSet | null;
  best: number;
  onStart: (s: ChallengeSet) => void;
}) {
  const title = kind === "daily" ? "Daily 10" : "Weekly 25";
  const sub = kind === "daily" ? dateKey() : weekKey();
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.soft}
      className="glass-strong rounded-3xl p-6 flex flex-col"
    >
      <div className="flex items-center justify-between">
        <Badge tone={kind === "daily" ? "cyan" : "neon"}>{kind}</Badge>
        <span className="font-mono text-[11px] text-white/45">{sub}</span>
      </div>
      <h2 className="mt-4 font-display text-2xl text-white tracking-tight">{title}</h2>
      <p className="mt-2 text-white/55 text-[14px]">
        Mixed-skill rapid round. Same questions for everyone, every {kind === "daily" ? "day" : "week"}.
      </p>
      <div className="mt-6 grid grid-cols-2 gap-3 font-mono text-[11px] uppercase tracking-wider text-white/55">
        <div className="glass rounded-xl p-3">
          <div>Questions</div>
          <div className="font-display text-lg text-white tracking-tight">{set?.count ?? "…"}</div>
        </div>
        <div className="glass rounded-xl p-3">
          <div>Your best</div>
          <div className="font-display text-lg text-white tracking-tight">{best}</div>
        </div>
      </div>
      <div className="mt-6 flex justify-end">
        <Button onClick={() => set && onStart(set)} disabled={!set}>
          {best > 0 ? "Replay" : "Start"} →
        </Button>
      </div>
    </motion.div>
  );
}

function ChallengeRunner({
  active,
  setActive,
  onExit,
}: {
  active: Active;
  setActive: (a: Active | null) => void;
  onExit: () => void;
}) {
  const finished = active.index >= active.set.items.length;

  // Compose 4 options for the current item.
  const current = active.set.items[active.index];
  const options = useMemo(() => {
    if (!current) return [];
    const others = pickRandomCountries(3, new Set([current.country.iso3]));
    return shuffle([current.country, ...others]);
  }, [current]);

  // Finalize on completion
  useEffect(() => {
    if (!finished || active.answerState !== "idle") return;
    const endedAt = Date.now();
    recordSessionEnd({
      mode: active.set.kind === "daily" ? "challenge_daily" : "challenge_weekly",
      skill: "mixed",
      score: active.score,
      totalQuestions: active.set.items.length,
      correct: active.correct,
      wrong: active.wrong,
      bestCombo: active.bestCombo,
      durationMs: endedAt - active.startedAt,
      createdAt: endedAt,
      periodKey: active.set.periodKey,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  if (finished) {
    const acc =
      active.set.items.length > 0
        ? Math.round((active.correct / active.set.items.length) * 100)
        : 0;
    return (
      <div className="min-h-dvh pt-28 px-6 pb-16 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={spring.soft}
          className="glass-strong rounded-3xl p-10 max-w-md w-full text-center"
        >
          <Badge tone="neon">Challenge complete</Badge>
          <div className="mt-4 font-display text-5xl text-white tracking-tight text-glow-violet">
            {active.score}
          </div>
          <div className="mt-2 text-white/60 text-sm">
            {active.correct}/{active.set.items.length} · {acc}% accuracy
          </div>
          <div className="mt-8 flex gap-3 justify-center">
            <Button onClick={onExit}>Back</Button>
          </div>
        </motion.div>
      </div>
    );
  }

  const pick = useCallback(
    (iso3: string) => {
      if (!current || active.answerState !== "idle") return;
      const correctPick = iso3 === current.country.iso3;
      updateSkillProgress(current.country.iso3, current.skill as Skill, (prev) =>
        confidenceAfter(prev, correctPick, false),
      );
      const combo = correctPick ? active.combo + 1 : 0;
      const gained = correctPick ? 100 + Math.min(combo - 1, 9) * 20 : 0;
      setActive({
        ...active,
        answerState: correctPick ? "correct" : "wrong",
        score: active.score + gained,
        combo,
        bestCombo: Math.max(active.bestCombo, combo),
        correct: active.correct + (correctPick ? 1 : 0),
        wrong: active.wrong + (correctPick ? 0 : 1),
      });
    },
    [active, current, setActive],
  );

  const next = useCallback(() => {
    setActive({ ...active, index: active.index + 1, answerState: "idle" });
  }, [active, setActive]);

  // Numeric 1–4 + auto-advance + space-to-skip — same architecture as Find/Name/Flags.
  const hotkeyItems = useMemo(
    () =>
      current && active.answerState === "idle"
        ? options.map((o) => ({ id: o.iso3 }))
        : [],
    [current, options, active.answerState],
  );
  useAnswerHotkeys(hotkeyItems, pick);
  useSkipHotkey(useCallback(() => {
    if (current && active.answerState === "idle") {
      setActive({ ...active, answerState: "wrong", wrong: active.wrong + 1, combo: 0 });
    }
  }, [current, active, setActive]));
  useAutoAdvance({
    answerState: active.answerState === "wrong" ? "wrong" : active.answerState === "correct" ? "correct" : "idle",
    finished: false,
    next,
  });

  if (!current) return null;

  return (
    <div className="min-h-dvh pt-24 pb-10 px-6 flex flex-col items-center">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between">
          <Badge tone={active.set.kind === "daily" ? "cyan" : "neon"}>
            {active.set.kind} · {active.index + 1}/{active.set.items.length}
          </Badge>
          <Button
            variant="secondary"
            size="sm"
            onClick={onExit}
            aria-label="Exit challenge"
          >
            ✕ Exit
          </Button>
        </div>


        <motion.div
          key={active.index}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.crisp}
          className="mt-4 glass-strong rounded-2xl p-6 text-center"
        >
          <PromptInline item={current} />
        </motion.div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          {options.map((o, i) => (
            <button
              key={o.iso3}
              disabled={active.answerState !== "idle"}
              onClick={() => pick(o.iso3)}
              className={cn(
                "glass rounded-2xl p-4 text-left transition-all duration-150",
                "hover:-translate-y-0.5 hover:border-white/25 disabled:opacity-60 disabled:hover:translate-y-0",
                active.answerState !== "idle" &&
                  o.iso3 === current.country.iso3 &&
                  "border-[color:var(--neon)]/60 shadow-[0_0_40px_-10px_color-mix(in_oklab,var(--neon)_60%,transparent)]",
              )}
            >
              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/40">
                {i + 1}
              </div>
              <div className="mt-1 flex items-center gap-3">
                {current.skill === "flag" && (
                  <FlagImage iso2={o.iso2} alt={o.name} className="w-12 h-8 shrink-0" />
                )}
                <div className="font-display text-base text-white tracking-tight truncate">
                  {current.skill === "capital" ? (o.capital ?? "—") : o.name}
                </div>
              </div>
            </button>
          ))}
        </div>

        <AnimatePresence>
          {active.answerState !== "idle" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="mt-6 glass-strong rounded-2xl p-4 flex items-center justify-between"
            >
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/45">
                  {active.answerState === "correct" ? "Nailed it" : "Not quite"}
                </div>
                <div className="font-display text-lg text-white">
                  {current.country.name} — {current.country.capital ?? "—"}
                </div>
              </div>
              <Button size="sm" onClick={next}>
                Next →
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function PromptInline({ item }: { item: { country: Country; skill: Skill } }) {
  const { country, skill } = item;
  if (skill === "name") {
    return (
      <>
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/45">
          Name this flag
        </div>
        <div className="mt-3 flex justify-center">
          <FlagImage iso2={country.iso2} alt="flag" className="w-40 aspect-[3/2]" />
        </div>
      </>
    );
  }
  if (skill === "flag") {
    return (
      <>
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/45">
          Which flag
        </div>
        <div className="mt-2 font-display text-2xl text-white text-glow-cyan">{country.name}</div>
      </>
    );
  }
  if (skill === "capital") {
    return (
      <>
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/45">
          Capital of
        </div>
        <div className="mt-2 font-display text-2xl text-white text-glow-cyan">{country.name}</div>
      </>
    );
  }
  return (
    <>
      <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/45">
        Country with capital
      </div>
      <div className="mt-2 font-display text-2xl text-white text-glow-cyan">
        {country.capital ?? "—"}
      </div>
    </>
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

