import data from "@/data/countries.json";
import type { CountriesDataset, Country } from "@/types/country";

const dataset = data as CountriesDataset;

export const COUNTRIES: readonly Country[] = Object.freeze(dataset.countries);

export const COUNTRY_BY_ISO3: ReadonlyMap<string, Country> = new Map(
  COUNTRIES.map((c) => [c.iso3, c]),
);

export function pickRandomCountries(n: number, exclude: Set<string> = new Set()): Country[] {
  const pool = COUNTRIES.filter((c) => !exclude.has(c.iso3));
  const out: Country[] = [];
  const used = new Set<number>();
  while (out.length < n && used.size < pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    if (used.has(i)) continue;
    used.add(i);
    out.push(pool[i]!);
  }
  return out;
}
