# Orbita — Phase 1 Plan (Foundation + Globe Vertical Slice)

A cinematic geography mastery platform. This first plan delivers a production-quality foundation and one playable vertical slice (Find Country) so we can validate the core feel before expanding. Backend (Supabase), PWA, and remaining game modes are deferred to follow-up plans.

## Goals for this phase

1. A locked-in design system (tokens, glass, motion, type) the rest of the app will inherit.
2. App shell with cinematic route transitions and a glassmorphism navbar.
3. The Home page — the unforgettable scroll experience.
4. A real 3D globe (`react-globe.gl` + Three.js) with night Earth, atmosphere, and weighted orbital camera.
5. The **Find Country** game loop wired to local Zustand state, proving the gameplay feel.
6. Deterministic `countries.json` build pipeline producing all 195 countries.

## Architecture decisions

- **Framework**: keep TanStack Start as the shell, but treat Orbita as a client-first SPA. Globe and game routes use `ssr: false` so Three.js never touches the server. Home stays SSR for SEO.
- **Routing**: file-based under `src/routes/` (Home, Explorer, Find, Name, Flags, Capitals, Speed, Progress, Challenges). All non-Home routes are stubs in Phase 1 except `/find`.
- **State**: Zustand for session/game state, TanStack Query (already in template) reserved for later cloud sync. No backend calls this phase.
- **Persistence**: Dexie (IndexedDB) wrapper with versioned migrations for `country_progress` and `game_sessions`. Cloud sync deferred.
- **Styling**: Tailwind v4 in `src/styles.css` with `@theme` tokens for the Orbita palette, Space Grotesk / Inter / JetBrains Mono via `<link>` in `__root.tsx`. Glass, glow, and grain implemented as `@utility` classes.
- **Motion**: Framer Motion with a shared spring system (`tokens/motion.ts`). No linear easings.
- **Performance**: route-level code splitting via `.lazy.tsx` for `/find` and Globe3D. Manual chunks (three, globe, motion) configured in `vite.config.ts`. Quality auto-scales based on a device-tier probe (DPR, hardware concurrency, memory).

## Data pipeline

A one-time Node script `scripts/build-countries.ts` merges:
- REST Countries (ISO_A3, name, capital, flag code, population, currencies, languages, borders)
- Natural Earth admin-0 (centroid + capital coords, continent)

Output: a frozen, versioned `src/data/countries.json` (all 195) plus a separate `src/data/geometry.json` for border polygons so the lightweight metadata loads first. Schema validated with Zod at build time; types generated to `src/types/country.ts`.

## Design system

Tokens in `src/styles.css`:

```text
--space     #050508    --violet  #6C63FF    --cyan   #00D4FF
--coral     #FF6B6B    --neon    #00FFB2
--glass     rgba(255,255,255,0.05)
--border    rgba(255,255,255,0.08)
--muted     #8B8FA8
```

Plus gradient + shadow tokens for atmospheric depth, ambient violet glow, cyan edge lighting, and a global grain overlay. Reusable primitives: `Button` (primary/secondary), `Card` (glass), `Badge`, `PageWrapper` (Framer route transition), `Starfield`, `Grain`, `Vignette`.

## Home page

380vh cinematic scroll with a sticky viewport:
- **Hero**: orbital globe scales/rotates with scroll, headline "Master every corner of the world." with atmospheric glow.
- **Stats**: 2×2 metrics grid with count-up on reveal.
- **Modes**: 3×2 glass cards with hover glow + orbital lift.
- **Final CTA**: "Your world. Fully explored." with glowing button and atmospheric outro.

Scroll driven by Framer's `useScroll` + spring-smoothed progress; globe and starfield parallax off the same progress value for spatial continuity.

## Globe3D engine

`src/features/globe/Globe3D.tsx` — `react-globe.gl` wrapper:
- Night Earth texture + bump + atmosphere shader
- Weighted orbital camera (spring-interpolated POV, no jumps)
- Heatmap layer hook (unused this phase, ready for confidence colouring)
- Capital pulse hook (unused this phase)
- WebGL detection → 2D fallback that still supports gameplay clicks
- Strict cleanup on unmount (renderer, scene, controls)
- Device-tier-aware quality (polygon density, atmosphere thickness, DPR cap)

## Find Country (vertical slice)

Route `/find` (lazy, `ssr: false`):
- 20-question session managed by `useFindSessionStore` (Zustand)
- Prompt shows a target country; player clicks it on the globe
- Correct: country glows, atmosphere pulse, combo increments
- Wrong: target reveals with a guiding arc, confidence decays, never punishing tone
- Hint button (one per question) dims non-candidate regions
- SessionEnd panel: score, accuracy, time, replay / back-to-home
- Progress writes to Dexie so the next session sees mastery state

## Out of scope this phase (next plans)

- Supabase auth, profiles, country_progress / game_sessions / challenge_progress tables, RLS
- Cloud sync + analytics events
- Name / Flags / Capitals / Speed / Explorer / Progress / Challenges pages (stub routes with "Coming soon" cinematic placeholders)
- PWA / offline support
- Adaptive spaced-repetition engine (data model is ready; algorithm lands with Progress)

## Build order (this plan)

1. Install deps: `framer-motion`, `zustand`, `three`, `react-globe.gl`, `dexie`, `zod`, `@fontsource-variable/inter`, `@fontsource/space-grotesk`, `@fontsource-variable/jetbrains-mono`
2. Tailwind v4 tokens + global atmosphere (grain, vignette, starfield) in `src/styles.css`
3. Motion tokens + shared springs (`src/lib/motion.ts`)
4. UI primitives (Button, Card, Badge, PageWrapper)
5. Root layout: navbar, background layers, route transition wrapper
6. Stub routes for all non-Home, non-Find paths (cinematic placeholders)
7. Data pipeline script + generated `countries.json` + Zod types
8. Dexie wrapper with versioned migrations
9. Globe3D engine with fallback + device-tier scaler
10. Home cinematic scroll experience
11. Find Country game loop + SessionEnd
12. Quality pass: spacing, motion timing, hover responsiveness, mobile FPS check

## Technical notes

- TanStack Start file routes; `/find` and Globe3D extracted to `.lazy.tsx` to keep the home bundle small.
- `vite.config.ts` gets `manualChunks` for `three`, `react-globe.gl`, `framer-motion`, `zustand`.
- No `tailwind.config.js` (v4 is CSS-first); tokens live in `@theme` inside `src/styles.css`.
- Fonts loaded via `<link>` in `__root.tsx` `head()`, families referenced from `@theme`.
- `prefers-reduced-motion` honored everywhere (springs collapse to instant, parallax disables).
- After this phase ships, the next plan will enable Lovable Cloud, add the schema with RLS, wire auth, and start syncing the existing Dexie stores.
