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

/** Share of each playback segment spent resting on a stop before moving on. */
export const DWELL = 0.35;

/** Time per stop-to-stop segment so a whole route plays in roughly `targetMs`. */
export function segmentMs(stopCount: number, targetMs = 16000): number {
  return stopCount > 1 ? Math.min(1800, Math.max(500, Math.round(targetMs / (stopCount - 1)))) : 0;
}

export interface PlaybackFrame {
  idx: number; // segment start stop
  u: number; // 0..1 progress travelling to the next stop
  pos: { lat: number; lng: number };
  selectedIdx: number; // stop whose photos to show
}

/** Where the playback marker is `elapsed` ms into the route. Shared by the page and the video export. */
export function playbackFrame(stops: Stop[], elapsed: number, segMs: number): PlaybackFrame | null {
  const n = stops.length;
  if (n < 2 || segMs <= 0) return null;
  const total = (n - 1) * segMs;
  const idx = Math.min(n - 2, Math.max(0, Math.floor(elapsed / segMs)));
  const f = elapsed >= total ? 1 : Math.max(0, (elapsed - idx * segMs) / segMs);
  const u = f < DWELL ? 0 : easeInOut((f - DWELL) / (1 - DWELL));
  return {
    idx,
    u,
    pos: lerpStops(stops[idx], stops[idx + 1], u),
    selectedIdx: u >= 0.5 ? idx + 1 : idx,
  };
}
