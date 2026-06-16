# ORBITA — Phase 3 (shipped)

## Architectural tightening applied per feedback

1. **Decoupled real-time runtime from session engine**
   - `src/features/engine/useSession.ts` — turn-based engine (Find / Name / Flags / Capitals / Weekly Challenge).
   - `src/features/speed/speedRuntimeStore.ts` — isolated Speed Round runtime: 4Hz tick, combo, lives, mid-run queue top-up. Subscribes are scoped (TimerRing only re-renders on tick) so HUD/options don't churn.
   - Both share the **pure** question engine in `src/lib/mastery.ts` (`selectQuestions`, `selectMixedQuestions`) and persist through the same repo.

2. **Structured per-skill confidence**
   - Dexie v2 migration aggregates legacy `iso3::skill` rows into one row per country:
     ```ts
     interface CountryProgressRow {
       iso3: string;
       skills: { name?: SkillStat; flag?: SkillStat; capital?: SkillStat; location?: SkillStat };
       lastSeenAt: number;
     }
     ```
   - Adding a new skill = new key in `skills`, no migration.

3. **Unlocks: pure evaluator, repo-owned, idempotent**
   - `src/lib/unlocks.ts` exposes a pure `evaluateUnlocks(state)` returning delta rows.
   - Invoked only from `repo.recordSessionEnd` (and `reEvaluateUnlocks`). UI never recomputes.
   - 11 achievements defined: milestones, region masters, streaks, speed, perfectionist.

4. **PWA: manifest-only, Dexie excluded by design**
   - `public/manifest.webmanifest` + apple-touch-icon + theme-color.
   - **No service worker** — per Lovable PWA skill, app-shell SW would risk shadowing IndexedDB as the source-of-truth offline state.
   - Dexie continues to provide true offline gameplay; flag CDN is preconnected, not cached.

5. **Globe degradation**
   - `Globe3D` gains a `quality: 'high' | 'medium' | 'static'` prop.
   - Medium: 0.18 autoRotate, half point density, bump map kept.
   - Static: no autoRotate, no bump map, third-density points.
   - Reduced-motion media query forces `static` regardless of prop.
   - Explorer uses `medium`; single-focus modes use `high`.

## Files

- New: `src/features/speed/{SpeedPage,speedRuntimeStore}.tsx/ts`
- New: `src/features/explorer/ExplorerPage.tsx`
- New: `src/features/progress/ProgressPage.tsx`
- New: `src/features/challenges/ChallengesPage.tsx`
- New: `src/lib/{unlocks,streak,challenges}.ts`
- New: `public/manifest.webmanifest`
- Refactored: `src/lib/db/orbita-db.ts` (v2 schema + upgrade), `src/lib/db/repo.ts` (new write composer, unlock evaluator hook, live-query helpers), `src/lib/mastery.ts` (mixed-skill, injectable RNG)
- Refactored: `src/features/engine/useSession.ts` (uses new `updateSkillProgress` + `recordSessionEnd`)
- Refactored: `src/features/globe/Globe3D.tsx` (quality prop)
- Wired: `src/routes/{speed,explorer,progress,challenges}.tsx` → real pages
- Updated: `src/routes/__root.tsx` (manifest link, flagcdn preconnect)

## Phase 4 hand-off (Supabase)

The architecture is now sync-friendly:
- Single write surface (`repo.ts`) — straightforward to mirror to Supabase.
- Idempotent unlock evaluator — runs identically on client or server.
- Per-country progress rows map 1:1 to a future `country_progress` Supabase table.
- Deterministic challenge sets (mulberry32 + date/week seed) give comparable scores without server state.
