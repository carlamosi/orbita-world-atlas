import { useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSpeedRuntime, type SpeedMode } from "./speedRuntimeStore";
import { useSkipHotkey } from "@/hooks/useSkipHotkey";
import { Button } from "@/components/ui/orbita-button";
import { Badge } from "@/components/ui/orbita-badge";
import { FlagImage } from "@/components/ui/FlagImage";
import {
  ContinentSelect,
  useContinentPref,
} from "@/features/engine/ContinentSelect";
import { cn } from "@/lib/utils";
import { spring } from "@/lib/motion";
import type { Country } from "@/types/country";
import { Zap, Timer, Skull, Flag, MapPin, Type, Globe } from "lucide-react";

const MODE_META: Record<SpeedMode, { name: string; sub: string; desc: string; icon: React.ReactNode }> = {
  sprint60: {
    name: "Sprint",
    sub: "60 seconds",
    desc: "Pure speed against the clock.",
    icon: <Zap className="w-5 h-5" />,
  },
  marathon120: {
    name: "Marathon",
    sub: "2 minutes",
    desc: "Build massive combos over time.",
    icon: <Timer className="w-5 h-5" />,
  },
  suddenDeath: {
    name: "Sudden Death",
    sub: "3 lives",
    desc: "One wrong answer costs a life.",
    icon: <Skull className="w-5 h-5" />,
  },
};

const SKILL_PILLS = [
  { icon: <Flag className="w-3.5 h-3.5" />, label: "Flags" },
  { icon: <MapPin className="w-3.5 h-3.5" />, label: "Capitals" },
  { icon: <Type className="w-3.5 h-3.5" />, label: "Name" },
  { icon: <Globe className="w-3.5 h-3.5" />, label: "Find" },
];

export default function SpeedPage() {
  const status = useSpeedRuntime((s) => s.status);
  const mode = useSpeedRuntime((s) => s.config.mode);

  if (status === "idle") return <PreGame key="pre" />;
  if (status === "ended") return <PostGame key="post" />;
  // Key by mode so a mode-switch tears down all subscribers + effects cleanly.
  return <Active key={`active-${mode}`} />;
}

