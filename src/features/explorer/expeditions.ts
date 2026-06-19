/**
 * Guided Expeditions — curated, ordered country tours for the Atlas.
 * Each expedition is a sequence of ISO3 codes the user steps through;
 * the globe focuses on each country and the panel surfaces its intel.
 */
export interface Expedition {
  id: string;
  title: string;
  subtitle: string;
  continent: string;
  iso3s: string[];
}

export const EXPEDITIONS: Expedition[] = [
  {
    id: "europe-essentials",
    title: "Europe Essentials",
    subtitle: "The continent's largest economies in a single loop.",
    continent: "Europe",
    iso3s: ["GBR", "FRA", "DEU", "ITA", "ESP", "POL", "NLD", "BEL", "SWE", "PRT"],
  },
  {
    id: "europe-microstates",
    title: "Microstates of Europe",
    subtitle: "Tiny sovereign nations tucked between giants.",
    continent: "Europe",
    iso3s: ["VAT", "MCO", "SMR", "LIE", "AND", "MLT", "LUX"],
  },
  {
    id: "africa-capitals",
    title: "Capitals of Africa",
    subtitle: "From Cairo to Cape Town — the continent's seats of power.",
    continent: "Africa",
    iso3s: ["EGY", "MAR", "DZA", "NGA", "ETH", "KEN", "TZA", "ZAF", "GHA", "SEN"],
  },
  {
    id: "asia-giants",
    title: "Asia's Giants",
    subtitle: "The largest, most populous nations of the East.",
    continent: "Asia",
    iso3s: ["CHN", "IND", "JPN", "IDN", "PAK", "BGD", "PHL", "VNM", "THA", "KOR"],
  },
  {
    id: "americas-grand-tour",
    title: "Americas Grand Tour",
    subtitle: "North to South — a hemisphere in ten stops.",
    continent: "Americas",
    iso3s: ["CAN", "USA", "MEX", "GTM", "CRI", "COL", "PER", "BRA", "ARG", "CHL"],
  },
  {
    id: "oceania-archipelagos",
    title: "Oceania Archipelagos",
    subtitle: "Island nations of the Pacific.",
    continent: "Oceania",
    iso3s: ["AUS", "NZL", "PNG", "FJI", "SLB", "VUT", "WSM", "TON"],
  },
];

export function findExpedition(id: string): Expedition | undefined {
  return EXPEDITIONS.find((e) => e.id === id);
}
