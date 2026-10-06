import { haversineKm } from "./geocode";

export interface RoutePhoto {
  id: string;
  dayNumber: number;
  takenAt: number;
  lat: number;
  lng: number;
}

export interface Stop {
  index: number;
  lat: number;
  lng: number;
  dayNumber: number;
  takenAt: number; // time of the first photo at this stop
  photoIds: string[];
}

/**
 * Turns geotagged photos into route stops. Consecutive photos taken within
 * `mergeMeters` of the stop's first photo (and on the same day) share a stop,
 * so a burst of shots at one spot doesn't produce a pile of overlapping pins.
 */
export function buildStops(photos: RoutePhoto[], mergeMeters = 150): Stop[] {
  const sorted = [...photos].sort((a, b) => a.takenAt - b.takenAt);
  const stops: Stop[] = [];
  let current: Stop | null = null;
  let sumLat = 0;
  let sumLng = 0;

  for (const p of sorted) {
    if (
      current &&
      current.dayNumber === p.dayNumber &&
      haversineKm(current.lat, current.lng, p.lat, p.lng) * 1000 <= mergeMeters
    ) {
      current.photoIds.push(p.id);
      sumLat += p.lat;
      sumLng += p.lng;
      current.lat = sumLat / current.photoIds.length;
      current.lng = sumLng / current.photoIds.length;
    } else {
      current = {
        index: stops.length,
        lat: p.lat,
        lng: p.lng,
        dayNumber: p.dayNumber,
        takenAt: p.takenAt,
        photoIds: [p.id],
      };
      sumLat = p.lat;
      sumLng = p.lng;
      stops.push(current);
    }
  }
  return stops;
}

export function routeDistanceKm(stops: Stop[]): number {
  let total = 0;
  for (let i = 1; i < stops.length; i++) {
    total += haversineKm(stops[i - 1].lat, stops[i - 1].lng, stops[i].lat, stops[i].lng);
  }
  return total;
}

/** Position between stop `i` and `i+1` at `u` in [0,1]. */
export function lerpStops(a: Stop, b: Stop, u: number): { lat: number; lng: number } {
  return { lat: a.lat + (b.lat - a.lat) * u, lng: a.lng + (b.lng - a.lng) * u };
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