function PreGame() {
  const config = useSpeedRuntime((s) => s.config);
  const setConfig = useSpeedRuntime((s) => s.setConfig);
  const start = useSpeedRuntime((s) => s.start);
  // Re-use shared continent preference so selection persists across modes
  const [continent, setContinent] = useContinentPref();

  const handleContinentChange = (c: string) => {
    setContinent(c as Parameters<typeof setContinent>[0]);
    setConfig({ continent: c === "All" ? "All" : c });
  };

  return (
    <div className="relative min-h-dvh flex items-center justify-center px-4 py-16 overflow-hidden">
      {/* Ambient radial glow — depth without noise */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div className="w-[700px] h-[500px] rounded-full bg-[radial-gradient(ellipse_at_center,color-mix(in_oklab,var(--violet)_18%,transparent)_0%,transparent_70%)] blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24, filter: "blur(10px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0)" }}
        transition={spring.soft}
        className="relative glass-strong rounded-3xl p-8 md:p-10 max-w-lg w-full z-10 flex flex-col gap-7"
      >
        {/* ── Header ─────────────────────────────── */}
        <div>
          <Badge tone="coral">Speed Round</Badge>
          <h1 className="mt-4 font-display text-3xl text-white tracking-tight text-glow-violet leading-tight">
            Reflex over recall.
          </h1>
          <p className="mt-2 text-white/55 text-sm leading-relaxed">
            Rapid-fire mixed-skill questions. Build combos for multipliers up to ×5.
          </p>

          {/* Game includes pills */}
          <div className="mt-4 flex flex-wrap gap-2">
            {SKILL_PILLS.map(({ icon, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full glass text-[11px] font-mono uppercase tracking-wider text-white/55 border border-white/10"
              >
                <span className="text-white/40">{icon}</span>
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* ── Mode selector ─────────────────────── */}
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/40 mb-3">
            Mode
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {(Object.keys(MODE_META) as SpeedMode[]).map((m) => {
              const active = config.mode === m;
              const meta = MODE_META[m];
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setConfig({ mode: m })}
                  aria-pressed={active}
                  className={cn(
                    "relative flex flex-col gap-2 rounded-2xl p-4 text-left transition-all duration-200 border outline-none",
                    "focus-visible:ring-2 focus-visible:ring-[color:var(--cyan)]/60",
                    active
                      ? [
                          "border-[color:var(--violet)]/60",
                          "bg-[color-mix(in_oklab,var(--violet)_18%,transparent)]",
                          "shadow-[0_0_32px_-8px_color-mix(in_oklab,var(--violet)_65%,transparent)]",
                          "scale-[1.02]",
                        ]
                      : [
                          "glass border-white/10",
                          "hover:border-white/22 hover:-translate-y-0.5",
                          "hover:shadow-[0_12px_30px_-12px_rgba(0,0,0,0.5)]",
                        ],
                  )}
                >
                  {/* Active pulse dot */}
                  {active && (
                    <span className="absolute top-2.5 right-2.5 size-1.5 rounded-full bg-[color:var(--neon)] shadow-[0_0_8px_color-mix(in_oklab,var(--neon)_90%,transparent)] animate-pulse" />
                  )}
                  <span
                    className={cn(
                      "transition-colors",
                      active ? "text-[color:var(--violet)]" : "text-white/40",
                    )}
                  >
                    {meta.icon}
                  </span>
                  <div>
                    <div className="font-display text-sm text-white leading-tight">{meta.name}</div>
                    <div className="font-mono text-[10px] uppercase tracking-wider text-white/45 mt-0.5">
                      {meta.sub}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Continent ─────────────────────────── */}
        <div className="flex items-center justify-between gap-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/40">
            Region
          </div>
          <ContinentSelect value={continent} onChange={handleContinentChange} />
        </div>

        {/* ── CTA ───────────────────────────────── */}
        <button
          type="button"
          onClick={() => start(config.mode)}
          className={cn(
            "w-full py-4 rounded-2xl font-display text-lg tracking-tight text-white transition-all duration-200 outline-none",
            "bg-[color-mix(in_oklab,var(--violet)_40%,transparent)] border border-[color:var(--violet)]/50",
            "hover:bg-[color-mix(in_oklab,var(--violet)_55%,transparent)] hover:border-[color:var(--violet)]/80",
            "hover:shadow-[0_0_40px_-10px_color-mix(in_oklab,var(--violet)_60%,transparent)] hover:-translate-y-0.5",
            "focus-visible:ring-2 focus-visible:ring-[color:var(--violet)]/60",
          )}
        >
          Start Speed Round
        </button>
      </motion.div>
    </div>
  );
}

function Active() {
  // Isolated subscribers — timer tick (4Hz) re-renders only TimerRing.
  const queue = useSpeedRuntime((s) => s.queue);
  const index = useSpeedRuntime((s) => s.index);
  const status = useSpeedRuntime((s) => s.status);
  const item = queue[index];
  const answer = useSpeedRuntime((s) => s.answer);
  const skip = useSpeedRuntime((s) => s.skip);
  const reset = useSpeedRuntime((s) => s.reset);

  // Numeric 1–4 hotkeys — capture phase so transitions / overlays / focus
  // changes can't intercept. Ignores typing in inputs and open dialogs.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.isContentEditable)
      )
        return;
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= 4 && item) {
        e.preventDefault();
        answer(item.options[n - 1]!.iso3);
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [item, answer]);

  const onSkip = useCallback(() => skip(), [skip]);
  useSkipHotkey(onSkip);

  // Kill the timer if the user navigates away mid-run.
  useEffect(() => {
    return () => {
      if (useSpeedRuntime.getState().status === "running") reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!item || status !== "running") return null;

  return (
    <div className="min-h-dvh pt-24 px-4 pb-10 flex flex-col items-center">
      <TopBar onExit={reset} />
      <div className="mt-8 w-full max-w-2xl flex flex-col items-center">
        <PromptForItem item={item} />
        <OptionsGrid item={item} onPick={(iso3) => answer(iso3)} />
      </div>
    </div>
  );
}

function TopBar({ onExit }: { onExit: () => void }) {
  return (
    <div className="w-full max-w-3xl flex items-center justify-between gap-4">
      <ScoreCombo />
      <TimerRing />
      <div className="flex items-center gap-2">
        <LivesOrEmpty />
        <Button
          size="sm"
          variant="secondary"
          onClick={onExit}
          aria-label="Exit Speed mode"
          className="shrink-0"
        >
          ✕ Exit
        </Button>
      </div>
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
  const isFlagSkill = item.skill === "flag";
  if (isFlagSkill) {
    // Flag-pick mode: render flags only, no country names alongside.
    return (
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 w-full">
        {item.options.map((o, i) => (
          <button
            key={o.iso3}
            onClick={() => {
              flash(o.iso3 === item.country.iso3);
              onPick(o.iso3);
            }}
            className={cn(
              "group relative aspect-[3/2] rounded-2xl overflow-hidden transition-transform duration-150",
              "hover:scale-[1.03] shadow-[0_16px_40px_-18px_rgba(0,0,0,0.7)]",
              "outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cyan)]/60",
            )}
            aria-label={`Option ${i + 1}`}
          >
            <FlagImage iso2={o.iso2} alt="flag option" className="absolute inset-0 rounded-none" />
            <span className="absolute top-1.5 left-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-white bg-black/60 rounded-full px-1.5 py-0.5">
              {i + 1}
            </span>
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="mt-6 grid grid-cols-2 gap-3 w-full">
      {item.options.map((o, i) => {
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
            <div className="mt-1 font-display text-base text-white tracking-tight truncate">
              {label}
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
            <Button onClick={() => s.start(s.config.mode)}>Run again</Button>
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
