export type Difficulty = "easy" | "medium" | "hard";
export type Continent =
  | "Africa"
  | "Americas"
  | "Asia"
  | "Europe"
  | "Oceania"
  | "Antarctic"
  | "";

export interface Country {
  iso3: string;
  iso2: string;
  name: string;
  capital: string | null;
  flagCode: string;
  coordinates: [number, number]; // [lat, lng]
  capitalCoords: [number, number];
  continent: Continent;
  subregion: string;
  population: number;
  currencies: string[];
  languages: string[];
  borders: string[];
  area: number;
  difficulty: Difficulty;
}

export interface CountriesDataset {
  version: number;
  count: number;
  countries: Country[];
}
