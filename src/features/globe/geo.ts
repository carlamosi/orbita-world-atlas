/**
 * Country geometry loader for Globe3D.
 *
 * Source: world-atlas (Natural Earth) TopoJSON.
 *  - 110m → bundled by default (~108 KB, ~177 countries).
 *  - 50m  → lazy-loaded on first close zoom (~756 KB, sharper borders).
 *
 * world-atlas geometries are keyed by M49 numeric codes; we attach an
 * `iso3` string via a precomputed M49 → ISO3 lookup so polygons can be
 * matched against the project's Country dataset.
 */
import { feature } from "topojson-client";
import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Polygon,
  Position,
} from "geojson";

import topo110 from "@/assets/geo/world-110m.json";
import m49Map from "@/assets/geo/m49-to-iso3.json";

// ---------------------------------------------------------------------------
// Types

export type CountryGeometry = Polygon | MultiPolygon;

export interface CountryProps {
  iso3: string;
  name: string;
  /** Approximate spherical area in steradians (0–4π). Computed lazily. */
  area: number;
  /** Centroid in [lng, lat] degrees. */
  centroid: [number, number];
  /** Half angular extent (degrees) from centroid; drives zoom-to-fit. */
  angularSpan: number;
}

export type CountryFeature = Feature<CountryGeometry, CountryProps>;

export type GeoResolution = "110m" | "50m";

// ---------------------------------------------------------------------------
// Internals

const M49_TO_ISO3 = m49Map as Record<string, string>;

const cache = new Map<GeoResolution, CountryFeature[]>();
let pending50m: Promise<CountryFeature[]> | null = null;

// Topology shape from world-atlas; cast minimally to avoid pulling
// `@types/topojson-specification` for one call site.
interface TopoLike {
  type: "Topology";
  objects: { countries: unknown };
  arcs: unknown;
  transform?: unknown;
}

function enrich(raw: FeatureCollection): CountryFeature[] {
  const out: CountryFeature[] = [];
  for (const f of raw.features) {
    if (!f.geometry) continue;
    if (f.geometry.type !== "Polygon" && f.geometry.type !== "MultiPolygon") continue;
    const m49 = String(f.id ?? "").padStart(3, "0");
    const iso3 = M49_TO_ISO3[m49];
    if (!iso3) continue;
    const geom = f.geometry as CountryGeometry;
    const centroid = computeCentroid(geom);
    const angularSpan = computeAngularSpan(geom, centroid);
    const props = (f.properties ?? {}) as { name?: string };
    out.push({
      type: "Feature",
      id: iso3,
      geometry: geom,
      properties: {
        iso3,
        name: props.name ?? iso3,
        area: computeArea(geom),
        centroid,
        angularSpan,
      },
    });
  }
  return out;
}

function topoToFeatures(topo: TopoLike): CountryFeature[] {
  const fc = feature(
    topo as unknown as Parameters<typeof feature>[0],
    (topo.objects as { countries: Parameters<typeof feature>[1] }).countries,
  ) as unknown as FeatureCollection;
  return enrich(fc);
}

// ---------------------------------------------------------------------------
// Public API

export function loadCountryFeatures(resolution: GeoResolution = "110m"): CountryFeature[] | null {
  const cached = cache.get(resolution);
  if (cached) return cached;
  if (resolution === "110m") {
    const features = topoToFeatures(topo110 as unknown as TopoLike);
    cache.set("110m", features);
    return features;
  }
  // 50m must be requested via ensureFeatures()
  return null;
}

export async function ensureFeatures(resolution: GeoResolution): Promise<CountryFeature[]> {
  const cached = cache.get(resolution);
  if (cached) return cached;
  if (resolution === "110m") return loadCountryFeatures("110m")!;
  if (!pending50m) {
    pending50m = import("@/assets/geo/world-50m.json").then((mod) => {
      const features = topoToFeatures(mod.default as unknown as TopoLike);
      cache.set("50m", features);
      return features;
    });
  }
  return pending50m;
}

// ---------------------------------------------------------------------------
// Geometry helpers (lightweight, no extra deps)

function* iterRings(geom: CountryGeometry): Generator<Position[]> {
  if (geom.type === "Polygon") {
    for (const ring of geom.coordinates) yield ring;
  } else {
    for (const poly of geom.coordinates) for (const ring of poly) yield ring;
  }
}

function computeCentroid(geom: CountryGeometry): [number, number] {
  // Weighted average of vertices (good enough for zoom framing).
  let x = 0;
  let y = 0;
  let z = 0;
  let n = 0;
  for (const ring of iterRings(geom)) {
    // Skip the duplicate closing vertex.
    const len = ring.length - 1;
    for (let i = 0; i < len; i++) {
      const v = ring[i]!;
      const lng = (v[0] as number) * (Math.PI / 180);
      const lat = (v[1] as number) * (Math.PI / 180);
      const cl = Math.cos(lat);
      x += cl * Math.cos(lng);
      y += cl * Math.sin(lng);
      z += Math.sin(lat);
      n++;
    }
  }
  if (n === 0) return [0, 0];
  x /= n;
  y /= n;
  z /= n;
  const hyp = Math.sqrt(x * x + y * y);
  const lat = Math.atan2(z, hyp) * (180 / Math.PI);
  const lng = Math.atan2(y, x) * (180 / Math.PI);
  return [lng, lat];
}

function computeAngularSpan(geom: CountryGeometry, centroid: [number, number]): number {
  const [clng, clat] = centroid;
  let maxDeg = 0;
  for (const ring of iterRings(geom)) {
    for (const v of ring) {
      const d = angularDistanceDeg(clat, clng, v[1] as number, v[0] as number);
      if (d > maxDeg) maxDeg = d;
    }
  }
  return maxDeg;
}

function angularDistanceDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const φ1 = lat1 * (Math.PI / 180);
  const φ2 = lat2 * (Math.PI / 180);
  const Δλ = (lng2 - lng1) * (Math.PI / 180);
  const c = Math.sin(φ1) * Math.sin(φ2) + Math.cos(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return Math.acos(Math.min(1, Math.max(-1, c))) * (180 / Math.PI);
}

function computeArea(geom: CountryGeometry): number {
  // Approximate spherical area on unit sphere via shoelace on equirectangular
  // projection (good enough for relative size ranking; we don't need geodesic
  // precision for adaptive picking weights).
  let total = 0;
  const wrap = (lst: Position[]) => {
    let s = 0;
    for (let i = 0; i < lst.length - 1; i++) {
      const a = lst[i]!;
      const b = lst[i + 1]!;
      s += ((b[0] as number) - (a[0] as number)) *
        Math.sin((((a[1] as number) + (b[1] as number)) / 2) * (Math.PI / 180));
    }
    return Math.abs(s);
  };
  if (geom.type === "Polygon") {
    for (let i = 0; i < geom.coordinates.length; i++) {
      const sign = i === 0 ? 1 : -1;
      total += sign * wrap(geom.coordinates[i]!);
    }
  } else {
    for (const poly of geom.coordinates) {
      for (let i = 0; i < poly.length; i++) {
        const sign = i === 0 ? 1 : -1;
        total += sign * wrap(poly[i]!);
      }
    }
  }
  return total;
}
