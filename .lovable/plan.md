# Orbita — Phase 2 Plan (Persistence + Shared Engine + Quiz Modes)

Phase 1 delivered the foundation, Home, Globe3D, and Find Country. Phase 2 hardens the gameplay loop into a reusable engine, adds local persistence + adaptive mastery, and ships the three answer-based modes: Name Country, Flag Quiz, and Capital Quiz. Speed Round, Explorer, Progress, Challenges, and PWA remain deferred to Phase 3+.

## Goals

1. A shared `useSession` engine so every mode is ~150 lines of UI, not duplicated state.
2. Dexie (IndexedDB) layer with versioned migrations writing `country_progress` and `game_sessions`.
3. Adaptive mastery v1 — confidence per country per skill, decay over time, weak-country prioritization in question selection.
4. Name Country, Flag Quiz, Capital Quiz — production-quality, cinematic, keyboard-first.
5. Replace `/find` with the shared engine so all four modes share behavior, scoring, and persistence.
6. Quality + a11y pass across all modes.

## 1. Persistence layer (Dexie)

`src/lib/db/orbita-db.ts` — a versioned Dexie database.

Stores:
- `countryProgress` — per `iso3 × skill` (`location | name | flag | capital`): confidence 0–1, lastSeenAt, timesRight, timesWrong, streak.
- `gameSessions` — id, mode, score, accuracy, durationMs, totalQuestions, bestCombo, createdAt.
- `meta` — single row: schemaVersion, deviceTier, lastOpenedAt.

Versioning: every schema change bumps `db.version(n)` with an explicit `upgrade()`. v1 ships in this phase; the migration handler scaffold lives in `src/lib/db/migrations.ts` ready for v2.

Reads/writes are wrapped in `src/lib/db/repo.ts` — pure async functions. No component imports Dexie directly.

## 2. Adaptive mastery v1

`src/lib/mastery.ts`:
- `confidenceAfter(prev, correct, hintUsed)` — bayesian-ish update; correct nudges toward 1, wrong toward 0, decay applied based on time-since-last-seen.
- `decay(prev, daysSince)` — exponential, slow.
- `selectQuestions(skill, n, opts)` — weighted random over weak countries (low confidence + long unseen), with continent filter, difficulty bias, and no immediate repeats.

The Find store is refactored to call `selectQuestions("location", 20)` instead of `pickRandomCountries`. All four modes use the same selector with their own skill key.

## 3. Shared session engine

`src/features/engine/useSession.ts` — a Zustand factory `createSessionStore(skill, generator)` returns a hook with:
- `queue`, `index`, `score`, `combo`, `bestCombo`, `correct`, `wrong`, `answerState`, `hintUsed`, `startedAt`, `endedAt`
- `start()`, `submit(answer)`, `useHint()`, `next()`, `reveal()`, `current()`

`submit` calls a mode-supplied `judge(prompt, answer)` (returns `correct | wrong`). On `endedAt`, the engine writes the session + per-country progress to Dexie.

Shared UI: `SessionHud` (score/combo/right/wrong), `SessionEnd` (modal with stats + replay/home), `Prompt` (top glass card), `FeedbackBar` (bottom correct/wrong panel). All four modes import these.

`/find` is refactored onto this engine — proves the abstraction before three more modes use it.

## 4. Name Country mode (`/name`)

`ssr: false`. Uses `Globe3D` zoomed in on a mystery country, no label.

- **Easy**: 4-option multiple choice glass buttons under the globe.
- **Hard**: text input with fuzzy match (Levenshtein ≤ 2, alt-spellings from dataset).
- Keyboard: 1–4 picks options in Easy; Enter submits in Hard; Esc skips.
- Reveal animation: country glows, capital pulses, name + flag appear in a glass card.

## 5. Flag Quiz (`/flags`)

Two sub-modes via a top tab switcher (persisted to `meta`):
- **Flag → Country**: 4-option choice over country names.
- **Country → Flag**: 6-flag grid, pick the right flag.

Flags: `https://flagcdn.com/w320/{iso2}.png` (CDN, no bundle cost). `<img loading="lazy" decoding="async">` with a glass placeholder. Correct answer triggers a brief confetti burst (CSS particles, respects reduced-motion). No globe on this page — keeps the page light and focused.

## 6. Capital Quiz (`/capitals`)

Three sub-modes:
- **Country → Capital**: 4-option.
- **Capital → Country**: 4-option.
- **Globe Locator**: globe shown, click the country whose capital is named. Reuses the Find interaction.

Filters: continent (All / Africa / Americas / Asia / Europe / Oceania), persisted to `meta`.

## 7. Home + Navbar updates

- Mode cards on Home now link to live modes, not stubs — hover shows a small "confidence ring" from Dexie if any progress exists for that skill.
- Navbar shows a subtle dot on the active route + a session-in-progress indicator if a mode is mid-session (engine flag).

## 8. Quality pass

- Reduced-motion variant for every animation.
- Keyboard nav across mode tabs, options, and replays.
- Focus-visible rings using `--cyan`.
- Mobile QA at 375px: globe canvas height capped to `60dvh`, HUD reflows to a compact bottom sheet.
- 60fps target maintained on desktop; mid-tier phone target 30fps (globe DPR capped at 1.5).

## Out of scope this phase (Phase 3+)

- Speed Round (different timing/UX shape — gets its own phase).
- Explorer split-screen.
- Progress dashboard (data is being captured now; visualization lands with Explorer).
- Challenges + unlocks.
- PWA / offline manifest.
- Supabase Cloud auth & sync (Phase 4).

## Build order

1. Dexie schema + repo + Zod-validated meta row.
2. Mastery selector + confidence update functions (with unit-style runtime smoke test).
3. Shared session engine + `SessionHud` / `SessionEnd` / `Prompt` / `FeedbackBar` primitives.
4. Refactor `/find` onto the engine; verify behavior parity with Phase 1.
5. `/name` — Easy then Hard variants.
6. `/flags` — Flag→Country, Country→Flag, confetti.
7. `/capitals` — three sub-modes + continent filter UI.
8. Home cards: hover confidence ring from Dexie.
9. A11y + reduced-motion + mobile pass.

## Notes

- All new game routes use `ssr: false` (consistent with `/find`).
- Flag images come from `flagcdn.com` so no bundle bloat; we keep the dataset's `flagCode` (lowercase iso2).
- Dexie writes are fire-and-forget from the engine; failures only log — gameplay never blocks on storage.
- The engine is intentionally backend-agnostic so Phase 4 can swap the Dexie writer for a Supabase-syncing one with no UI changes.
