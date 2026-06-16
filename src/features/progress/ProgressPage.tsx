import { useMemo } from "react";
import { motion } from "framer-motion";
import { useLiveQuery } from "dexie-react-hooks";
import { db, ALL_SKILLS, type Skill } from "@/lib/db/orbita-db";
import { COUNTRIES, COUNTRY_BY_ISO3 } from "@/lib/countries";
import { Badge } from "@/components/ui/orbita-badge";
import { FlagImage } from "@/components/ui/FlagImage";
import { spring } from "@/lib/motion";
import { dateKey, currentStreak, longestStreak } from "@/lib/streak";
import { DEFINITIONS, defByKey } from "@/lib/unlocks";
import { cn } from "@/lib/utils";

const CONTINENTS = ["Africa", "Americas", "Asia", "Europe", "Oceania"] as const;

export default function ProgressPage() {
  const progress = useLiveQuery(() => db().countryProgress.toArray(), []) ?? [];
  const sessions = useLiveQuery(() => db().gameSessions.toArray(), []) ?? [];
  const unlocks = useLiveQuery(() => db().unlocks.toArray(), []) ?? [];

  const activeDays = useMemo(
    () => new Set(sessions.map((s) => dateKey(s.createdAt))),
    [sessions],
  );

  const totalAnswered = sessions.reduce((a, s) => a + s.totalQuestions, 0);
  const minutes = Math.round(sessions.reduce((a, s) => a + s.durationMs, 0) / 60_000);

  const mastered = useMemo(
    () =>
      progress.filter((p) => {
        const vs = Object.values(p.skills);
        return vs.length > 0 && vs.every((s) => s && s.confidence >= 0.8);
      }).length,
    [progress],
  );

  const cs = currentStreak(activeDays);
  const ls = longestStreak(activeDays);

  return (
    <div className="min-h-dvh pt-24 pb-16 px-4 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <motion.header
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.soft}
          className="mb-8"
        >
          <Badge tone="cyan">Mastery dashboard</Badge>
          <h1 className="mt-3 font-display text-4xl text-white tracking-tight text-glow-violet">
            Your orbit so far
          </h1>
          <p className="mt-2 text-white/55 text-[15px]">
            Real numbers from real sessions. Everything lives in your browser.
          </p>
        </motion.header>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <HeroStat label="Mastered" value={mastered} sub={`of ${COUNTRIES.length}`} />
          <HeroStat label="Answered" value={totalAnswered} />
          <HeroStat label="Sessions" value={sessions.length} />
          <HeroStat label="Streak" value={`${cs}d`} sub={`best ${ls}d`} />
          <HeroStat label="Minutes" value={minutes} />
        </div>

        <section className="mt-10">
          <SectionTitle>Confidence map</SectionTitle>
          <ConfidenceMap progress={progress} />
        </section>

        <section className="mt-10 grid lg:grid-cols-2 gap-4">
          {ALL_SKILLS.map((skill) => (
            <SkillPanel key={skill} skill={skill} progress={progress} />
          ))}
        </section>

        <section className="mt-10">
          <SectionTitle>Unlocks</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {DEFINITIONS.map((d) => {
              const u = unlocks.find((x) => x.key === d.key);
              const unlocked = u?.unlockedAt != null;
              const pct = Math.round((u?.progress ?? 0) * 100);
              return (
                <div
                  key={d.key}
                  className={cn(
                    "glass rounded-2xl p-4 transition-all",
                    unlocked && "border-[color:var(--neon)]/40 shadow-[0_0_30px_-10px_color-mix(in_oklab,var(--neon)_60%,transparent)]",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-display text-base text-white tracking-tight">
                      {d.title}
                    </div>
                    {unlocked ? (
                      <Badge tone="neon">Unlocked</Badge>
                    ) : (
                      <span className="font-mono text-[11px] text-white/45">{pct}%</span>
                    )}
                  </div>
                  <div className="mt-1 text-[12px] text-white/55">{d.description}</div>
                  <div className="mt-3 h-1.5 rounded-full bg-white/8 overflow-hidden">
                    <div
                      className="h-full"
                      style={{
                        width: `${Math.max(2, pct)}%`,
                        background: unlocked ? "var(--neon)" : "var(--cyan)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-10">
          <SectionTitle>Recent sessions</SectionTitle>
          <div className="glass rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-white/45 font-mono text-[11px] uppercase tracking-wider">
                  <th className="px-4 py-2">When</th>
                  <th className="px-4 py-2">Mode</th>
                  <th className="px-4 py-2">Skill</th>
                  <th className="px-4 py-2 text-right">Score</th>
                  <th className="px-4 py-2 text-right">Acc</th>
                </tr>
              </thead>
              <tbody>
                {sessions
                  .slice()
                  .sort((a, b) => b.createdAt - a.createdAt)
                  .slice(0, 15)
                  .map((s) => (
                    <tr key={s.id} className="border-t border-white/5">
                      <td className="px-4 py-2 text-white/70">{relTime(s.createdAt)}</td>
                      <td className="px-4 py-2 text-white">{s.mode}</td>
                      <td className="px-4 py-2 text-white/70">{s.skill}</td>
                      <td className="px-4 py-2 text-right text-white">{s.score}</td>
                      <td className="px-4 py-2 text-right text-white/70">
                        {s.totalQuestions > 0
                          ? `${Math.round((s.correct / s.totalQuestions) * 100)}%`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                {sessions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-white/45">
                      No sessions yet — play one round and come back.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10">
          <SectionTitle>By continent</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {CONTINENTS.map((cont) => {
              const list = COUNTRIES.filter((c) => c.continent === cont);
              const byIso = new Map(progress.map((p) => [p.iso3, p]));
              const mastered = list.filter((c) =>
                Object.values(byIso.get(c.iso3)?.skills ?? {}).some(
                  (s) => s && s.confidence >= 0.8,
                ),
              ).length;
              const pct = list.length > 0 ? mastered / list.length : 0;
              return (
                <div key={cont} className="glass rounded-2xl p-4">
                  <div className="font-display text-white">{cont}</div>
                  <div className="font-mono text-[11px] text-white/45 mt-1">
                    {mastered}/{list.length}
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-white/8 overflow-hidden">
                    <div
                      className="h-full"
                      style={{
                        width: `${Math.max(2, pct * 100)}%`,
                        background:
                          pct >= 0.8 ? "var(--neon)" : pct >= 0.4 ? "var(--cyan)" : "var(--violet)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-white/45 mb-3">
      {children}
    </div>
  );
}

function HeroStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="glass-strong rounded-2xl p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/45">
        {label}
      </div>
      <div className="mt-1 font-display text-3xl text-white tracking-tight text-glow-violet">
        {value}
      </div>
      {sub && <div className="font-mono text-[10px] text-white/45 mt-1">{sub}</div>}
    </div>
  );
}

function ConfidenceMap({ progress }: { progress: Array<{ iso3: string; skills: Record<string, { confidence: number } | undefined> }> }) {
  const byIso = new Map(progress.map((p) => [p.iso3, p]));
  const cells = COUNTRIES.map((c) => {
    const p = byIso.get(c.iso3);
    const vs = p ? Object.values(p.skills).filter(Boolean) as { confidence: number }[] : [];
    const avg = vs.length > 0 ? vs.reduce((a, s) => a + s.confidence, 0) / vs.length : 0;
    return { c, avg };
  }).sort((a, b) => {
    if (a.c.continent !== b.c.continent) return a.c.continent.localeCompare(b.c.continent);
    return a.c.name.localeCompare(b.c.name);
  });

  return (
    <div className="glass rounded-2xl p-4">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(18px,1fr))] gap-1">
        {cells.map(({ c, avg }) => (
          <div
            key={c.iso3}
            title={`${c.name} · ${Math.round(avg * 100)}%`}
            className="aspect-square rounded-[4px]"
            style={{
              background:
                avg <= 0
                  ? "rgba(255,255,255,0.04)"
                  : `color-mix(in oklab, ${
                      avg >= 0.8 ? "var(--neon)" : avg >= 0.4 ? "var(--cyan)" : "var(--coral)"
                    } ${Math.round(20 + avg * 70)}%, transparent)`,
            }}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-white/45">
        <span>Cold</span>
        <div className="flex gap-1">
          <span className="size-2 rounded-sm bg-[color:var(--coral)]/60" />
          <span className="size-2 rounded-sm bg-[color:var(--cyan)]/60" />
          <span className="size-2 rounded-sm bg-[color:var(--neon)]/70" />
        </div>
        <span>Mastered</span>
      </div>
    </div>
  );
}

function SkillPanel({
  skill,
  progress,
}: {
  skill: Skill;
  progress: Array<{ iso3: string; skills: Record<string, { confidence: number; lastSeenAt?: number } | undefined> }>;
}) {
  const rows = progress
    .map((p) => ({ iso3: p.iso3, stat: p.skills[skill] }))
    .filter((r) => r.stat);
  const sorted = rows.slice().sort((a, b) => a.stat!.confidence - b.stat!.confidence);
  const weakest = sorted.slice(0, 5);
  const strongest = sorted.slice(-5).reverse();

  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <div className="font-display text-lg text-white capitalize">{skill}</div>
        <Badge tone="muted">{rows.length} seen</Badge>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-white/45 mb-1">
            Strongest
          </div>
          {strongest.length === 0 && <div className="text-white/45 text-sm">—</div>}
          {strongest.map((r) => (
            <CountryRow key={r.iso3} iso3={r.iso3} pct={Math.round(r.stat!.confidence * 100)} />
          ))}
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-white/45 mb-1">
            Needs work
          </div>
          {weakest.length === 0 && <div className="text-white/45 text-sm">—</div>}
          {weakest.map((r) => (
            <CountryRow key={r.iso3} iso3={r.iso3} pct={Math.round(r.stat!.confidence * 100)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function CountryRow({ iso3, pct }: { iso3: string; pct: number }) {
  const c = COUNTRY_BY_ISO3.get(iso3);
  if (!c) return null;
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <div className="flex items-center gap-2 min-w-0">
        <FlagImage iso2={c.iso2} alt={c.name} className="w-5 h-3.5 rounded-sm shrink-0" />
        <span className="text-white/85 text-[13px] truncate">{c.name}</span>
      </div>
      <span className="font-mono text-[11px] text-white/55">{pct}%</span>
    </div>
  );
}

function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

defByKey; // keep import referenced for future deep-link unlock pages
