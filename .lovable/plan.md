# Globe3D Premium Atlas Upgrade — v2 (polygon-first)

Rewrite `src/features/globe/Globe3D.tsx` as a polygon-first interactive atlas. Public props (`countries`, `highlightIso3`, `revealIso3`, `onCountryClick`, `pointOfView`, `size`, `quality`) stay unchanged; new optional props are additive.

## 1. Polygon-first rendering

- Load admin-0 country borders from a static TopoJSON bundled under `src/assets/geo/`:
  - `world-110m.json` (≈100 KB) — default
  - `world-50m.json` (≈600 KB) — lazy-loaded the first time altitude drops below ~0.9
  - Convert with `topojson-client` (new dep, pure JS, Worker-safe).
- Build a memoised `iso3 → Feature` map once per dataset; resolution swap is transparent.
- Feed `polygonsData` with:
  - `polygonCapColor` — transparent base; cyan glow on hover; `#00FFB2` @ 22% for highlight; `#FF6B6B` @ 28% for reveal; soft amber for SRS due-review hint.
  - `polygonSideColor` — `rgba(108,99,255,0.06)` for subtle depth.
  - `polygonStrokeColor` — adaptive opacity (see §3), color-shifted on hover/highlight/reveal.
  - `polygonAltitude` — 0.006 base, 0.02 hover, 0.035 highlight/reveal, animated via `polygonsTransitionDuration`.
- Polygons are the primary click + hover surface (`onPolygonClick`, `onPolygonHover`).

## 2. Adaptive picking (polygons primary, points as a11y assist)

