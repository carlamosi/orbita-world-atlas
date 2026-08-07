import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import { TOUCH, MeshPhongMaterial, Color } from "three";
import { Minus, Plus, RotateCcw } from "lucide-react";

import type { Country } from "@/types/country";
import {
  ensureFeatures,
  loadCountryFeatures,
  type CountryFeature,
} from "./geo";

export type GlobeQuality = "high" | "medium" | "static";

interface Globe3DProps {
  countries: readonly Country[];
  highlightIso3?: string | null;
  revealIso3?: string | null;
  /** External focus request (Explorer search, deep-link, etc.). */
  focusIso3?: string | null;
  /** Active continent selection ("Africa", "Americas", "Asia", "Europe", "Oceania") — highlights region & mutes non-active landmasses. */
  activeContinent?: string | null;
  /** Optional list of due-for-review countries — receives a slow amber pulse. */
  dueReviewIso3?: readonly string[];
  /** Optional miss-rate per ISO3 (0–1) — boosts adaptive hitbox size. */
  missRates?: Readonly<Record<string, number>>;
  onCountryClick?: (iso3: string) => void;
  pointOfView?: { lat: number; lng: number; altitude?: number };
  size?: number;
  quality?: GlobeQuality;
  /** Hide only the country-name tooltip (Find/Capitals). Glow + altitude lift remain for spatial feedback. */
  disableHoverLabel?: boolean;
  /** Strict mode: suppress ALL hover feedback (glow, lift, tooltip). */
  disableHoverFeedback?: boolean;
  /** Changes whenever the active question changes — clears stale hover state on transition. */
  questionKey?: string | null;
}

// ---------------------------------------------------------------------------
// Constants — tuned for the ORBITA dark-space aesthetic.

const COLOR_HIGHLIGHT = "0, 255, 178"; // neon
const COLOR_REVEAL = "255, 107, 107"; // coral
const COLOR_DUE = "255, 184, 77"; // amber
const COLOR_HOVER = "0, 212, 255"; // cyan
const COLOR_BASE = "108, 99, 255"; // violet


const CONTINENT_TINT: Record<string, string> = {
  Africa: "108, 99, 255", // default violet
  Americas: "108, 99, 255",
  Asia: "0, 212, 255",
  Europe: "0, 255, 178",
  Oceania: "108, 99, 255", // default violet
  Antarctic: "203, 213, 225",
};

const CONTINENT_CENTERS: Record<string, { lat: number; lng: number }> = {
  Africa: { lat: 8, lng: 20 },
  Americas: { lat: 15, lng: -85 },
  Asia: { lat: 35, lng: 95 },
  Europe: { lat: 50, lng: 15 },
  Oceania: { lat: -22, lng: 135 },
  Antarctic: { lat: -80, lng: 0 },
};

function angularDistanceDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const φ1 = lat1 * (Math.PI / 180);
  const φ2 = lat2 * (Math.PI / 180);
  const Δλ = (lng2 - lng1) * (Math.PI / 180);
  const c = Math.sin(φ1) * Math.sin(φ2) + Math.cos(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return Math.acos(Math.min(1, Math.max(-1, c))) * (180 / Math.PI);
}

// Altitude bands → quantised so memos don't churn during every frame.
function altitudeBand(alt: number): number {
  if (alt < 0.4) return 0;
  if (alt < 0.7) return 1;
  if (alt < 1.1) return 2;
  if (alt < 1.7) return 3;
  if (alt < 2.4) return 4;
  return 5;
}

function strokeOpacityFor(alt: number): number {
  // 0.18 at alt 2.4+ → 0.55 at alt 0.4
  const t = Math.max(0, Math.min(1, (2.4 - alt) / 2.0));
  return 0.18 + t * (0.55 - 0.18);
}

// ---------------------------------------------------------------------------

