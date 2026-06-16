import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSpeedRuntime, type SpeedMode } from "./speedRuntimeStore";
import { Button } from "@/components/ui/orbita-button";
import { Badge } from "@/components/ui/orbita-badge";
import { FlagImage } from "@/components/ui/FlagImage";
import { cn } from "@/lib/utils";
import { spring } from "@/lib/motion";
import type { Country } from "@/types/country";

const CONTINENTS = ["All", "Africa", "Americas", "Asia", "Europe", "Oceania"] as const;

const MODE_LABELS: Record<SpeedMode, { name: string; sub: string }> = {
  sprint60: { name: "Sprint", sub: "60 seconds" },
  marathon120: { name: "Marathon", sub: "2 minutes" },
  suddenDeath: { name: "Sudden Death", sub: "3 lives" },
};

export default function SpeedPage() {
  const status = useSpeedRuntime((s) => s.status);

  if (status === "idle") return <PreGame />;
  if (status === "ended") return <PostGame />;
  return <Active />;
}

function PreGame() {
  const config = useSpeedRuntime((s) => s.config);
  const setConfig = useSpeedRuntime((s) => s.setConfig);
  const start = useSpeedRuntime((s) => s.start);

  return (
    <div className="min-h-dvh pt-28 px-6 pb-16 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0)" }}
        transition={spring.soft}
        className="glass-strong rounded-3xl p-10 max-w-xl w-full"
      >
        <Badge tone="coral">Speed Round</Badge>
        <h1 className="mt-5 font-display text-4xl text-white tracking-tight text-glow-violet">
          Reflex over recall.
        </h1>
        <p className="mt-3 text-white/60 text-[15px]">
          Rapid-fire mixed-skill questions. Build combos for multipliers up to ×5.
        </p>

        <div className="mt-8 space-y-5">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/45 mb-2">
              Mode
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(MODE_LABELS) as SpeedMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setConfig({ mode: m })}
                  className={cn(
                    "glass rounded-2xl p-3 text-left transition-all",
                    config.mode === m
                      ? "border-white/30 bg-white/8 shadow-[0_0_40px_-12px_color-mix(in_oklab,var(--violet)_70%,transparent)]"
                      : "hover:border-white/20",
                  )}
                >
                  <div className="font-display text-base text-white">{MODE_LABELS[m].name}</div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-white/50 mt-1">
                    {MODE_LABELS[m].sub}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/45 mb-2">
              Continent
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CONTINENTS.map((c) => (
                <button
                  key={c}
                  onClick={() => setConfig({ continent: c })}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-[12px] font-mono uppercase tracking-wider transition-colors",
                    config.continent === c
                      ? "bg-white/10 text-white border border-white/15"
                      : "text-white/55 hover:text-white border border-transparent",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10 flex justify-end gap-3">
          <Button size="lg" onClick={() => start()}>
            Start →
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

function Active() {
  // Isolated subscribers — timer tick (4Hz) re-renders only TimerRing.
  const queue = useSpeedRuntime((s) => s.queue);
  const index = useSpeedRuntime((s) => s.index);
  const item = queue[index];
  const answer = useSpeedRuntime((s) => s.answer);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const n = Number(e.key);
      if (n >= 1 && n <= 4 && item) answer(item.options[n - 1]!.iso3);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, answer]);

  if (!item) return null;

  return (
    <div className="min-h-dvh pt-24 px-4 pb-10 flex flex-col items-center">
      <TopBar />
      <div className="mt-8 w-full max-w-2xl flex flex-col items-center">
        <PromptForItem item={item} />
        <OptionsGrid item={item} onPick={(iso3) => answer(iso3)} />
      </div>
    </div>
  );
}

function TopBar() {
  return (
    <div className="w-full max-w-3xl flex items-center justify-between gap-4">
      <ScoreCombo />
      <TimerRing />
      <LivesOrEmpty />
    </div>
  );
}

function ScoreCombo() {
  const score = useSpeedRuntime((s) => s.score);
  const combo = useSpeedRuntime((s) => s.combo);
  const mult = Math.min(5, 1 + Math.floor((combo - 1) / 3));
  return (
    <div className="glass rounded-2xl px-4 py-3 font-mono text-[11px] uppercase tracking-wider text-white/60">
      <div className="flex justify-between gap-6">
        <span>Score</span>
        <span className="text-white">{score}</span>
      </div>
      <div className="flex justify-between gap-6 mt-1">
        <span>Combo</span>
        <span className={combo >= 3 ? "text-[color:var(--neon)]" : "text-white"}>
          ×{combo} {combo >= 3 ? `(${mult}×)` : ""}
        </span>
      </div>
    </div>
  );
}

function TimerRing() {
  const ms = useSpeedRuntime((s) => s.timeRemainingMs);
  const config = useSpeedRuntime((s) => s.config);
  const isFinite = Number.isFinite(ms);
  const total =
    config.mode === "sprint60"
      ? 60_000
      : config.mode === "marathon120"
        ? 120_000
        : 1;
  const pct = isFinite ? Math.max(0, Math.min(1, ms / total)) : 1;
  const c = 2 * Math.PI * 38;
  const dash = c * pct;
  const seconds = isFinite ? Math.ceil(ms / 1000) : 0;
  const urgent = isFinite && ms < 10_000;
  return (
    <div className="relative">
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r="38"
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="6"
        />
        <circle
          cx="50"
          cy="50"
          r="38"
          fill="none"
          stroke={urgent ? "var(--coral)" : "var(--cyan)"}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          transform="rotate(-90 50 50)"
          style={{ transition: "stroke 200ms" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center font-display text-2xl text-white tracking-tight">
        {isFinite ? seconds : "∞"}
      </div>
    </div>
  );
}

function LivesOrEmpty() {
  const lives = useSpeedRuntime((s) => s.lives);
  const mode = useSpeedRuntime((s) => s.config.mode);
  if (mode !== "suddenDeath") return <div className="w-[140px]" />;
  return (
    <div className="glass rounded-2xl px-4 py-3 font-mono text-[11px] uppercase tracking-wider text-white/60 w-[140px]">
      <div className="text-right">Lives</div>
      <div className="flex justify-end gap-1 mt-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "size-3 rounded-full",
              i < lives
                ? "bg-[color:var(--coral)] shadow-[0_0_12px_color-mix(in_oklab,var(--coral)_70%,transparent)]"
                : "bg-white/10",
            )}
          />
        ))}
      </div>
    </div>
  );
}

