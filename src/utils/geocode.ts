import { CITY_ALIASES } from "../data/cityAliases";

interface CityEntry {
  city: string;
  country: string;
  lat: number;
  lng: number;
  pop: number;
}

export interface NearestCity {
  city: string; // English dataset name
  country: string; // English name, normalized to our COUNTRIES list where possible
  label: string; // Korean display name when we have one, else English
  lat: number;
  lng: number;
  distKm: number;
}

// The ~600KB dataset is only needed when creating trips or importing photos,
// so it is dynamically imported and cached instead of living in the main bundle.
let citiesPromise: Promise<CityEntry[]> | null = null;
function loadCities(): Promise<CityEntry[]> {
  return (citiesPromise ??= import("../data/cities.json").then(
    (m) => m.default as CityEntry[],
  ));
}

// Territories our country list folds into a larger neighbor.
const TERRITORY_PARENT: Record<string, string> = {
  "Hong Kong": "China",
  Macau: "China",
};

const KR_LABELS: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [kr, { city, country }] of Object.entries(CITY_ALIASES)) {
    const key = `${city}|${country}`;
    if (!map.has(key)) map.set(key, kr); // first alias wins (e.g. 제주 over 제주도)
  }
  return map;
})();

export function cityLabelKR(city: string, country: string): string {
  return KR_LABELS.get(`${city}|${country}`) ?? city;
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
 */
export async function findCityCoords(
  cityName: string,
  countryName: string,
): Promise<{ lat: number; lng: number } | undefined> {
  const CITIES = await loadCities();

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

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// Big cities are split into wards/suburbs in the dataset (Shinjuku, Shibuya...).
// Within this margin of the closest entry, prefer the most populous city so a
// photo in central Tokyo resolves to "Tokyo", not a ward — but small enough that
// Nara doesn't get swallowed by Osaka.
const METRO_MARGIN_KM = 10;

/** Dataset city best describing a GPS point, or undefined if none is within `maxKm`. */
export async function findNearestCity(
  lat: number,
  lng: number,
  maxKm = 150,
): Promise<NearestCity | undefined> {
  const CITIES = await loadCities();

  const near: { c: CityEntry; d: number }[] = [];
  let nearestDist = Infinity;
  for (const c of CITIES) {
    // cheap latitude prefilter before the trig
    if (Math.abs(c.lat - lat) > 3) continue;
    const d = haversineKm(lat, lng, c.lat, c.lng);
    near.push({ c, d });
    if (d < nearestDist) nearestDist = d;
  }
  if (nearestDist > maxKm) return undefined;

  let pick: { c: CityEntry; d: number } | undefined;
  for (const cand of near) {
    if (cand.d > nearestDist + METRO_MARGIN_KM) continue;
    if (!pick || cand.c.pop > pick.c.pop || (cand.c.pop === pick.c.pop && cand.d < pick.d)) {
      pick = cand;
    }
  }
  if (!pick) return undefined;
  const best = pick.c;
  const bestDist = pick.d;
  return {
    city: best.city,
    country: TERRITORY_PARENT[best.country] ?? best.country,
    label: cityLabelKR(best.city, best.country),
    lat: best.lat,
    lng: best.lng,
    distKm: bestDist,
  };
}