export default function Globe3D({
  countries,
  highlightIso3,
  revealIso3,
  focusIso3,
  activeContinent = null,
  dueReviewIso3,
  missRates,
  onCountryClick,
  pointOfView,
  size,
  quality = "high",
  disableHoverLabel = false,
  disableHoverFeedback = false,
  questionKey = null,
}: Globe3DProps) {
  const ref = useRef<GlobeMethods | undefined>(undefined);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [dim, setDim] = useState({ w: 600, h: 600 });
  const [hoverIso3, setHoverIso3] = useState<string | null>(null);
  const [altBand, setAltBand] = useState(4);
  const [features, setFeatures] = useState<CountryFeature[] | null>(() =>
    loadCountryFeatures("110m"),
  );

  // ---- Environment / quality resolution --------------------------------
  const effectiveQuality: GlobeQuality = useMemo(() => {
    if (typeof window === "undefined") return quality;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return "static";
    const isMobile =
      window.matchMedia?.("(pointer: coarse)").matches || window.innerWidth < 768;
    if (isMobile && quality === "high") return "medium";
    return quality;
  }, [quality]);

  // ---- Resize observer -------------------------------------------------
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setDim({ w: Math.max(320, r.width), h: Math.max(320, r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- Premium Orbita globe material -----------------------------------
  const globeMaterial = useMemo(() => {
    const mat = new MeshPhongMaterial({
      color: new Color("#0a0d1f"),
      emissive: new Color("#0b1230"),
      emissiveIntensity: 0.35,
      specular: new Color("#6C63FF"),
      shininess: 14,
      transparent: false,
    });
    return mat;
  }, []);
  useEffect(() => () => globeMaterial.dispose(), [globeMaterial]);

  // ---- Continent map (iso3 → continent) --------------------------------
  const continentByIso3 = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of countries) m.set(c.iso3, c.continent);
    return m;
  }, [countries]);

  // ---- Country lookup for focus / rings --------------------------------
  const countryByIso3 = useMemo(() => {
    const m = new Map<string, Country>();
    for (const c of countries) m.set(c.iso3, c);
    return m;
  }, [countries]);

  const featureByIso3 = useMemo(() => {
    const m = new Map<string, CountryFeature>();
    if (features) for (const f of features) m.set(f.properties.iso3, f);
    return m;
  }, [features]);

  // ---- Microstate Marker Cloud -----------------------------------------
  // CRITICAL ROOT CAUSE: The 110m TopoJSON used for polygon rendering omits or
  // severely degrades many genuine microstates (Vatican ~0.44 km², Monaco ~2 km²
  // may have 0-1 polygon vertices at this resolution). Sourcing markers from
  // the `countries` prop (which uses real-world km² area from the dataset) is
  // the only reliable approach — it guarantees Vatican, Monaco, etc. always get
  // a marker regardless of TopoJSON resolution.
  //
  // Threshold rationale — countries where normal polygon raycasting is unreliable:
  //   < 700 km²:  Vatican (0.44), Monaco (2), Nauru (21), Tuvalu (26),
  //               San Marino (61), Andorra (468), Liechtenstein (160),
  //               Maldives (298), Malta (316), Bahrain (765)
  //   < 1500 km²: Singapore (728), Comoros (2235 — borderline),
  //               Cabo Verde (4033), São Tomé (964), Kiribati (811)
  //   Normal countries (excluded): Luxembourg (2586), Samoa (2842) and above
  //
  // We use 1000 km² as the primary threshold plus a secondary span check
  // (< 1.5° from the geo data) for tiny island chains that are dispersed.
  // This is a principled criterion, not a hardcoded list of countries.

  const MICRO_AREA_KM2 = 1000; // Real-world km² from Country dataset

  const hitboxPoints = useMemo(() => {
    type HitboxPoint = { iso3: string; name: string; lat: number; lng: number; radius: number; micro: boolean };
    const result: HitboxPoint[] = [];

    for (const c of countries) {
      // Primary criterion: real-world area from the canonical Country dataset.
      // This is immune to TopoJSON resolution degradation.
      const isMicro = c.area > 0 && c.area <= MICRO_AREA_KM2;

      // Secondary criterion: tiny dispersed archipelagos may have larger total
      // area but still be difficult to click (e.g. Marshall Islands at ~181 km²
      // but spread across a huge ocean area). These are caught by area already.
      // We only skip if clearly a normal country.
      if (!isMicro) continue;

      if (activeContinent && activeContinent !== "All") {
        if (c.continent !== activeContinent) continue;
      }

      // Hitbox radius in globe units — generous for reliable raycasting.
      // These are the invisible interaction spheres, not the visual dot size.
      // At far zoom (band 4–5): 3.0 globe-units ≈ 3° arc = easy to hit.
      // At close zoom (band 0): 1.8 globe-units — still larger than the country.
      const radius = altBand >= 4 ? 3.0 : altBand >= 3 ? 2.6 : altBand >= 2 ? 2.2 : altBand >= 1 ? 1.9 : 1.8;

      result.push({
        iso3: c.iso3,
        name: c.name,
        lat: c.coordinates[0],  // Country dataset gives [lat, lng]
        lng: c.coordinates[1],
        radius,
        micro: true,
      });
    }
    return result;
  }, [countries, altBand, activeContinent]);

  // ---- Polygon styling accessors (memoised) ----------------------------
  const strokeOpacity = strokeOpacityFor(
    altBand === 0 ? 0.3 : altBand === 1 ? 0.55 : altBand === 2 ? 0.9 : altBand === 3 ? 1.4 : altBand === 4 ? 2.0 : 2.8,
  );

  const dueSet = useMemo(
    () => new Set(dueReviewIso3 ?? []),
    [dueReviewIso3],
  );

  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (effectiveQuality === "static") return;
    if (dueSet.size === 0) return;
    const id = window.setInterval(() => setPulse((p) => (p + 1) % 2), 1100);
    return () => window.clearInterval(id);
  }, [dueSet, effectiveQuality]);

  const effHoverIso3 = disableHoverFeedback ? null : hoverIso3;

  // Microstate marker styling — subtle glowing pinpoints for tiny territories.
  // Visual radius is kept small (premium, clean look) while the interaction
  // sphere (p.radius) is generously sized for reliable clicking.
  const pointColorFn = useCallback(
    (d: object) => {
      const p = d as { iso3: string; micro: boolean };
      if (!p.micro) return "rgba(0,0,0,0)";
      if (p.iso3 === revealIso3) return `rgba(${COLOR_REVEAL}, 1.0)`;
      if (p.iso3 === highlightIso3) return `rgba(${COLOR_HIGHLIGHT}, 1.0)`;
      if (p.iso3 === effHoverIso3) return `rgba(${COLOR_HOVER}, 1.0)`;
      // Default: gentle neon pinpoint — visible but not distracting
      return `rgba(${COLOR_HIGHLIGHT}, 0.6)`;
    },
    [revealIso3, highlightIso3, effHoverIso3],
  );

  // Point label: show country name as a styled tooltip.
  // In Find mode (disableHoverLabel) we show the label ONLY when the country
  // is the current question's answer or already revealed — never reveals the answer.
  const pointLabelFn = useCallback(
    (d: object) => {
      const p = d as { iso3: string; name: string; micro: boolean };
      if (!p.micro) return "";
      // In Find mode, don't show the name (that would reveal the answer)
      if (disableHoverLabel) return "";
      return `<div style="font-family:'Inter',sans-serif;padding:5px 10px;background:rgba(5,5,8,0.88);border:1px solid rgba(255,255,255,0.14);border-radius:9999px;color:#fff;font-size:11px;backdrop-filter:blur(10px);white-space:nowrap">${p.name}</div>`;
    },
    [disableHoverLabel],
  );

  const pointRadiusFn = useCallback((d: object) => {
    const p = d as { radius: number; micro: boolean };
    if (!p.micro) return 0;
    // Visual dot size: small enough to look elegant, never distracting.
    // Interaction radius (p.radius) is much larger for easy clicking.
    // At altBand 4–5 (far): ~0.42 visual units. At altBand 0 (close): ~0.30.
    const base = altBand >= 3 ? 0.42 : altBand >= 1 ? 0.36 : 0.30;
    return base;
  }, [altBand]);

  const pointAltitudeFn = useCallback((d: object) => {
    const p = d as { micro: boolean };
    // Render well above polygon surfaces (0.04) — this is critical:
    // react-globe.gl raycasts layers in render order (points before polygons)
    // only when points are at higher altitude than polygons (0.004–0.025).
    // Setting 0.04 ensures the point sphere is always tested first.
    return p.micro ? 0.04 : 0;
  }, []);

  // Clear stale hover when active question changes
  useEffect(() => {
    setHoverIso3(null);
  }, [questionKey, highlightIso3, revealIso3]);

  // Senior UI/UX Continent Focus Polygon Cap Styling
  const polygonCapColor = useCallback(
    (d: object) => {
      const f = d as CountryFeature;
      const iso3 = f.properties.iso3;
      if (iso3 === revealIso3) return `rgba(${COLOR_REVEAL}, 0.35)`;
      if (iso3 === highlightIso3) return `rgba(${COLOR_HIGHLIGHT}, 0.28)`;
      if (iso3 === effHoverIso3) {
        const cont = continentByIso3.get(iso3);
        if (activeContinent && activeContinent !== "All" && cont !== activeContinent) {
          return "rgba(6, 9, 20, 0.78)";
        }
        return `rgba(${COLOR_HOVER}, 0.22)`;
      }
      if (dueSet.has(iso3)) {
        const a = pulse === 0 ? 0.1 : 0.18;
        return `rgba(${COLOR_DUE}, ${a})`;
      }
      const cont = continentByIso3.get(iso3);
      const inActive = !activeContinent || activeContinent === "All" || cont === activeContinent;
      if (!inActive) {
        // Softly mute out-of-region countries: dark steel-blue, NOT pitch-black.
        // This preserves the planet's depth and cohesion while creating
        // clear visual hierarchy with the active continent.
        return "rgba(18, 20, 42, 0.62)";
      }
      // Active continent or All mode: apply continent tint only when a specific
      // continent is selected. In All mode restore the premium violet base fill.
      if (activeContinent && cont && CONTINENT_TINT[cont]) {
        return `rgba(${CONTINENT_TINT[cont]}, 0.16)`;
      }
      // Premium default (All mode): rich violet tint matching the globe material.
      // rgba(108,99,255,0.08) gives the original deep-space landmass glow.
      return `rgba(${COLOR_BASE}, 0.08)`;
    },
    [revealIso3, highlightIso3, effHoverIso3, dueSet, pulse, continentByIso3, activeContinent],
  );

  const polygonSideColor = useCallback(
    () => `rgba(${COLOR_BASE}, 0.06)`,
    [],
  );

  const polygonStrokeColor = useCallback(
    (d: object) => {
      const f = d as CountryFeature;
      const iso3 = f.properties.iso3;
      if (iso3 === revealIso3) return `rgba(${COLOR_REVEAL}, 0.95)`;
      if (iso3 === highlightIso3) return `rgba(${COLOR_HIGHLIGHT}, 0.9)`;
      if (iso3 === effHoverIso3) {
        const cont = continentByIso3.get(iso3);
        if (activeContinent && activeContinent !== "All" && cont !== activeContinent) {
          return "rgba(255, 255, 255, 0.035)";
        }
        return `rgba(${COLOR_HOVER}, 0.8)`;
      }
      const cont = continentByIso3.get(iso3);
      const inActive = !activeContinent || activeContinent === "All" || cont === activeContinent;
      if (!inActive) {
        // Muted borders: visible enough to read the shape of the world
        return `rgba(255, 255, 255, ${Math.max(0.025, strokeOpacity * 0.2)})`;
      }
      return `rgba(255, 255, 255, ${strokeOpacity})`;
    },
    [revealIso3, highlightIso3, effHoverIso3, strokeOpacity, continentByIso3, activeContinent],
  );

  const polygonAltitude = useCallback(
    (d: object) => {
      const f = d as CountryFeature;
      const iso3 = f.properties.iso3;
      const inActive = !activeContinent || activeContinent === "All" || continentByIso3.get(iso3) === activeContinent;
      if (!inActive) return 0.002;
      if (iso3 === revealIso3 || iso3 === highlightIso3) return 0.02;
      if (iso3 === effHoverIso3) return 0.012;
      return 0.004;
    },
    [revealIso3, highlightIso3, effHoverIso3, activeContinent, continentByIso3],
  );

  const polygonLabel = useCallback(
    (d: object) => {
      if (disableHoverFeedback || disableHoverLabel) return "";
      const f = d as CountryFeature;
      const iso3 = f.properties.iso3;
      if (activeContinent && activeContinent !== "All") {
        const cont = continentByIso3.get(iso3);
        if (cont !== activeContinent) return ""; // Suppress tooltip outside active region
      }
      return `<div style="font-family:'Inter',sans-serif;padding:6px 10px;background:rgba(5,5,8,0.85);border:1px solid rgba(255,255,255,0.12);border-radius:9999px;color:#fff;font-size:12px;backdrop-filter:blur(8px)">${f.properties.name}</div>`;
    },
    [disableHoverFeedback, disableHoverLabel, activeContinent, continentByIso3],
  );

  // ---- Unified camera targeting pass ----------------------------------
  // For reveal (wrong answer) and focus (search): compute a context-preserving
  // altitude that shows the country without yanking the camera too far.
  // We read the *live* camera altitude at trigger time and only zoom out
  // enough to frame the country — never more than 1.5× the current altitude
  // and never more than 1.8 total. This prevents the jarring zoom-out when
  // the player is already focused on a region.
  const activeCameraTarget = useMemo(() => {
    if (revealIso3) {
      const f = featureByIso3.get(revealIso3);
      if (f) {
        const [clng, clat] = f.properties.centroid;
        const span = f.properties.angularSpan ?? 5;
        // Altitude needed to frame the country: span/28 gives ~1.0 for a country
        // spanning ~28°. We clamp to [0.22, 1.6].
        const frameAlt = Math.max(0.22, Math.min(1.6, Math.max(span, 1.5) / 28));
        // Read the current live altitude if globe is mounted; fall back to frameAlt.
        const liveAlt = ref.current ? ref.current.pointOfView().altitude : frameAlt;
        // Choose the more contextual altitude: if player is already zoomed in
        // enough to see the country, preserve their zoom. Otherwise zoom out
        // just enough. Never zoom in closer than frameAlt.
        const altitude = Math.max(frameAlt, Math.min(liveAlt * 1.25, 1.8));
        return { lat: clat, lng: clng, altitude, key: `reveal:${revealIso3}`, duration: 1100 };
      }
      const c = countryByIso3.get(revealIso3);
      if (c) {
        const liveAlt = ref.current ? ref.current.pointOfView().altitude : 1.4;
        const altitude = Math.min(Math.max(liveAlt, 1.0), 1.6);
        return { lat: c.coordinates[0], lng: c.coordinates[1], altitude, key: `reveal:${revealIso3}`, duration: 1100 };
      }
    }
    if (focusIso3) {
      const f = featureByIso3.get(focusIso3);
      if (f) {
        const [clng, clat] = f.properties.centroid;
        const span = f.properties.angularSpan ?? 5;
        const altitude = Math.max(0.22, Math.min(2.0, Math.max(span, 1.5) / 28));
        return { lat: clat, lng: clng, altitude, key: `focus:${focusIso3}`, duration: 1200 };
      }
      const c = countryByIso3.get(focusIso3);
      if (c) {
        return { lat: c.coordinates[0], lng: c.coordinates[1], altitude: 1.4, key: `focus:${focusIso3}`, duration: 1200 };
      }
    }
    if (pointOfView) {
      const lat = pointOfView.lat;
      const lng = pointOfView.lng;
      // If no explicit altitude is provided, preserve the player's current zoom.
      // This gives a smooth pan-only transition that doesn't yank them out.
      const liveAlt = ref.current ? ref.current.pointOfView().altitude : 1.8;
      const altitude = pointOfView.altitude ?? liveAlt;
      return {
        lat,
        lng,
        altitude,
        key: `pov:${lat.toFixed(3)},${lng.toFixed(3)},${altitude.toFixed(3)}`,
        duration: 1200,
      };
    }
    return null;
  }, [revealIso3, focusIso3, pointOfView, featureByIso3, countryByIso3]);

  const lastCameraTargetKey = useRef<string | null>(null);

  useEffect(() => {
    if (!activeCameraTarget || !ref.current) return;
    if (lastCameraTargetKey.current === activeCameraTarget.key) return;
    lastCameraTargetKey.current = activeCameraTarget.key;

    ref.current.controls().autoRotate = false;
    ref.current.pointOfView(
      { lat: activeCameraTarget.lat, lng: activeCameraTarget.lng, altitude: activeCameraTarget.altitude },
      effectiveQuality === "static" ? 0 : activeCameraTarget.duration,
    );
  }, [activeCameraTarget, effectiveQuality]);

  // ---- Explore-oriented camera logic for new questions ----------------
  // When a new question loads (driven by questionKey changes), we avoid centering
  // exactly on the target country since that reveals the answer. Instead:
  //  1. Calculate distance from current view center to the target country.
  //  2. If already in view (dist < threshold), keep the view exactly as is.
  //     If player is zoomed in too closely (alt < 0.8), zoom out slightly for context.
  //  3. If not in view (dist > threshold, e.g. on other side of the globe),
  //     rotate smoothly to the target country's continent center at a zoomed-out
  //     altitude so the player is oriented to the right region, but still has
  //     to search for and find the country.
  const lastQuestionKey = useRef<string | null>(null);

  useEffect(() => {
    if (!questionKey || !ref.current) {
      lastQuestionKey.current = questionKey;
      return;
    }
    if (lastQuestionKey.current === questionKey) return;
    lastQuestionKey.current = questionKey;

    const g = ref.current;
    const targetCountry = countryByIso3.get(questionKey);
    if (!targetCountry) return;

    const pov = g.pointOfView();
    const currentLat = pov.lat;
    const currentLng = pov.lng;
    const currentAlt = pov.altitude;

    const targetLat = targetCountry.coordinates[0];
    const targetLng = targetCountry.coordinates[1];

    const dist = angularDistanceDeg(currentLat, currentLng, targetLat, targetLng);
    // Visibility threshold scales with camera altitude: closer zoom = smaller visible field.
    const threshold = Math.min(75, 20 + currentAlt * 30);

    if (dist > threshold) {
      // Pan to the center of the country's continent to orient the player
      const continent = targetCountry.continent;
      const center = CONTINENT_CENTERS[continent] || { lat: targetLat, lng: targetLng };
      // Zoom out slightly to give context
      const altitude = Math.max(currentAlt * 1.15, 1.6);

      g.pointOfView({ lat: center.lat, lng: center.lng, altitude }, 1400);
    } else {
      // Already in the visible viewport, but if they are zoomed in very close,
      // perform a subtle zoom-out in place so they have space to search.
      if (currentAlt < 0.8) {
        g.pointOfView({ lat: currentLat, lng: currentLng, altitude: currentAlt * 1.35 }, 800);
      }
    }
  }, [questionKey, countryByIso3]);

  // ---- Click / hover handlers (active continent aware) ----------------
  const handlePolygonClick = useCallback(
    (d: object) => {
      const f = d as CountryFeature;
      const iso3 = f.properties.iso3;
      if (activeContinent && activeContinent !== "All") {
        const cont = continentByIso3.get(iso3);
        if (cont !== activeContinent) return; // Suppress click outside active region
      }
      onCountryClick?.(iso3);
    },
    [onCountryClick, activeContinent, continentByIso3],
  );

  const handlePolygonHover = useCallback(
    (d: object | null) => {
      if (!d) {
        setHoverIso3(null);
        return;
      }
      const f = d as CountryFeature;
      const iso3 = f.properties.iso3;
      if (activeContinent && activeContinent !== "All") {
        const cont = continentByIso3.get(iso3);
        if (cont !== activeContinent) {
          setHoverIso3(null);
          return;
        }
      }
      setHoverIso3(iso3);
    },
    [activeContinent, continentByIso3],
  );

  const handleHitboxClick = useCallback(
    (d: object) => {
      const p = d as { iso3: string };
      if (activeContinent && activeContinent !== "All") {
        const cont = continentByIso3.get(p.iso3);
        if (cont !== activeContinent) return;
      }
      onCountryClick?.(p.iso3);
    },
    [onCountryClick, activeContinent, continentByIso3],
  );

  const handleHitboxHover = useCallback(
    (d: object | null) => {
      if (!d) {
        setHoverIso3(null);
        return;
      }
      const p = d as { iso3: string };
      if (activeContinent && activeContinent !== "All") {
        const cont = continentByIso3.get(p.iso3);
        if (cont !== activeContinent) {
          setHoverIso3(null);
          return;
        }
      }
      setHoverIso3(p.iso3);
    },
    [activeContinent, continentByIso3],
  );

  // ---- OrbitControls wiring (deep zoom optimized) ---------------------
  const lastBandRef = useRef(altBand);
  lastBandRef.current = altBand;

  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    const controls = g.controls() as unknown as {
      enableZoom: boolean;
      enableDamping: boolean;
      dampingFactor: number;
      zoomSpeed: number;
      rotateSpeed: number;
      autoRotate: boolean;
      autoRotateSpeed: number;
      minDistance: number;
      maxDistance: number;
      touches: { ONE: number; TWO: number };
      addEventListener: (k: string, cb: () => void) => void;
      removeEventListener: (k: string, cb: () => void) => void;
      object: { position: { length: () => number } };
    };
    controls.enableZoom = true;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08; // Smooth damping at deep zoom
    controls.zoomSpeed = 0.6;
    controls.rotateSpeed = 0.45;
    controls.minDistance = 108; // Altitude ~0.08: allows close inspection of microstates
    controls.maxDistance = 420;
    controls.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };

    if (effectiveQuality === "static") {
      controls.autoRotate = false;
    } else {
      controls.autoRotate = true;
      controls.autoRotateSpeed = effectiveQuality === "medium" ? 0.18 : 0.35;
    }
    g.pointOfView({ lat: 20, lng: 0, altitude: 2.4 }, 0);

    // Auto-rotate suspension on user interaction.
    let resumeTimer: number | null = null;
    const onStart = () => {
      controls.autoRotate = false;
      if (resumeTimer) window.clearTimeout(resumeTimer);
    };
    const onEnd = () => {
      if (effectiveQuality === "static") return;
      if (resumeTimer) window.clearTimeout(resumeTimer);
      resumeTimer = window.setTimeout(() => {
        controls.autoRotate = true;
      }, 6000);
    };

    // Altitude tracking — rAF throttled.
    let raf = 0;
    const onChange = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const dist = controls.object.position.length();
        const alt = dist / 100 - 1; // globe radius is 100
        const band = altitudeBand(alt);
        if (band !== lastBandRef.current) {
          setAltBand(band);
        }
      });
    };

    controls.addEventListener("start", onStart);
    controls.addEventListener("end", onEnd);
    controls.addEventListener("change", onChange);
    return () => {
      controls.removeEventListener("start", onStart);
      controls.removeEventListener("end", onEnd);
      controls.removeEventListener("change", onChange);
      if (raf) cancelAnimationFrame(raf);
      if (resumeTimer) window.clearTimeout(resumeTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveQuality]);

  // ---- Ring pulse (highlight / reveal) --------------------------------
  const rings = useMemo(() => {
    if (effectiveQuality === "static") return [];
    const target = revealIso3 ?? highlightIso3;
    if (!target) return [];
    const c = countryByIso3.get(target);
    if (!c) return [];
    const isReveal = target === revealIso3;
    return [
      {
        lat: c.coordinates[0],
        lng: c.coordinates[1],
        maxR: isReveal ? 8 : 6,
        propagationSpeed: isReveal ? 4 : 3,
        repeatPeriod: isReveal ? 900 : 1200,
        color: isReveal ? COLOR_REVEAL : COLOR_HIGHLIGHT,
      },
    ];
  }, [revealIso3, highlightIso3, countryByIso3, effectiveQuality]);

  // ---- Zoom control handlers ------------------------------------------
  const zoomBy = useCallback(
    (factor: number) => {
      const g = ref.current;
      if (!g) return;
      const pov = g.pointOfView();
      g.pointOfView({ ...pov, altitude: Math.max(0.22, Math.min(3.2, pov.altitude * factor)) }, 500);
    },
    [],
  );
  const resetView = useCallback(() => {
    const g = ref.current;
    if (!g) return;
    g.pointOfView({ lat: 20, lng: 0, altitude: 2.4 }, 800);
  }, []);

  // ---- Keyboard a11y ---------------------------------------------------
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const g = ref.current;
      if (!g) return;
      const step = e.shiftKey ? 15 : 5;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomBy(0.7);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        zoomBy(1.4);
      } else if (e.key === "0") {
        e.preventDefault();
        resetView();
      } else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const pov = g.pointOfView();
        const dLat = e.key === "ArrowUp" ? step : e.key === "ArrowDown" ? -step : 0;
        const dLng = e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0;
        g.pointOfView(
          {
            lat: Math.max(-85, Math.min(85, pov.lat + dLat)),
            lng: ((pov.lng + dLng + 540) % 360) - 180,
            altitude: pov.altitude,
          },
          300,
        );
      } else if ((e.key === "Enter" || e.key === " ") && hoverIso3) {
        e.preventDefault();
        onCountryClick?.(hoverIso3);
      }
    },
    [zoomBy, resetView, hoverIso3, onCountryClick],
  );

  // ---- Render ---------------------------------------------------------
  return (
    <div
      ref={wrapperRef}
      className="size-full relative outline-none"
      style={{ minHeight: size ?? 480, touchAction: "none" }}
      tabIndex={0}
      role="application"
      aria-label="Interactive globe — arrow keys to rotate, plus and minus to zoom, zero to reset"
      onKeyDown={onKeyDown}
    >
      <Globe
        ref={ref}
        width={dim.w}
        height={dim.h}
        backgroundColor="rgba(0,0,0,0)"
        globeMaterial={globeMaterial}
        showAtmosphere
        atmosphereColor="#6C63FF"
        atmosphereAltitude={
          effectiveQuality === "static" ? 0.16 : effectiveQuality === "medium" ? 0.2 : 0.22
        }
        rendererConfig={{
          antialias: effectiveQuality !== "static",
          alpha: true,
        }}
        polygonsData={features ?? []}
        polygonGeoJsonGeometry={
          ((d: object) => (d as CountryFeature).geometry) as unknown as undefined
        }
        polygonCapColor={polygonCapColor}
        polygonSideColor={polygonSideColor}
        polygonStrokeColor={polygonStrokeColor}
        polygonAltitude={polygonAltitude}
        polygonLabel={polygonLabel}
        polygonsTransitionDuration={0}
        onPolygonClick={handlePolygonClick}
        onPolygonHover={handlePolygonHover}
        pointsData={hitboxPoints}
        pointLat={(d: object) => (d as { lat: number }).lat}
        pointLng={(d: object) => (d as { lng: number }).lng}
        pointColor={pointColorFn}
        pointLabel={pointLabelFn}
        pointAltitude={pointAltitudeFn}
        pointRadius={pointRadiusFn}
        pointsMerge={false}
        onPointClick={handleHitboxClick}
        onPointHover={handleHitboxHover}
        ringsData={rings}
        ringColor={(d: object) => (t: number) =>
          `rgba(${(d as { color: string }).color}, ${1 - t})`
        }
        ringMaxRadius="maxR"
        ringPropagationSpeed="propagationSpeed"
        ringRepeatPeriod="repeatPeriod"
      />

      {/* Zoom controls overlay */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5 pointer-events-none">
        <ZoomButton onClick={() => zoomBy(0.7)} label="Zoom in">
          <Plus className="size-4" strokeWidth={2.2} />
        </ZoomButton>
        <ZoomButton onClick={() => zoomBy(1.4)} label="Zoom out">
          <Minus className="size-4" strokeWidth={2.2} />
        </ZoomButton>
        <ZoomButton onClick={resetView} label="Reset view">
          <RotateCcw className="size-4" strokeWidth={2.2} />
        </ZoomButton>
      </div>
    </div>
  );
}

function ZoomButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="pointer-events-auto grid place-items-center size-11 rounded-full bg-black/30 backdrop-blur-md border border-white/10 text-white/70 hover:text-white hover:bg-black/45 hover:border-white/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
    >
      {children}
    </button>
  );
}
