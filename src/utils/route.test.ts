import { describe, expect, it } from "vitest";
import { DWELL, buildStops, easeInOut, lerpStops, playbackFrame, routeDistanceKm, segmentMs, type RoutePhoto } from "./route";

const photo = (id: string, takenAt: number, lat: number, lng: number, dayNumber = 1): RoutePhoto => ({
  id,
  takenAt,
  lat,
  lng,
  dayNumber,
});

describe("buildStops", () => {
  it("merges a burst of photos taken at one spot into a single stop", () => {
    const stops = buildStops([
      photo("a", 1, 37.5, 127.0),
      photo("b", 2, 37.50005, 127.00005), // a few metres away
      photo("c", 3, 37.5001, 127.0001),
    ]);
    expect(stops).toHaveLength(1);
    expect(stops[0].photoIds).toEqual(["a", "b", "c"]);
  });

  it("starts a new stop when the photographer moves on", () => {
    const stops = buildStops([photo("a", 1, 37.5, 127.0), photo("b", 2, 37.52, 127.0)]); // ~2.2 km apart
    expect(stops.map((s) => s.photoIds)).toEqual([["a"], ["b"]]);
    expect(stops.map((s) => s.index)).toEqual([0, 1]);
  });

  it("does not merge across days even at the same place", () => {
    const stops = buildStops([photo("a", 1, 37.5, 127.0, 1), photo("b", 2, 37.5, 127.0, 2)]);
    expect(stops).toHaveLength(2);
    expect(stops.map((s) => s.dayNumber)).toEqual([1, 2]);
  });

  it("orders by time regardless of input order, without mutating the input", () => {
    const input = [photo("late", 50, 37.6, 127.0), photo("early", 10, 37.5, 127.0)];
    const stops = buildStops(input);
    expect(stops.map((s) => s.photoIds[0])).toEqual(["early", "late"]);
    expect(input.map((p) => p.id)).toEqual(["late", "early"]);
  });

  it("returns no stops for no photos", () => {
    expect(buildStops([])).toEqual([]);
  });
});

describe("routeDistanceKm", () => {
  it("measures the straight-line length of the route (Seoul to Busan is about 325 km)", () => {
    const stops = buildStops([photo("s", 1, 37.5665, 126.978), photo("b", 2, 35.1796, 129.0756)]);
    expect(routeDistanceKm(stops)).toBeGreaterThan(320);
    expect(routeDistanceKm(stops)).toBeLessThan(330);
  });

  it("is zero for fewer than two stops", () => {
    expect(routeDistanceKm([])).toBe(0);
  });
});

describe("playback", () => {
  const stops = buildStops([photo("a", 1, 0, 0), photo("b", 2, 0, 1), photo("c", 3, 0, 2)]);
  const seg = 1000;

  it("easeInOut pins its endpoints and midpoint", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
  });

  it("lerpStops interpolates linearly", () => {
    expect(lerpStops(stops[0], stops[1], 0.5)).toEqual({ lat: 0, lng: 0.5 });
  });

  it("segmentMs fits long routes in the target time and clamps the extremes", () => {
    expect(segmentMs(1)).toBe(0);
    expect(segmentMs(2)).toBe(1800); // one hop would be 16 s, capped
    expect(segmentMs(11)).toBe(1600);
    expect(segmentMs(1000)).toBe(500); // never faster than 500 ms a hop
  });

  it("returns no frame when there is nothing to travel", () => {
    expect(playbackFrame([stops[0]], 0, seg)).toBeNull();
    expect(playbackFrame(stops, 0, 0)).toBeNull();
  });

  it("rests on a stop first (dwell), then moves to the next", () => {
    const resting = playbackFrame(stops, seg * (DWELL / 2), seg)!;
    expect(resting.u).toBe(0);
    expect(resting.pos).toEqual({ lat: 0, lng: 0 });
    expect(resting.selectedIdx).toBe(0);

    const arriving = playbackFrame(stops, seg * 0.99, seg)!;
    expect(arriving.u).toBeGreaterThan(0.95);
    expect(arriving.selectedIdx).toBe(1); // the photos switch once past halfway
  });

  it("ends exactly on the last stop", () => {
    const end = playbackFrame(stops, seg * 5, seg)!; // well past the end
    expect(end.idx).toBe(1);
    expect(end.u).toBe(1);
    expect(end.pos).toEqual({ lat: 0, lng: 2 });
    expect(end.selectedIdx).toBe(2);
  });
});