- Track camera `altitude` via a throttled rAF reader on OrbitControls `change`.
- A small invisible hitbox point layer is rendered **only** when `altitude > 1.4` and **only** for countries that need help:
  - Score = `f(polygonArea, missRate)`; lowest-scoring N (≈40) get an enlarged hit point sized inversely to score.
  - Polygon area computed once from GeoJSON (spherical excess via `d3-geo`'s `geoArea`, or a tiny inline shoelace on equirectangular approximation to avoid extra deps — prefer the latter; no new dep).
  - `missRate` sourced from an optional new prop `missRates?: Record<string, number>` (0–1). If absent, falls back to area only.
- Close zoom (`altitude < 0.6`): hitbox layer fully disabled — polygons only, full precision.
- Encapsulated as `useAdaptivePicking(altitude, features, missRates)`.

## 3. Zoom-progressive border emphasis

- Stroke opacity ramps with altitude: `0.18` at alt ≥ 2.4 → `0.55` at alt ≤ 0.4 (linear clamp).
- Stroke width via `polygonStrokeColor` only (react-globe.gl draws strokes as line segments — width is fixed); compensate by raising opacity and adding a faint cap tint on neighbouring continents at close zoom (continent grouped by a static `iso3 → continent` map derived from the existing `Country` data).
- Continent separation: at alt < 1.0 each continent gets a barely-perceptible cap tint (≤5% alpha) to make landmass groups readable without breaking the dark aesthetic.

## 4. Cinematic camera + country framing

- OrbitControls config:
  - `enableZoom = true`, `enableDamping = true`, `dampingFactor = 0.12`
  - `zoomSpeed = 0.7`, `rotateSpeed = 0.45` (drops to 0.15 while pointer is pressed on a polygon — precision mode)
  - `minDistance` / `maxDistance` clamped so altitude spans ~0.22 → ~3.2
  - `touches = { ONE: ROTATE, TWO: DOLLY_PAN }`
- **Country-focus transition** (`focusCountry(iso3)` internal helper, used by reveal/highlight/external POV):
  - Compute polygon bounding box on the sphere; derive centroid + angular span.
  - Target altitude = `clamp(span * k, 0.35, 1.6)` so the country fills ~55% of the viewport regardless of size.
  - Animate via `pointOfView({ lat, lng, altitude }, 1200)` with a custom easing; auto-rotate suspended until 6 s idle.
- **Orientation continuity**: when only altitude changes (zoom buttons / +/− keys), current lat/lng are read first and re-passed so the view doesn't recenter.
- Explorer integration: when an external selection arrives via `pointOfView` OR new `focusIso3?: string` prop, the helper frames the country instead of the current "fly to coordinate" behaviour.

## 5. Hover, selection, reveal feedback

- Local `hoverIso3` state, updated only by `onPolygonHover` (memoised callback — no parent rerenders).
- Hover: soft cyan cap glow + raised altitude + glass tooltip (existing styling).
- Highlight (user guess in progress): `#00FFB2` cap + stroke + ring pulse.
- Reveal (answer): `#FF6B6B` cap + stroke + stronger ring pulse + focus transition.
- New optional prop `dueReviewIso3?: readonly string[]` — when provided, those countries get a slow amber pulse (low alpha, 2 s period) so review modes (SRS) can opt in without changing the default experience.

## 6. Zoom controls + accessibility

- Overlay (top-right, glassmorphism): `+`, `−`, "Reset view" — 44 px hit targets, `aria-label`s, focus rings using existing tokens.
- Keyboard (wrapper has `tabIndex={0}` and `role="application"` + `aria-label="Interactive globe"`):
  - `+` / `=` zoom in, `-` zoom out, `0` reset
  - Arrow keys rotate (5° steps), `Shift+Arrow` larger steps
  - `Enter` / `Space` select hovered country
- Touch: native OrbitControls one-finger rotate + two-finger pinch/pan; tap = click. `touch-action: none` on the wrapper to prevent page scroll hijack.

## 7. Performance + quality tiers

- `high` (desktop): 50m borders after first close zoom, polygon transitions 250 ms, atmosphere 0.22, auto-rotate 0.35.
- `medium`: 110m only, transitions 180 ms, atmosphere 0.2, auto-rotate 0.18, continent tints disabled.
- `static` / `prefers-reduced-motion`: 110m, no transitions, no auto-rotate, no rings, no pulses.
- **Mobile detection** (`matchMedia('(pointer: coarse)')` + viewport width < 768): force quality to `medium` minimum even if caller requests `high`; disable bump map; cap DPR via `Globe`'s `rendererConfig={{ pixelRatio: Math.min(devicePixelRatio, 1.5) }}`.
- **Render hygiene**:
  - `polygonsData`, accessors, `pointsData`, `ringsData` all built inside `useMemo` keyed on stable inputs (`features`, `hoverIso3`, `highlightIso3`, `revealIso3`, `dueReviewIso3`, `altitudeBand`).
  - `altitudeBand` is a quantised altitude (e.g. 5 buckets) so continuous camera movement doesn't invalidate memos every frame — only band crossings do.
  - All event handlers wrapped in `useCallback`; child `Globe` props are referentially stable.
  - No state writes during OrbitControls `change` events — the rAF reader writes to a ref and only `setState` when the band changes.

## 8. Files & dependencies

- New deps: `topojson-client` (pure JS, ~10 KB).
- New static assets: `src/assets/geo/world-110m.json` (bundled), `src/assets/geo/world-50m.json` (dynamic `import()` for lazy load).
- New optional props on `Globe3D`: `focusIso3?`, `dueReviewIso3?`, `missRates?` — all additive, no breaking change.
- Single file rewritten: `src/features/globe/Globe3D.tsx`. Call sites unchanged.
- Also fix the unrelated runtime error: re-export the missing `src/lib/auth/debug.ts` symbol (or remove the dangling import from `__root.tsx`) so the preview boots cleanly.

```text
Globe3D
├── geo loader  (110m bundled, 50m lazy, memoised)
├── OrbitControls  (damped, zoom on, precision-on-press, mobile touches)
├── polygonsData   ← borders + hover/highlight/reveal/due-review (PRIMARY)
├── pointsData     ← invisible adaptive hitboxes (a11y assist, far zoom only)
├── ringsData      ← reveal/highlight pulse (memoised)
├── focusCountry() ← bbox-driven cinematic framing
└── ZoomControls overlay + keyboard layer
```
