
# ORBITA Stabilization & Atlas Redesign

Correctness-first pass. No new modes, no backend swap (Supabase is already the only backend — see Section 7).

## 1. Globe3D — Restore hover, hide tooltip

`Globe3D.tsx` currently disables ALL hover feedback when `disableHoverFeedback` is set, which kills spatial cues.

- Split prop into two flags: keep `disableHoverFeedback` (default false, meaning everything on), add `disableHoverLabel?: boolean`.
- Hover GLOW (cyan cap tint), STROKE highlight, and altitude LIFT always stay on — they are spatial feedback, not answer leaks.
- Only the `polygonLabel` HTML tooltip is suppressed by `disableHoverLabel`.
- `disableHoverFeedback` becomes a stricter mode (used nowhere by default) that suppresses everything; replace its current usage in `FindPage` / `CapitalsPage` locator with `disableHoverLabel`.
- Continent tint at altBand ≤ 2 is fine; not text, not an answer leak.

## 2. Find mode — fix "session breaks after one answer"

Root cause: `useFindSession` is a module-level Zustand singleton. When Find mode unmounts and remounts (or when `next()` runs alongside `useAutoAdvance`), `hoverIso3` inside `Globe3D` keeps the previous country highlighted because the polygon under the cursor never re-fires hover, and `pov` recomputes from stale `answerState`. Also `next()` doesn't reset `hintUsed` to false on the LAST answer path correctly when `endedAt` is set, leaving session in inconsistent state on replay.

Fixes:
- In `useSession.next()`, when ending the session, reset full per-question state (`hintUsed: false`, `answerState: "idle"`) and DO NOT keep `combo` carrying.
- In `useSession.start()`, explicitly reset `endedAt: null` and clear `queue` to [] before async `selectQuestions` resolves so the UI shows fallback (loading), not stale data.
- In `Globe3D`, when `highlightIso3` / `revealIso3` / `pointOfView` props change to a new ISO3, clear `hoverIso3` state (effect on `[highlightIso3, revealIso3]`).
- In `FindPage`, key the `<Globe3D>` mount? No — keep singleton globe, but pass a `questionKey={current?.iso3}` prop that Globe3D uses in an effect to clear hover. Avoids globe re-init.
- `useAutoAdvance` must clear its pending timer on `current.iso3` change to prevent double-advance after rapid clicks.

## 3. Flags layout — vertically centered on desktop

Current wrapper: `min-h-[calc(100dvh-0px)] pt-20 ... flex-col items-center justify-center`. The top HUD row and prompt push the flag below the fold on 1080p.

- Restructure: fixed/sticky HUD bar at top (sub-mode + score + hint), then a flex-1 region with `flex items-center justify-center` containing prompt + flag + options stacked.
- Cap flag at `lg:w-[min(38vw,440px)]` so options stay in viewport.
- Ensure `min-h-dvh` parent uses `flex flex-col` so the centered region truly centers.

## 4. Capitals locator — click registration

Symptom: clicking a country in locator sub-mode sometimes doesn't register. Causes:
- `onCountryClick` fires for both polygon and hitbox points; when the hitbox cloud is active (altBand > 3), polygon clicks may be eaten by the invisible points.
- ISO3 mismatch when `m49-to-iso3.json` returns null for some features (silent skip in `geo.ts`).

Fixes:
- In `geo.ts` `loadCountryFeatures`, log a warn-once list of M49 codes that failed to map (dev only, no PII).
- Add a `__validateIsoMapping()` dev assertion run once in `Globe3D` mount that intersects feature ISO3s with `COUNTRY_BY_ISO3` and console.warns any orphans.
- Capitals locator: pass `quality="high"` and `disableHoverLabel` (not full disable) so user gets glow feedback on click target.

## 5. Speed mode — flag rendering & navigation

In `OptionsGrid`, when `skill === "flag"`, options render `FlagImage` + `o.name` (line 304). Hide the name for `flag` skill:
- If `showFlag` is true: render flag at larger size (`w-20 h-14`), no label text, and the `i+1` keycap stays.
- Keep name visible for `name` / `capital` skills.

Navigation:
- `PostGame` "Change mode" calls `reset()`. Verify `useSpeedRuntime.reset()` clears timer interval and queue (read `speedRuntimeStore.ts` and patch if interval not cleared).
- Navbar/back navigation from Active session: add a `useEffect` cleanup in `Active` that calls `reset()` on unmount when `status === "active"` so navigating to `/` or another mode mid-run doesn't leave a ghost timer.
- Add Space=skip via `useSkipHotkey` calling `answer("__skip__")` (or new `skip()` action) — wire into runtime store.

## 6. Universal keyboard

Audit and ensure `useAnswerHotkeys(1–4)` and `useSkipHotkey(Space)` are wired with the standard input/dialog guard in every mode:

| Mode | 1–4 | Space=skip | Auto-advance |
|---|---|---|---|
| Find | n/a (no options) | ✅ | ✅ |
| Name (Hard typing) | n/a | ✅ | ✅ (exactMatch) |
| Flags Flag→Country | ✅ | ✅ | ✅ |
| Flags Country→Flag | ✅ (1–6) | ✅ | ✅ |
| Flags Flag→Type | n/a | ✅ | ✅ |
| Capitals choice | ✅ | ✅ | ✅ |
| Capitals locator | n/a | ✅ | ✅ |
| Speed | ✅ already | ADD | n/a |
| Explorer | passive | n/a | n/a |

