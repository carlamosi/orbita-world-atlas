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
  Africa: "255, 184, 77",
  Americas: "108, 99, 255",
  Asia: "0, 212, 255",
  Europe: "0, 255, 178",
  Oceania: "236, 72, 153",
  Antarctic: "203, 213, 225",
};

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
  const [loadedRes, setLoadedRes] = useState<"110m" | "50m">("110m");

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

  const transitionMs =
    effectiveQuality === "static" ? 0 : effectiveQuality === "medium" ? 180 : 250;

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
  // Deep-indigo sphere with subtle specular highlight. No textures, no
  // procedural day/night — just the cinematic dark-space aesthetic.
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

  // ---- Lazy 50m upgrade on first close zoom (high quality only) --------
  useEffect(() => {
    if (effectiveQuality !== "high") return;
    if (loadedRes === "50m") return;
    if (altBand > 1) return; // only when close
    let cancelled = false;
    void ensureFeatures("50m").then((f) => {
      if (!cancelled) {
        setFeatures(f);
        setLoadedRes("50m");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [altBand, effectiveQuality, loadedRes]);

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

  // ---- Adaptive hitboxes -----------------------------------------------
  // At far altitudes we render an invisible point cloud sized inversely to
  // each country's polygon area (and its miss-rate, if provided), giving
  // small or tricky countries a generous hit target without compromising
  // precision when the user zooms in.
  const hitboxPoints = useMemo(() => {
    if (!features) return [] as Array<{ iso3: string; lat: number; lng: number; radius: number }>;
    if (altBand <= 3) return []; // close enough — polygons only
    const scored = features
      .map((f) => {
        const iso3 = f.properties.iso3;
        const area = f.properties.area || 0.0001;
        const miss = missRates?.[iso3] ?? 0;
        // Lower score = harder to hit → bigger boost.
        const score = area * (1 - Math.min(0.9, miss) * 0.7);
        return { iso3, score, centroid: f.properties.centroid };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, 50);
    const maxScore = scored[scored.length - 1]?.score || 1;
    return scored.map(({ iso3, score, centroid }) => {
      const ease = 1 - Math.min(1, score / maxScore);
      const radius = 0.18 + ease * 0.55; // 0.18–0.73
      return { iso3, lat: centroid[1], lng: centroid[0], radius };
    });
  }, [features, missRates, altBand]);

  // ---- Polygon styling accessors (memoised) ----------------------------
  const strokeOpacity = strokeOpacityFor(
    altBand === 0 ? 0.3 : altBand === 1 ? 0.55 : altBand === 2 ? 0.9 : altBand === 3 ? 1.4 : altBand === 4 ? 2.0 : 2.8,
  );
  const showContinentTint = effectiveQuality === "high" && altBand <= 2;

  const dueSet = useMemo(
    () => new Set(dueReviewIso3 ?? []),
    [dueReviewIso3],
  );
  // A slow oscillation drives the due-review pulse; we tick state every 600 ms
  // ONLY when there are due countries, to keep the render path quiet otherwise.
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (effectiveQuality === "static") return;
    if (dueSet.size === 0) return;
    const id = window.setInterval(() => setPulse((p) => (p + 1) % 2), 1100);
    return () => window.clearInterval(id);
  }, [dueSet, effectiveQuality]);

  const effHoverIso3 = disableHoverFeedback ? null : hoverIso3;

  // Clear stale hover when the active question/target changes so the previous
  // country doesn't keep glowing after auto-advance.
  useEffect(() => {
    setHoverIso3(null);
  }, [questionKey, highlightIso3, revealIso3]);

  const polygonCapColor = useCallback(
    (d: object) => {
      const f = d as CountryFeature;
      const iso3 = f.properties.iso3;
      if (iso3 === revealIso3) return `rgba(${COLOR_REVEAL}, 0.28)`;
      if (iso3 === highlightIso3) return `rgba(${COLOR_HIGHLIGHT}, 0.22)`;
      if (iso3 === effHoverIso3) return `rgba(${COLOR_HOVER}, 0.18)`;
      if (dueSet.has(iso3)) {
        const a = pulse === 0 ? 0.1 : 0.18;
        return `rgba(${COLOR_DUE}, ${a})`;
      }
      if (showContinentTint) {
        const cont = continentByIso3.get(iso3);
        const tint = cont ? CONTINENT_TINT[cont] : null;
        if (tint) return `rgba(${tint}, 0.04)`;
      }
      return "rgba(255, 255, 255, 0.012)";
    },
    [revealIso3, highlightIso3, effHoverIso3, dueSet, pulse, showContinentTint, continentByIso3],
  );

  const polygonSideColor = useCallback(
    () => `rgba(${COLOR_BASE}, 0.06)`,
    [],
  );

  const polygonStrokeColor = useCallback(
    (d: object) => {
      const f = d as CountryFeature;
      const iso3 = f.properties.iso3;
      if (iso3 === revealIso3) return `rgba(${COLOR_REVEAL}, 0.9)`;
      if (iso3 === highlightIso3) return `rgba(${COLOR_HIGHLIGHT}, 0.85)`;
      if (iso3 === effHoverIso3) return `rgba(${COLOR_HOVER}, 0.7)`;
      return `rgba(255, 255, 255, ${strokeOpacity})`;
    },
    [revealIso3, highlightIso3, effHoverIso3, strokeOpacity],
  );

  const polygonAltitude = useCallback(
    (d: object) => {
      const f = d as CountryFeature;
      const iso3 = f.properties.iso3;
      if (iso3 === revealIso3 || iso3 === highlightIso3) return 0.035;
      if (iso3 === effHoverIso3) return 0.02;
      return 0.006;
    },
    [revealIso3, highlightIso3, effHoverIso3],
  );

  const polygonLabel = useCallback(
    (d: object) => {
      if (disableHoverFeedback) return "";
      const f = d as CountryFeature;
      return `<div style="font-family:'Inter',sans-serif;padding:6px 10px;background:rgba(5,5,8,0.85);border:1px solid rgba(255,255,255,0.12);border-radius:9999px;color:#fff;font-size:12px;backdrop-filter:blur(8px)">${f.properties.name}</div>`;
    },
    [disableHoverFeedback],
  );

  // ---- Cinematic country framing ---------------------------------------
  const focusCountry = useCallback(
    (iso3: string, durationMs = 1200) => {
      const g = ref.current;
      if (!g) return;
      const f = featureByIso3.get(iso3);
      let lat: number;
      let lng: number;
      let altitude: number;
      if (f) {
        const [clng, clat] = f.properties.centroid;
        lng = clng;
        lat = clat;
        // Frame so the country fills ~55% of the viewport (span is degrees).
        const span = Math.max(2, f.properties.angularSpan);
        altitude = Math.max(0.32, Math.min(2.0, span / 28));
      } else {
        const c = countryByIso3.get(iso3);
        if (!c) return;
        lat = c.coordinates[0];
        lng = c.coordinates[1];
        altitude = 1.4;
      }
      g.controls().autoRotate = false;
      g.pointOfView(
        { lat, lng, altitude },
        effectiveQuality === "static" ? 0 : durationMs,
      );
    },
    [countryByIso3, featureByIso3, effectiveQuality],
  );

  // ---- Click / hover handlers -----------------------------------------
  const handlePolygonClick = useCallback(
    (d: object) => {
      const f = d as CountryFeature;
      onCountryClick?.(f.properties.iso3);
    },
    [onCountryClick],
  );

  const handlePolygonHover = useCallback((d: object | null) => {
    if (!d) {
      setHoverIso3(null);
      return;
    }
    const f = d as CountryFeature;
    setHoverIso3(f.properties.iso3);
  }, []);

  const handleHitboxClick = useCallback(
    (d: object) => {
      const p = d as { iso3: string };
      onCountryClick?.(p.iso3);
    },
    [onCountryClick],
  );

  const handleHitboxHover = useCallback((d: object | null) => {
    if (!d) {
      setHoverIso3(null);
      return;
    }
    const p = d as { iso3: string };
    setHoverIso3(p.iso3);
  }, []);

  // ---- OrbitControls wiring -------------------------------------------
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
    controls.dampingFactor = 0.12;
    controls.zoomSpeed = 0.7;
    controls.rotateSpeed = 0.45;
    controls.minDistance = 122; // ≈ altitude 0.22 (globe radius 100)
    controls.maxDistance = 420; // ≈ altitude 3.2
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
    let lastBand = altBand;
    const onChange = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const dist = controls.object.position.length();
        const alt = dist / 100 - 1; // globe radius is 100
        const band = altitudeBand(alt);
        if (band !== lastBand) {
          lastBand = band;
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

  // ---- External focus / pointOfView -----------------------------------
  useEffect(() => {
    if (focusIso3) focusCountry(focusIso3);
  }, [focusIso3, focusCountry]);

  useEffect(() => {
    if (!pointOfView || !ref.current) return;
    ref.current.controls().autoRotate = false;
    ref.current.pointOfView(
      { lat: pointOfView.lat, lng: pointOfView.lng, altitude: pointOfView.altitude ?? 1.8 },
      effectiveQuality === "static" ? 0 : 1200,
    );
  }, [pointOfView, effectiveQuality]);

  // Auto-focus on reveal so the answer is always framed.
  useEffect(() => {
    if (revealIso3) focusCountry(revealIso3, 1100);
  }, [revealIso3, focusCountry]);

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
        polygonsTransitionDuration={transitionMs}
        onPolygonClick={handlePolygonClick}
        onPolygonHover={handlePolygonHover}
        pointsData={hitboxPoints}
        pointLat={(d: object) => (d as { lat: number }).lat}
        pointLng={(d: object) => (d as { lng: number }).lng}
        pointColor={() => "rgba(0,0,0,0)"}
        pointAltitude={0}
        pointRadius={(d: object) => (d as { radius: number }).radius}
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
