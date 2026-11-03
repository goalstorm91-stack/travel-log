import { describe, expect, it } from "vitest";
import { findCityCoords, findNearestCity, haversineKm } from "./geocode";

describe("haversineKm", () => {
  it("is zero for the same point and symmetric", () => {
    expect(haversineKm(37.5, 127, 37.5, 127)).toBe(0);
    const ab = haversineKm(37.5665, 126.978, 35.1796, 129.0756);
    expect(haversineKm(35.1796, 129.0756, 37.5665, 126.978)).toBeCloseTo(ab, 9);
  });

  it("matches known distances", () => {
    expect(haversineKm(37.5665, 126.978, 35.1796, 129.0756)).toBeGreaterThan(320); // Seoul - Busan
    expect(haversineKm(37.5665, 126.978, 35.1796, 129.0756)).toBeLessThan(330);
    expect(haversineKm(0, 0, 0, 180)).toBeCloseTo(Math.PI * 6371, 0); // half the globe
  });
});

describe("findNearestCity", () => {
  it("resolves central Tokyo to Tokyo rather than a ward such as Shinjuku", async () => {
    const place = await findNearestCity(35.6938, 139.7036); // Shinjuku station
    expect(place?.city).toBe("Tokyo");
    expect(place?.country).toBe("Japan");
  });

  it("does not let a big neighbour swallow a nearby city (Nara vs Osaka)", async () => {
    const place = await findNearestCity(34.6851, 135.8048); // Nara
    expect(place?.city).toBe("Nara");
  });

  it("returns undefined in the middle of the ocean", async () => {
    expect(await findNearestCity(0, -140)).toBeUndefined();
  });

  it("gives a Korean label for well-known cities", async () => {
    const place = await findNearestCity(37.5665, 126.978);
    expect(place?.label).toBe("서울");
  });
});

describe("findCityCoords", () => {
  it("finds a city by its Korean alias", async () => {
    const coords = await findCityCoords("도쿄", "Japan");
    expect(coords?.lat).toBeCloseTo(35.69, 0);
    expect(coords?.lng).toBeCloseTo(139.69, 0);
  });

  it("finds a city by its English name within the country", async () => {
    const coords = await findCityCoords("Bangkok", "Thailand");
    expect(coords?.lat).toBeCloseTo(13.75, 0);
  });

  it("returns undefined for a place that does not exist", async () => {
    expect(await findCityCoords("Qwertyuiopville", "Japan")).toBeUndefined();
  });
});
