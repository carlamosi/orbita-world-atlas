import { useMemo } from "react";
import { motion } from "framer-motion";
import { useLiveQuery } from "dexie-react-hooks";
import { db, ALL_SKILLS, type Skill } from "@/lib/db/orbita-db";
import { COUNTRIES, COUNTRY_BY_ISO3 } from "@/lib/countries";
import { Badge } from "@/components/ui/orbita-badge";
import { FlagImage } from "@/components/ui/FlagImage";
import { spring } from "@/lib/motion";
import { dateKey, currentStreak, longestStreak } from "@/lib/streak";
import { DEFINITIONS } from "@/lib/unlocks";
import { cn } from "@/lib/utils";
import { retention, isDue, isOverdue } from "@/lib/spacedRepetition";

const CONTINENTS = ["Africa", "Americas", "Asia", "Europe", "Oceania"] as const;

export default function ProgressPage() {
  const conceptProgress = useLiveQuery(() => db().concept_progress.toArray(), []) ?? [];
  const sessions = useLiveQuery(() => db().gameSessions.toArray(), []) ?? [];
  const unlocks = useLiveQuery(() => db().unlocks.toArray(), []) ?? [];

  const activeDays = useMemo(
    () => new Set(sessions.map((s) => dateKey(s.createdAt))),
    [sessions],
  );

  const totalAnswered = sessions.reduce((a, s) => a + s.totalQuestions, 0);
  const minutes = Math.round(sessions.reduce((a, s) => a + s.durationMs, 0) / 60_000);

  const mastered = useMemo(() => {
    const byIso = new Map<string, number>();
    const byIsoMastered = new Map<string, number>();
    for (const p of conceptProgress) {
      if (p.fsrs_state === "new") continue;
      byIso.set(p.iso3, (byIso.get(p.iso3) ?? 0) + 1);
      
      const elapsedDays = Math.max(0, (Date.now() - p.fsrs_last_review) / 86400000);
      const r = p.fsrs_stability ? retention(p.fsrs_stability, elapsedDays) : 0;
      if (r >= 0.8) {
        byIsoMastered.set(p.iso3, (byIsoMastered.get(p.iso3) ?? 0) + 1);
      }
    }
    let count = 0;
    for (const [iso, total] of byIso.entries()) {
      if (total >= 3 && byIsoMastered.get(iso) === total) count++;
    }
    return count;
  }, [conceptProgress]);

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
          <MasteryStability progress={conceptProgress} />
        </section>

        <section className="mt-10">
          <SectionTitle>Confidence map</SectionTitle>
          <ConfidenceMap progress={conceptProgress} />
        </section>


        <section className="mt-10 grid lg:grid-cols-2 gap-4">
          {ALL_SKILLS.map((skill) => (
            <SkillPanel key={skill} skill={skill} progress={conceptProgress} />
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
              const byIsoMastered = new Map<string, boolean>();
              const grouped = new Map<string, number[]>();
              
              for (const p of conceptProgress) {
                if (p.fsrs_state === "new") continue;
                const arr = grouped.get(p.iso3) || [];
                const r = p.fsrs_stability ? retention(p.fsrs_stability, Math.max(0, (Date.now() - p.fsrs_last_review) / 86400000)) : 0;
                arr.push(r);
                grouped.set(p.iso3, arr);
              }
              
              let masteredCount = 0;
              for (const c of list) {
                const rs = grouped.get(c.iso3) || [];
                if (rs.length >= 3 && rs.every(r => r >= 0.8)) {
                  masteredCount++;
                }
              }
              
              const pct = list.length > 0 ? masteredCount / list.length : 0;
              return (
                <div key={cont} className="glass rounded-2xl p-4">
                  <div className="font-display text-white">{cont}</div>
                  <div className="font-mono text-[11px] text-white/45 mt-1">
                    {masteredCount}/{list.length}
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

import type { ConceptProgressRow } from "@/lib/db/orbita-db";
import { retrievability } from "@/lib/fsrs/engine";

function MasteryStability({
  progress,
}: {
  progress: ConceptProgressRow[];
}) {
  const now = Date.now();
  const metrics = useMemo(() => {
    let totalSeen = 0;
    let active = 0;
    let dueToday = 0;
    let overdue = 0;
    let retentionSum = 0;
    let retentionCount = 0;
    const perSkill = new Map<
      Skill,
      { seen: number; due: number; overdue: number; retSum: number; retCount: number; intervalSum: number; intervalCount: number }
    >();
    for (const sk of ALL_SKILLS)
      perSkill.set(sk, {
        seen: 0,
        due: 0,
        overdue: 0,
        retSum: 0,
        retCount: 0,
        intervalSum: 0,
        intervalCount: 0,
      });

    for (const row of progress) {
      if (row.fsrs_state === "new") continue;
      
      const sk = row.skill as Skill;
      const p = perSkill.get(sk);
      if (!p) continue;
      
      totalSeen++;
      p.seen++;
      
      let r = 0;
      if (row.fsrs_state === "review" && row.fsrs_stability) {
        const elapsedDays = Math.max(0, (now - row.fsrs_last_review) / 86400000);
        r = retrievability(row.fsrs_stability, elapsedDays);
        
        p.intervalSum += row.fsrs_stability;
        p.intervalCount++;
        
        if (row.fsrs_reps >= 2 && row.fsrs_due > now) active++;
        
        if (row.fsrs_due <= now) {
          dueToday++;
          p.due++;
          if (now - row.fsrs_due > 86400000) {
            overdue++;
            p.overdue++;
          }
        }
      } else {
        r = 0.1;
        if (row.fsrs_due <= now) {
          dueToday++;
          p.due++;
        }
      }
      
      retentionSum += r;
      retentionCount++;
      p.retSum += r;
      p.retCount++;
    }

    return {
      totalSeen,
      active,
      dueToday,
      overdue,
      retention: retentionCount > 0 ? retentionSum / retentionCount : 0,
      stability: totalSeen > 0 ? active / totalSeen : 0,
      perSkill,
    };
  }, [progress, now]);

  return (
    <div className="glass-strong rounded-3xl p-6">
      <div className="flex items-center justify-between">
        <div>
          <Badge tone="neon">Spaced repetition</Badge>
          <h2 className="mt-2 font-display text-2xl text-white tracking-tight text-glow-violet">
            Mastery stability
          </h2>
          <p className="mt-1 text-[13px] text-white/55">
            Long-term retention from SM-2 spaced repetition. Higher = items are
            sticking; due/overdue = ready for review.
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
        <StabilityStat
          label="Retention"
          value={`${Math.round(metrics.retention * 100)}%`}
          tone={
            metrics.retention >= 0.8
              ? "neon"
              : metrics.retention >= 0.5
                ? "cyan"
                : "coral"
          }
        />
        <StabilityStat
          label="Stable items"
          value={`${Math.round(metrics.stability * 100)}%`}
          sub={`${metrics.active}/${metrics.totalSeen}`}
        />
        <StabilityStat
          label="Due today"
          value={String(metrics.dueToday)}
          tone={metrics.dueToday > 0 ? "cyan" : undefined}
        />
        <StabilityStat
          label="Overdue"
          value={String(metrics.overdue)}
          tone={metrics.overdue > 0 ? "coral" : undefined}
        />
      </div>

      <div className="mt-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/45 mb-2">
          Per skill
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {ALL_SKILLS.map((sk) => {
            const p = metrics.perSkill.get(sk)!;
            const r = p.retCount > 0 ? p.retSum / p.retCount : 0;
            const avgInt = p.intervalCount > 0 ? p.intervalSum / p.intervalCount : 0;
            return (
              <div key={sk} className="glass rounded-2xl p-3">
                <div className="flex items-center justify-between">
                  <span className="font-display text-white capitalize">{sk}</span>
                  <span className="font-mono text-[11px] text-white/55">
                    {p.seen} seen
                  </span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-white/8 overflow-hidden">
                  <div
                    className="h-full"
                    style={{
                      width: `${Math.max(2, r * 100)}%`,
                      background:
                        r >= 0.8 ? "var(--neon)" : r >= 0.5 ? "var(--cyan)" : "var(--coral)",
                    }}
                  />
                </div>
                <div className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-wider text-white/45">
                  <span>{Math.round(r * 100)}% retain</span>
                  <span>
                    {p.due} due · {p.overdue} overdue
                  </span>
                  <span>~{avgInt.toFixed(1)}d</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StabilityStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neon" | "cyan" | "coral";
}) {
  const color =
    tone === "neon"
      ? "text-[color:var(--neon)]"
      : tone === "cyan"
        ? "text-[color:var(--cyan)]"
        : tone === "coral"
          ? "text-[color:var(--coral)]"
          : "text-white";
  return (
    <div className="glass rounded-2xl p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/45">
        {label}
      </div>
      <div className={cn("mt-1 font-display text-2xl tracking-tight", color)}>{value}</div>
      {sub && (
        <div className="mt-1 font-mono text-[10px] text-white/45">{sub}</div>
      )}
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

function ConfidenceMap({ progress }: { progress: ConceptProgressRow[] }) {
  const grouped = new Map<string, number[]>();
  for (const p of progress) {
    if (p.fsrs_state === "new") continue;
    const r = p.fsrs_stability ? retrievability(p.fsrs_stability, Math.max(0, (Date.now() - p.fsrs_last_review) / 86400000)) : 0.1;
    const arr = grouped.get(p.iso3) || [];
    arr.push(r);
    grouped.set(p.iso3, arr);
  }
  
  const cells = COUNTRIES.map((c) => {
    const rs = grouped.get(c.iso3) || [];
    const avg = rs.length > 0 ? rs.reduce((a, b) => a + b, 0) / rs.length : 0;
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
  progress: ConceptProgressRow[];
}) {
  const rows = progress
    .filter((p) => p.skill === skill && p.fsrs_state !== "new")
    .map((p) => {
      const r = p.fsrs_stability ? retrievability(p.fsrs_stability, Math.max(0, (Date.now() - p.fsrs_last_review) / 86400000)) : 0.1;
      return { iso3: p.iso3, r };
    });
    
  const sorted = rows.slice().sort((a, b) => a.r - b.r);
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
            <CountryRow key={r.iso3} iso3={r.iso3} pct={Math.round(r.r * 100)} />
          ))}
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-white/45 mb-1">
            Needs work
          </div>
          {weakest.length === 0 && <div className="text-white/45 text-sm">—</div>}
          {weakest.map((r) => (
            <CountryRow key={r.iso3} iso3={r.iso3} pct={Math.round(r.r * 100)} />
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

