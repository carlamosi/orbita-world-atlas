import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, useScroll, useTransform, useSpring, useMotionValueEvent } from "framer-motion";
import { useRef, useState } from "react";
import { Card } from "@/components/ui/orbita-card";
import { Button } from "@/components/ui/orbita-button";
import { Badge } from "@/components/ui/orbita-badge";
import { fadeUp, spring, stagger } from "@/lib/motion";
import { COUNTRIES } from "@/lib/countries";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Orbita — Master every corner of the world" },
      {
        name: "description",
        content:
          "195 countries. Every capital. Every flag. A cinematic geography mastery platform.",
      },
      { property: "og:title", content: "Orbita — Master every corner of the world" },
      {
        property: "og:description",
        content: "A living atlas. 195 countries, every capital, every flag — explored from orbit.",
      },
    ],
  }),
  component: Home,
});

const MODES = [
  {
    to: "/find",
    title: "Find It",
    tagline: "Pinpoint a country on the orbital globe.",
    tone: "violet" as const,
  },
  {
    to: "/name",
    title: "Name It",
    tagline: "A mystery country zooms in. Name it.",
    tone: "cyan" as const,
  },
  {
    to: "/flags",
    title: "Flags",
    tagline: "Flag to country, country to flag.",
    tone: "neon" as const,
  },
  {
    to: "/capitals",
    title: "Capitals",
    tagline: "Match the world's seats of power.",
    tone: "coral" as const,
  },
  {
    to: "/speed",
    title: "Speed Round",
    tagline: "60 seconds. Pure orbital reflexes.",
    tone: "violet" as const,
  },
  {
    to: "/challenges",
    title: "Daily Quest",
    tagline: "Unlock continents one mastery at a time.",
    tone: "cyan" as const,
  },
];

function Home() {
  const totalCountries = COUNTRIES.length;
  return (
    <>
      <CinematicScroll totalCountries={totalCountries} />
      <ModesSection />
      <FinalCta />
      <Footer />
    </>
  );
}

/* =========================================================
   Cinematic sticky scroll: 380vh viewport with parallax globe
   ========================================================= */

function CinematicScroll({ totalCountries }: { totalCountries: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });
  const progress = useSpring(scrollYProgress, { stiffness: 80, damping: 22, mass: 0.6 });

  const globeScale = useTransform(progress, [0, 0.6, 1], [1, 1.35, 1.15]);
  const globeY = useTransform(progress, [0, 1], ["0%", "-12%"]);
  const globeRotate = useTransform(progress, [0, 1], [0, 140]);
  const heroOpacity = useTransform(progress, [0, 0.25], [1, 0]);
  const heroY = useTransform(progress, [0, 0.25], [0, -80]);
  const statsOpacity = useTransform(progress, [0.25, 0.45, 0.7, 0.85], [0, 1, 1, 0]);
  const statsY = useTransform(progress, [0.25, 0.45], [40, 0]);

  return (
    <section ref={ref} className="relative" style={{ height: "380vh" }}>
      <div className="sticky top-0 h-dvh w-full overflow-hidden">
        {/* Globe (CSS-only stand-in on home for performance; real WebGL on game pages) */}
        <motion.div
          aria-hidden
          style={{ scale: globeScale, y: globeY, rotate: globeRotate }}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        >
          <CssGlobe />
        </motion.div>

        {/* Hero copy */}
        <motion.div
          style={{ opacity: heroOpacity, y: heroY }}
          className="relative z-10 h-full flex flex-col items-center justify-center text-center px-6"
        >
          <h1 className="font-display font-semibold tracking-[-0.03em] text-[clamp(2.6rem,8vw,6.5rem)] leading-[0.95] text-white text-glow-violet">
            Master every corner
            <br />
            <span className="bg-gradient-to-r from-[#a5a0ff] via-white to-[#6ee7ff] bg-clip-text text-transparent">
              of the world.
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-[15px] md:text-base text-white/65 leading-relaxed">
            195 countries. Every capital. Every flag. All yours — explored from orbit
            through a living, atmospheric atlas.
          </p>
          <div className="mt-10 flex flex-wrap gap-3 justify-center">
            <Link to="/find">
              <Button size="lg">Begin orbit →</Button>
            </Link>
            <Link to="/explorer">
              <Button variant="secondary" size="lg">
                Explore the atlas
              </Button>
            </Link>
          </div>
          <p className="mt-10 text-[11px] uppercase tracking-[0.25em] text-white/35 font-mono">
            Scroll to enter the orbit
          </p>
        </motion.div>

        {/* Stats section — appears while globe scales. Always pointer-events-none
            so it never intercepts the hero CTAs underneath at scroll=0. */}
        <motion.div
          style={{ opacity: statsOpacity, y: statsY }}
          className="absolute inset-0 z-[5] flex items-center justify-center pointer-events-none"
        >
          <div className="grid grid-cols-2 gap-4 md:gap-6 w-[min(92vw,820px)]">
            <StatCard label="Countries" value={totalCountries} tone="violet" />
            <StatCard label="Continents" value={7} tone="cyan" />
            <StatCard label="Capitals" value={195} tone="neon" />
            <StatCard label="Flag combos" value={1000} suffix="+" tone="coral" />
          </div>
        </motion.div>

        {/* Bottom fade into next section */}
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#050508] z-30 pointer-events-none" />
      </div>
    </section>
  );
}

