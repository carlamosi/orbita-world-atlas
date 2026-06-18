# ORBITA Upgrade Roadmap — Execution Plan

This is a very large scope. To ship reliably, I'll execute in strict order, in **batches**, validating each batch before moving on. Each batch is a self-contained PR-sized unit.

Before I start, two decisions I need from you so I don't guess wrong on scope.

## Decisions needed

1. **Day/Night satellite textures (Phase D).** A true NASA-quality day/night Earth needs ~10–40 MB of texture assets (Blue Marble + Black Marble + specular + clouds + normal map). Options:
   - **(a) Premium real textures** — bundle compressed 4k/8k assets, ~15–25 MB added to the app. Best fidelity.
   - **(b) Procedural shader Earth** — no big assets, custom shader for day/night/twilight/atmosphere. Lighter, still cinematic, but not photoreal.
   - **(c) Skip for now**, keep current stylized globe and revisit later.
2. **Scope of this single execution.** Phases A–L is realistically 2–4 weeks of focused work and dozens of files. I propose to ship in **four shippable milestones**, each one fully working and reviewable, instead of one mega-change that's hard to validate:
   - **M1 — Gameplay friction (A + B + H + J)**: auto-advance, global hotkeys, Name-Country highlighting + framing, Speed audit, sync pill cleanup.
   - **M2 — Globe integrity & atlas (C + D + part of K/L)**: geometry audit + fixes, polygon-first interaction polish, cinematic zoom controls, atmosphere upgrade (option a/b/c above), perf pass.
   - **M3 — Explorer + FSRS engine + Personal Atlas (E + F)**: Explorer redesign with side panel + search, `calculateCountryMastery()` single source of truth, mastered-country glow on globe.
   - **M4 — Expedition mode + final polish (G + I + remainder of K/L)**: continent campaigns, completion sequences, Supabase-only audit, desktop layout pass.

   Confirm you want all four milestones executed back-to-back in this thread, or just M1 now.

## Milestone 1 — Gameplay friction (Phases A, B, H, J)

**A. Auto-advance**
- New `src/features/engine/useAutoAdvance.ts` hook: after `feedback` resolves, wait 1000 ms (configurable, 800 ms correct / 1200 ms wrong), then call `next()`. Cancelled if user manually advances or session ends.
- Wire into `useSession` consumers: Find, Name, Flags, Capitals, Speed, (Expedition once it exists).
- "Next" button hidden mid-session, kept only on `SessionEnd`.

**A2. Global keyboard answers**
- New `src/hooks/useAnswerHotkeys.ts`: listens on `window`, maps `1–4` (and `Digit1–Digit4`) to current answer slots. No-op if `document.activeElement` is `INPUT|TEXTAREA|[contenteditable]` or any Radix dialog is open (`[data-state="open"][role="dialog"]`).
- Single shared registration via `Prompt`/option components.

**B. Name Country highlighting + framing**
- `Globe3D` already supports `highlightIso3` / polygon styling. Add a new `targetIso3` prop that:
  - cyan stroke + pulse ring + altitude boost on target,
  - neighbors (computed once from polygon adjacency in `geo.ts`) rendered at reduced opacity,
  - rest of world dimmed via `polygonCapColor` alpha 0.04.
- On question start, call `focusCountry(targetIso3, { padding: 'region' })` — new option that picks an altitude framing target + its neighbors instead of the country alone.

**H. Speed Round audit**
- Read `SpeedPage.tsx` + `speedRuntimeStore.ts` end-to-end. Verify Sprint/Marathon/Sudden Death scoring, combo, accuracy, PR persistence (Dexie + sync queue). Fix what's broken; do not rewrite working logic.

**J. Sync pill cleanup**
- `SyncPill.tsx`: show only on `syncing | offline | error`. On transition to `idle` after a `syncing`, show "Synced ✓" then fade out after 3 s (Framer Motion exit). Otherwise unmounted.

**Acceptance**: play one round of each mode using only keys 1–4, no manual clicks; Name Country shows obvious cyan target with neighbors visible; sync pill stays hidden during normal use.

## Milestone 2 — Globe integrity & atlas (C, D, parts of K/L)