function PromptForItem({ item }: { item: { country: Country; skill: string } }) {
  const { country, skill } = item;
  let title: React.ReactNode;
  let eyebrow = "";
  if (skill === "name") {
    eyebrow = "Name this flag";
    title = <FlagImage iso2={country.iso2} alt="flag" className="w-48 aspect-[3/2]" />;
  } else if (skill === "flag") {
    eyebrow = "Which flag";
    title = <span className="text-glow-cyan">{country.name}</span>;
  } else if (skill === "capital") {
    eyebrow = "Capital of";
    title = <span className="text-glow-cyan">{country.name}</span>;
  } else {
    eyebrow = "Country with capital";
    title = <span className="text-glow-cyan">{country.capital ?? "—"}</span>;
  }
  return (
    <motion.div
      key={country.iso3 + skill}
      initial={{ opacity: 0, y: -10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={spring.crisp}
      className="glass-strong rounded-2xl px-6 py-5 text-center w-full"
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/45">
        {eyebrow}
      </div>
      <div className="mt-3 font-display text-2xl text-white tracking-tight flex justify-center">
        {title}
      </div>
    </motion.div>
  );
}

function OptionsGrid({
  item,
  onPick,
}: {
  item: { country: Country; skill: string; options: Country[] };
  onPick: (iso3: string) => void;
}) {
  const flash = useFlash(item.country.iso3);
  return (
    <div className="mt-6 grid grid-cols-2 gap-3 w-full">
      {item.options.map((o, i) => {
        const showFlag = item.skill === "flag";
        const showCapital = item.skill === "capital";
        const label = showCapital ? (o.capital ?? "—") : o.name;
        return (
          <button
            key={o.iso3}
            onClick={() => {
              flash(o.iso3 === item.country.iso3);
              onPick(o.iso3);
            }}
            className={cn(
              "glass rounded-2xl p-4 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-white/25",
              "outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cyan)]/60",
            )}
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/40">
              {i + 1}
            </div>
            <div className="mt-1 flex items-center gap-3">
              {showFlag && (
                <FlagImage iso2={o.iso2} alt={o.name} className="w-12 h-8 shrink-0" />
              )}
              <div className="font-display text-base text-white tracking-tight truncate">
                {label}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function useFlash(_key: string) {
  const elRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!elRef.current) {
      const el = document.createElement("div");
      el.style.cssText =
        "position:fixed;inset:0;pointer-events:none;z-index:60;opacity:0;transition:opacity 180ms";
      document.body.appendChild(el);
      elRef.current = el;
    }
    return () => {
      elRef.current?.remove();
      elRef.current = null;
    };
  }, []);
  return (correct: boolean) => {
    const el = elRef.current;
    if (!el) return;
    el.style.background = correct
      ? "radial-gradient(circle at 50% 50%, color-mix(in oklab, var(--neon) 28%, transparent), transparent 60%)"
      : "radial-gradient(circle at 50% 50%, color-mix(in oklab, var(--coral) 30%, transparent), transparent 60%)";
    el.style.opacity = "1";
    setTimeout(() => {
      el.style.opacity = "0";
    }, 140);
  };
}

function PostGame() {
  const s = useSpeedRuntime();
  const accuracy =
    s.correct + s.wrong > 0
      ? Math.round((s.correct / (s.correct + s.wrong)) * 100)
      : 0;
  return (
    <div className="min-h-dvh pt-28 px-6 pb-16 flex items-center justify-center">
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={spring.soft}
          className="glass-strong rounded-3xl p-10 max-w-md w-full text-center"
        >
          <Badge tone="cyan">Run complete</Badge>
          <div className="mt-4 font-display text-6xl text-white tracking-tight text-glow-violet">
            {s.score}
            <span className="text-[color:var(--muted)] text-xl font-mono ml-1">pts</span>
          </div>
          <div className="mt-2 text-white/55 text-sm">
            {s.correct} right · {s.wrong} wrong · {accuracy}% accuracy
          </div>
          <div className="mt-8 grid grid-cols-3 gap-3 font-mono text-[11px] uppercase tracking-wider text-white/55">
            <Stat label="Best ×" value={`×${s.bestCombo}`} />
            <Stat
              label="QPM"
              value={String(
                Math.round(((s.correct + s.wrong) / Math.max(1, (s.endedAt ?? 0) - s.startedAt)) * 60_000),
              )}
            />
            <Stat
              label="Time"
              value={`${Math.round(((s.endedAt ?? 0) - s.startedAt) / 100) / 10}s`}
            />
          </div>
          <div className="mt-8 flex gap-3 justify-center">
            <Button onClick={() => s.start()}>Run again</Button>
            <Button variant="secondary" onClick={() => s.reset()}>
              Change mode
            </Button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="glass rounded-xl py-3">
      <div className="font-display text-base text-white normal-case tracking-tight">
        {value}
      </div>
      <div className="mt-1 text-[10px]">{label}</div>
    </div>
  );
}