function CssGlobe() {
  // Cinematic CSS-only orbital "globe" — atmospheric depth without WebGL cost on home.
  return (
    <div className="relative size-[min(78vh,820px)] aspect-square">
      {/* Outer atmosphere */}
      <div
        className="absolute inset-[-12%] rounded-full"
        style={{
          background:
            "radial-gradient(circle at 35% 35%, rgba(108,99,255,0.45), transparent 55%), radial-gradient(circle at 70% 70%, rgba(0,212,255,0.35), transparent 55%)",
          filter: "blur(40px)",
        }}
      />
      {/* Planet body */}
      <div
        className="absolute inset-0 rounded-full overflow-hidden"
        style={{
          background:
            "radial-gradient(circle at 30% 25%, #2a2f5e 0%, #0b0d1f 55%, #050508 100%)",
          boxShadow:
            "inset -40px -40px 120px rgba(0,0,0,0.85), inset 30px 30px 80px rgba(108,99,255,0.25), 0 0 120px -10px rgba(0,212,255,0.35)",
        }}
      >
        {/* Continent silhouette texture */}
        <div
          className="absolute inset-0 opacity-50"
          style={{
            background:
              "radial-gradient(40% 30% at 30% 40%, rgba(0,255,178,0.18), transparent 60%), radial-gradient(35% 25% at 65% 55%, rgba(108,99,255,0.25), transparent 60%), radial-gradient(25% 18% at 50% 75%, rgba(0,212,255,0.18), transparent 60%)",
            mixBlendMode: "screen",
          }}
        />
        {/* Lat/long grid */}
        <svg
          className="absolute inset-0 size-full opacity-25"
          viewBox="0 0 100 100"
          aria-hidden
        >
          {Array.from({ length: 7 }).map((_, i) => (
            <ellipse
              key={`lat-${i}`}
              cx="50"
              cy="50"
              rx="50"
              ry={6 + i * 6}
              fill="none"
              stroke="#9ea7ff"
              strokeWidth="0.15"
            />
          ))}
          {Array.from({ length: 9 }).map((_, i) => (
            <ellipse
              key={`lng-${i}`}
              cx="50"
              cy="50"
              rx={4 + i * 5}
              ry="50"
              fill="none"
              stroke="#9ea7ff"
              strokeWidth="0.15"
            />
          ))}
        </svg>
        {/* City pulses */}
        {[
          ["18%", "32%"],
          ["62%", "44%"],
          ["44%", "70%"],
          ["72%", "28%"],
          ["28%", "60%"],
        ].map(([l, t], i) => (
          <span
            key={i}
            className="absolute size-1.5 rounded-full bg-cyan animate-pulse-glow"
            style={{ left: l, top: t, animationDelay: `${i * 0.4}s` }}
          />
        ))}
      </div>
      {/* Edge highlight */}
      <div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          boxShadow:
            "inset 0 0 1px rgba(255,255,255,0.4), inset 0 0 40px rgba(0,212,255,0.15)",
        }}
      />
      {/* Orbital ring */}
      <div
        className="absolute inset-[-6%] rounded-full border border-white/10"
        style={{ transform: "rotate3d(1,0.4,0,72deg)" }}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  suffix = "",
}: {
  label: string;
  value: number;
  tone: "violet" | "cyan" | "neon" | "coral";
  suffix?: string;
}) {
  const [v, setV] = useState(0);
  const { scrollYProgress } = useScroll();
  useMotionValueEvent(scrollYProgress, "change", () => {
    setV((prev) => (prev < value ? Math.min(value, prev + Math.ceil(value / 30)) : value));
  });

  const colorMap = {
    violet: "var(--violet)",
    cyan: "var(--cyan)",
    neon: "var(--neon)",
    coral: "var(--coral)",
  } as const;

  return (
    <Card className="text-center p-8">
      <div
        className="font-display font-semibold text-5xl md:text-6xl tracking-tight"
        style={{ color: colorMap[tone], textShadow: `0 0 32px ${colorMap[tone]}55` }}
      >
        {v}
        {suffix}
      </div>
      <div className="mt-2 font-mono text-[11px] uppercase tracking-[0.22em] text-white/55">
        {label}
      </div>
    </Card>
  );
}

