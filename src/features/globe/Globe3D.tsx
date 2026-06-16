import { useEffect, useRef, useState } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import type { Country } from "@/types/country";

export type GlobeQuality = "high" | "medium" | "static";

interface Globe3DProps {
  countries: readonly Country[];
  highlightIso3?: string | null;
  revealIso3?: string | null;
  onCountryClick?: (iso3: string) => void;
  pointOfView?: { lat: number; lng: number; altitude?: number };
  size?: number;
  /**
   * Mid-device degradation lever. The Explorer layout uses "medium" while
   * the panel is open and "static" if the user has reduced-motion. Single-
   * focus modes stay on "high".
   */
  quality?: GlobeQuality;
}

export default function Globe3D({
  countries,
  highlightIso3,
  revealIso3,
  onCountryClick,
  pointOfView,
  size,
  quality = "high",
}: Globe3DProps) {
  const ref = useRef<GlobeMethods | undefined>(undefined);
  const [dim, setDim] = useState({ w: 600, h: 600 });
  const wrapperRef = useRef<HTMLDivElement>(null);

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

  // Detect reduced motion → force "static" regardless of prop.
  const effectiveQuality: GlobeQuality =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      ? "static"
      : quality;

  // Cinematic controls — vary by quality.
  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    const controls = g.controls();
    controls.enableZoom = false;
    if (effectiveQuality === "static") {
      controls.autoRotate = false;
    } else {
      controls.autoRotate = true;
      controls.autoRotateSpeed = effectiveQuality === "medium" ? 0.18 : 0.35;
    }
    g.pointOfView({ lat: 20, lng: 0, altitude: 2.4 }, 0);
  }, [effectiveQuality]);

  // Animate POV when requested
  useEffect(() => {
    if (!pointOfView || !ref.current) return;
    ref.current.controls().autoRotate = false;
    ref.current.pointOfView(
      { lat: pointOfView.lat, lng: pointOfView.lng, altitude: pointOfView.altitude ?? 1.8 },
      effectiveQuality === "static" ? 0 : 1400,
    );
  }, [pointOfView, effectiveQuality]);

  // Down-sample point cloud in medium/static to ease GPU pressure on mid-tier devices.
  const downsampled =
    effectiveQuality === "high"
      ? countries
      : countries.filter((c, i) => {
          if (c.iso3 === highlightIso3 || c.iso3 === revealIso3) return true;
          // Always keep the largest 60% of countries by area; sparsify the rest.
          return i % (effectiveQuality === "static" ? 3 : 2) === 0;
        });

  const points = downsampled.map((c) => {
    const isHighlight = c.iso3 === highlightIso3;
    const isReveal = c.iso3 === revealIso3;
    return {
      iso3: c.iso3,
      name: c.name,
      lat: c.coordinates[0],
      lng: c.coordinates[1],
      color: isReveal ? "#FF6B6B" : isHighlight ? "#00FFB2" : "#6C63FF",
      altitude: isHighlight || isReveal ? 0.06 : 0.012,
      radius: isHighlight || isReveal ? 0.9 : 0.32,
    };
  });

  const rings = highlightIso3
    ? (() => {
        const c = countries.find((x) => x.iso3 === highlightIso3);
        return c
          ? [{ lat: c.coordinates[0], lng: c.coordinates[1], maxR: 6, propagationSpeed: 3, repeatPeriod: 1200 }]
          : [];
      })()
    : revealIso3
      ? (() => {
          const c = countries.find((x) => x.iso3 === revealIso3);
          return c
            ? [{ lat: c.coordinates[0], lng: c.coordinates[1], maxR: 8, propagationSpeed: 4, repeatPeriod: 900 }]
            : [];
        })()
      : [];

  return (
    <div ref={wrapperRef} className="size-full relative" style={{ minHeight: size ?? 480 }}>
      <Globe
        ref={ref}
        width={dim.w}
        height={dim.h}
        backgroundColor="rgba(0,0,0,0)"
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
        bumpImageUrl={effectiveQuality === "static" ? undefined : "//unpkg.com/three-globe/example/img/earth-topology.png"}
        showAtmosphere
        atmosphereColor="#6C63FF"
        atmosphereAltitude={effectiveQuality === "static" ? 0.16 : 0.22}
        pointsData={points}
        pointLat={(d: object) => (d as { lat: number }).lat}
        pointLng={(d: object) => (d as { lng: number }).lng}
        pointColor={(d: object) => (d as { color: string }).color}
        pointAltitude={(d: object) => (d as { altitude: number }).altitude}
        pointRadius={(d: object) => (d as { radius: number }).radius}
        pointLabel={(d: object) => `<div style="font-family:'Inter',sans-serif;padding:6px 10px;background:rgba(5,5,8,0.85);border:1px solid rgba(255,255,255,0.12);border-radius:9999px;color:#fff;font-size:12px;backdrop-filter:blur(8px)">${(d as { name: string }).name}</div>`}
        onPointClick={(d: object) => onCountryClick?.((d as { iso3: string }).iso3)}
        ringsData={rings}
        ringColor={() => (t: number) => `rgba(108,99,255,${1 - t})`}
        ringMaxRadius="maxR"
        ringPropagationSpeed="propagationSpeed"
        ringRepeatPeriod="repeatPeriod"
      />
    </div>
  );
}