Confirm `useAnswerHotkeys` already ignores keystrokes while focus is in `<input>` / `<textarea>` / `[contenteditable]`; if not, add the guard.

## 7. Backend — Supabase only (no change needed, just verify)

The project ALREADY uses Supabase exclusively. "Lovable Cloud" in this project is just the user-facing label for the same Supabase backend — there is no hybrid layer to remove. Verification only:
- `recordSessionEnd` writes Dexie + enqueues to outbox; push worker calls `sync_push` RPC. ✅
- `country_progress`, `unlocks`, `daily_streak`, `sessions_log` all enqueued. ✅
- No edge-function fallback paths exist in `lib/sync/`. ✅

Action: add a one-line comment block at top of `lib/sync/queue.ts` documenting "Supabase is the sole backend; Dexie is the offline cache." No code change.

## 8. Auto-advance — remove all Next buttons

Audit `FeedbackBar` props across modes — all already pass `hideNext`. Verify `useAutoAdvance` delay (currently ~1100ms correct / ~1800ms wrong) and ensure no mode renders a residual Continue button. Confirm `SessionEnd` shows Replay only (not Next).

## 9. Explorer → "Atlas Mode" (three layers)

Restructure `ExplorerPage.tsx` into a tabbed atlas:

```text
┌─────────────────────────────────────────────────────┐
│  [Atlas] [Free explore | Country intel | Expeditions]│
├──────────────────────────────┬──────────────────────┤
│                              │                      │
│         Globe (flex-1)       │   Country Panel /    │
│                              │   Expedition stepper │
│                              │                      │
└──────────────────────────────┴──────────────────────┘
```

Three layers:

**(a) Free Exploration** — current globe with search + continent filter + Shuffle. Polygon click selects → Country Panel slides in.

**(b) Country Intelligence Panel** — already exists (`CountryPanel`). Augment:
- Add Borders flag-chips row at top (already present, keep).
- Add a "Locate on globe" pulse ring that re-frames camera.
- Group stats: Identity (flag, continent, subregion) / Demography (population, area, languages, currencies) / Mastery bars (existing).
- Quick-practice CTAs already present.

**(c) Guided Expeditions** — NEW component `Expeditions.tsx`:
- List 6 expeditions: each continent + "Microstates of Europe" + "Capitals of Africa".
- An expedition is an ordered list of ISO3s. Selecting one enters "tour mode":
  - Right panel shows step N of M with country card and Prev/Next buttons (and ←/→ hotkeys).
  - Globe focuses + pulses the active country.
  - On reaching the end, offer "Practice this expedition" → starts a Find session filtered to those ISO3s (extend `selectQuestions` to accept `isoList?: string[]`).
- Expeditions data lives in `src/features/explorer/expeditions.ts` (static).

Layer switch via top tab strip; URL search param `?layer=explore|country|expedition&iso=...&exp=...` so state survives reload.

## 10. Files

**New:**
- `src/features/explorer/expeditions.ts` — static expedition definitions
- `src/features/explorer/Expeditions.tsx` — expedition stepper UI

**Edited:**
- `src/features/globe/Globe3D.tsx` — add `disableHoverLabel`, `questionKey`, hover-clear effect, ISO mapping dev assertion
- `src/features/find/FindPage.tsx` — swap to `disableHoverLabel`, pass `questionKey`, drop legacy flag
- `src/features/capitals/CapitalsPage.tsx` — swap to `disableHoverLabel` in locator
- `src/features/flags/FlagsPage.tsx` — sticky HUD + centered flex layout
- `src/features/speed/SpeedPage.tsx` — flag-only options for `skill === "flag"`, add Space=skip, unmount cleanup
- `src/features/speed/speedRuntimeStore.ts` — add `skip()` action, ensure `reset()` clears interval
- `src/features/explorer/ExplorerPage.tsx` — restructure into layered tabs
- `src/features/engine/useSession.ts` — reset `endedAt`/queue in `start()`, reset `hintUsed` on terminal `next()`
- `src/features/engine/useAutoAdvance.ts` — clear timer on question key change
- `src/hooks/useAnswerHotkeys.ts` — verify input/dialog guard, add if missing
- `src/features/globe/geo.ts` — warn-once on unmapped M49 codes
- `src/lib/mastery.ts` — `selectQuestions` accepts optional `isoList` filter
- `src/lib/sync/queue.ts` — header comment only

**No backend / migration changes.** Existing Supabase schema already covers everything.

## 11. QA checklist

- Find: hover glows + lifts, no tooltip; clicking 5 countries in a row never breaks session; replay works.
- Name Hard: instant validate, Space skips, 1–4 don't fire while typing.
- Flags: flag vertically centered at 1440×900 and 1920×1080; sub-mode toggle persists.
- Capitals locator: every click registers; ISO mismatch warnings empty in dev console.
- Speed flag question: only flags shown as options, no country names; Space skips; navigating away mid-run kills timer.
- Explorer: three tabs functional, deep-link `?layer=expedition&exp=africa` resumes.
- All keyboards work in every mode per Section 6 table.