/* ============== Modes section ============== */

function ModesSection() {
  return (
    <section className="relative py-32 px-6">
      <div className="max-w-6xl mx-auto">
        <motion.div
          variants={stagger(0.1, 0.08)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="text-center mb-16"
        >
          <motion.div variants={fadeUp}>
            <Badge tone="violet">Modes</Badge>
          </motion.div>
          <motion.h2
            variants={fadeUp}
            className="mt-5 font-display text-4xl md:text-6xl font-semibold tracking-tight text-white"
          >
            Six orbits.
            <br />
            <span className="text-white/55">One mastery.</span>
          </motion.h2>
        </motion.div>

        <motion.div
          variants={stagger(0.05, 0.08)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {MODES.map((m) => (
            <motion.div key={m.to} variants={fadeUp}>
              <Link to={m.to} className="block group">
                <Card interactive className="h-48 flex flex-col justify-between">
                  <Badge tone={m.tone}>{m.tone === "coral" ? "Daily" : "Mode"}</Badge>
                  <div>
                    <h3 className="font-display text-2xl text-white tracking-tight">
                      {m.title}
                    </h3>
                    <p className="mt-1 text-sm text-white/55">{m.tagline}</p>
                  </div>
                  <div
                    className="absolute -inset-px rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                    style={{
                      background:
                        "radial-gradient(400px 200px at var(--mx,50%) var(--my,50%), rgba(108,99,255,0.18), transparent 60%)",
                    }}
                  />
                </Card>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ============== Final CTA ============== */

function FinalCta() {
  return (
    <section className="relative py-40 px-6 text-center">
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-[700px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(108,99,255,0.28) 0%, transparent 60%)",
          filter: "blur(40px)",
        }}
      />
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={spring.soft}
        className="relative z-10 max-w-3xl mx-auto"
      >
        <h2 className="font-display font-semibold text-5xl md:text-7xl tracking-[-0.03em] text-white text-glow-violet">
          Your world.
          <br />
          <span className="bg-gradient-to-r from-[#a5a0ff] to-[#6ee7ff] bg-clip-text text-transparent">
            Fully explored.
          </span>
        </h2>
        <p className="mt-8 text-white/55 text-lg max-w-xl mx-auto">
          Step into the orbit. The atlas is waiting.
        </p>
        <div className="mt-12">
          <Link to="/find">
            <Button size="lg" className="animate-pulse-glow">
              Enter the orbit →
            </Button>
          </Link>
        </div>
      </motion.div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="relative z-10 py-12 px-6 text-center text-[11px] uppercase tracking-[0.25em] text-white/30 font-mono border-t border-white/5">
      Orbita · Cinematic Geography · {new Date().getFullYear()}
    </footer>
  );
}
