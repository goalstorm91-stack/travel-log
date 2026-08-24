import { CITY_ALIASES } from "../data/cityAliases";

interface CityEntry {
  city: string;
  country: string;
  lat: number;
  lng: number;
  pop: number;
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function bestByPopulation(matches: CityEntry[]): CityEntry | undefined {
  if (matches.length === 0) return undefined;
  return [...matches].sort((a, b) => b.pop - a.pop)[0];
}

/**
 * Best-effort lookup of a city's coordinates from the user-typed city name
 * and its trip's country. Tries, in order: a curated Korean-name alias,
 * then a direct match within the bundled dataset (scoped to the country,
 * then unscoped as a last resort for territories like Hong Kong/Macau
 * that our country list folds into a larger neighbor).
 *
 * The ~600KB city dataset is only needed at trip-creation time, so it's
 * dynamically imported here instead of living in the main bundle.
 */
export async function findCityCoords(
  cityName: string,
  countryName: string,
): Promise<{ lat: number; lng: number } | undefined> {
  const { default: cityData } = await import("../data/cities.json");
  const CITIES = cityData as CityEntry[];

  const alias = CITY_ALIASES[cityName.trim()];
  if (alias) {
    const hit = CITIES.find(
      (c) => c.city === alias.city && c.country === alias.country,
    );
    if (hit) return { lat: hit.lat, lng: hit.lng };
  }

  const target = norm(cityName);
  const scoped = CITIES.filter(
    (c) => norm(c.country) === norm(countryName) && norm(c.city) === target,
  );
  const scopedHit = bestByPopulation(scoped);
  if (scopedHit) return { lat: scopedHit.lat, lng: scopedHit.lng };

  const unscoped = CITIES.filter((c) => norm(c.city) === target);
  const unscopedHit = bestByPopulation(unscoped);
  if (unscopedHit) return { lat: unscopedHit.lat, lng: unscopedHit.lng };

  return undefined;
}