**C. Geometry integrity report**
- Script `scripts/audit-geometry.ts`: cross-references `src/data/countries.json` ISO3 list against features available from `world-50m` + `m49-to-iso3`. Prints missing/extra/multipolygon-broken entries. Fixes:
  - extend `m49-to-iso3.json` for gaps (France `FRA`/250, Norway, etc.),
  - synthesize missing micro-states from a Natural Earth `ne_10m_admin_0_countries` subset for the 195 list,
  - validate the 12 named countries explicitly in tests.
- Output the report into `.lovable/geometry-report.md`.

**D. Premium atlas (depends on Decision 1)**
- Polygon-first model already shipped in last turn — extend with:
  - glass zoom controls (+ / − / reset) in bottom-right with `backdrop-blur` + ring.
  - pinch + wheel + trackpad zoom via three-globe `controls`.
- Day/Night per chosen option (a/b/c).
- Atmosphere: tweak `atmosphereColor`, add subtle radial gradient overlay.

**K/L partial**: memoize polygon accessors, throttle camera-altitude reader to rAF, cap DPR 1.5 on mobile, lazy-load 50m.

## Milestone 3 — Explorer + FSRS + Personal Atlas (E, F)

**F. `calculateCountryMastery()`**
- New `src/lib/mastery/calculate.ts` exporting:
  ```ts
  type Mastery = { score: 0..1; level: 'unseen'|'learning'|'familiar'|'mastered'|'overlearned'; due: Date|null; stability: number; difficulty: number; retrievability: number; lapses: number }
  function calculateCountryMastery(iso3, fsrsState, now=Date.now()): Mastery
  ```
- Derived purely from FSRS card state in `country_progress.skills` (find/name/flag/capital). No randomness. Memoized per (iso3, updated_at).
- Refactor Progress/Explorer/heatmap consumers to use it.

**E. Explorer redesign**
- Full-viewport `Globe3D` with right-side `Sheet`/panel (Radix), 420 px wide on desktop, drawer on mobile.
- Country detail: flag, capital, region, subregion, population, area, languages, currencies, borders (clickable to jump), mastery breakdown bars per skill, FSRS due date, "Review now" button.
- Top-left command palette (`cmdk`): instant fuzzy search → camera fly + select.

**Personal Atlas**
- Globe consumes `masteryMap: Record<iso3, Mastery>` and emits glow via `polygonCapColor` alpha = `0.05 + 0.35 * score` with hue shifted toward cyan/green for mastered, amber for due. Recently mastered (< 24 h) gets a one-shot ring pulse.
- Synced via existing `country_progress` table; nothing new server-side.

## Milestone 4 — Expedition + cleanup (G, I, K, L)

**G. Expedition mode**
- New route `src/routes/_authenticated/expedition.tsx` + `src/features/expedition/`.
- Continents as campaigns; per-country nodes unlocked by mastery thresholds; mixes Find/Name/Flag/Capital prompts; integrates FSRS due reviews into each session.
- Completion: `Globe3D.flyoverContinent(continent)` + illumination + summary modal.

**I. Supabase-only audit**
- grep for `lovable` integrations used at runtime (other than `lovable.auth.signInWithOAuth` which is required for Google). Remove anything else.

**K/L final**: 1440p+ layout pass on every page, typography scale review, FPS profiling with `browser--performance_profile`.

## Technical notes (for reference)

- Hotkeys & auto-advance live in `src/features/engine/` so all game modes inherit them by switching to a `<GameShell>` wrapper around `Prompt`/`FeedbackBar`.
- Polygon adjacency precomputed once from TopoJSON arcs and cached in `geo.ts`.
- Mastery calc is pure → safe to memoize with `useMemo` keyed on `updated_at`.
- All new tables: none required. Existing `country_progress`, `sessions_log`, `unlocks` cover everything.
- No new secrets. No schema migrations expected unless Expedition needs a `expedition_progress` table (will confirm in M4).

---

**Please answer:**
1. Day/Night textures: **(a) bundled real textures**, **(b) procedural shader**, or **(c) skip**?
2. Execute **all four milestones now**, or **stop after M1** for review?
