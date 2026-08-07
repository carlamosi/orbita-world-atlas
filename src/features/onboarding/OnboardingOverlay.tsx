import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/orbita-button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

const STORAGE_KEY = "orbita.onboarding.done";

export function hasSeenOnboarding(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

export function markOnboardingSeen() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, "1");
}

export function resetOnboarding() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

const STEPS = [
  {
    eyebrow: "Welcome",
    title: "Welcome to ORBITA.",
    body: "Learn the world the way your brain actually remembers.",
    tone: "violet" as const,
  },
  {
    eyebrow: "Atlas",
    title: "A living atlas.",
    body: "Every country becomes part of your personal map.",
    tone: "cyan" as const,
  },
  {
    eyebrow: "Mastery",
    title: "Discover. Repeat. Master.",
    body: "Learn countries through exploration, repetition, and discovery.",
    tone: "neon" as const,
  },
  {
    eyebrow: "Progress",
    title: "Your world, fully mapped.",
    body: "Build a living atlas of everything you've learned.",
    tone: "coral" as const,
  },
];

const TONE_COLOR: Record<string, string> = {
  violet: "var(--violet)",
  cyan: "var(--cyan)",
  neon: "var(--neon)",
  coral: "var(--coral)",
};

interface Props {
  open: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

export function OnboardingOverlay({ open, onComplete, onSkip }: Props) {
  const [step, setStep] = useState(0);
  const { signedIn } = useAuth();

  useEffect(() => {
    if (!open) setStep(0);
  }, [open]);

  const last = step === STEPS.length - 1;
  const current = STEPS[step]!;
  const accent = TONE_COLOR[current.tone] ?? "var(--violet)";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          className="fixed inset-0 z-[100] grid place-items-center px-6"
          role="dialog"
          aria-modal="true"
          aria-label="Welcome to Orbita"
        >
          {/* backdrop */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 50% 40%, rgba(108,99,255,0.35), rgba(5,5,8,0.92) 60%, #050508 100%)",
              backdropFilter: "blur(18px)",
            }}
          />

          {/* skip */}
          <button
            type="button"
            onClick={() => {
              markOnboardingSeen();
              onSkip();
            }}
            className="absolute top-6 right-6 z-10 text-[11px] font-mono uppercase tracking-[0.25em] text-white/50 hover:text-white transition-colors"
          >
            Skip →
          </button>

          {/* card */}
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 glass-strong rounded-3xl px-10 py-14 max-w-xl w-full text-center"
          >
            {/* animated orb */}
            <div className="relative mx-auto mb-10 size-32">
              <motion.div
                className="absolute inset-0 rounded-full"
                animate={{ scale: [1, 1.08, 1], opacity: [0.6, 0.9, 0.6] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                style={{
                  background: `radial-gradient(circle at 35% 30%, ${accent}, transparent 70%)`,
                  filter: "blur(8px)",
                }}
              />
              <div
                className="absolute inset-3 rounded-full border"
                style={{
                  borderColor: `color-mix(in oklab, ${accent} 50%, transparent)`,
                  background:
                    "radial-gradient(circle at 30% 25%, #2a2f5e 0%, #0b0d1f 60%, #050508 100%)",
                  boxShadow: `0 0 60px -10px ${accent}`,
                }}
              />
            </div>

            <div
              className="font-mono text-[10px] uppercase tracking-[0.3em]"
              style={{ color: accent }}
            >
              Step {step + 1} / {STEPS.length} · {current.eyebrow}
            </div>
            <h2 className="mt-3 font-display text-3xl md:text-4xl text-white tracking-tight text-glow-violet">
              {current.title}
            </h2>
            <p className="mt-4 text-white/65 text-[15px] leading-relaxed max-w-md mx-auto">
              {current.body}
            </p>

            {/* step indicator */}
            <div className="mt-8 flex items-center justify-center gap-1.5">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1 rounded-full transition-all duration-300",
                    i === step ? "w-8" : "w-2 bg-white/20",
                  )}
                  style={i === step ? { background: accent, boxShadow: `0 0 12px ${accent}` } : undefined}
                />
              ))}
            </div>

            <div className="mt-8 flex flex-col items-center gap-3">
              <div className="flex justify-center gap-3">
                {step > 0 && (
                  <Button size="md" variant="secondary" onClick={() => setStep(step - 1)}>
                    Back
                  </Button>
                )}
                {!last ? (
                  <Button size="md" onClick={() => setStep(step + 1)}>
                    Continue
                  </Button>
                ) : (
                  <Button
                    size="md"
                    onClick={() => {
                      markOnboardingSeen();
                      onComplete();
                    }}
                  >
                    Begin Your Journey →
                  </Button>
                )}
              </div>
              {/* Auth CTA — only shown on last step for guests */}
              {last && !signedIn && (
                <Link
                  to="/auth"
                  search={{ mode: "signup" }}
                  onClick={() => { markOnboardingSeen(); onSkip(); }}
                  className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.2em] transition-colors hover:opacity-100"
                  style={{ color: accent, opacity: 0.85 }}
                >
                  <span style={{ fontSize: 14 }}>💾</span> Create an account to save your progress →
                </Link>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
