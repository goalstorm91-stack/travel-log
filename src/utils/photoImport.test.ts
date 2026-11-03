import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db";
import { dominantPlace, groupByDate, type AnalyzedPhoto } from "./photoImport";
import { renumberDays } from "./days";
import { clearAllData } from "./backup";
import { makeDay, makeTrip } from "../test/factories";
import type { NearestCity } from "./geocode";

const place = (city: string, country = "Japan"): NearestCity => ({ city, country, label: city, lat: 0, lng: 0, distKm: 0 });
const shot = (date: string, p?: NearestCity): AnalyzedPhoto => ({
  file: new File(["x"], `${date}.jpg`),
  date,
  time: Date.parse(date),
  dateSource: "exif",
  place: p,
});

describe("dominantPlace", () => {
  it("picks the place where most photos were taken", () => {
    const result = dominantPlace([shot("2026-01-01", place("Tokyo")), shot("2026-01-01", place("Osaka")), shot("2026-01-02", place("Tokyo"))]);
    expect(result?.city).toBe("Tokyo");
  });

  it("tells same-named cities in different countries apart", () => {
    const result = dominantPlace([
      shot("2026-01-01", place("Victoria", "Canada")),
      shot("2026-01-01", place("Victoria", "Seychelles")),
      shot("2026-01-01", place("Victoria", "Seychelles")),
    ]);
    expect(result?.country).toBe("Seychelles");
  });

  it("ignores photos without a place, and returns undefined when none have one", () => {
    expect(dominantPlace([shot("2026-01-01"), shot("2026-01-02", place("Kyoto"))])?.city).toBe("Kyoto");
    expect(dominantPlace([shot("2026-01-01")])).toBeUndefined();
    expect(dominantPlace([])).toBeUndefined();
  });
});

describe("groupByDate", () => {
  it("groups photos by the date written on them, keeping order within a day", () => {
    const a = shot("2026-01-01");
    const b = shot("2026-01-02");
    const c = shot("2026-01-01");
    const groups = groupByDate([a, b, c]);
    expect([...groups.keys()]).toEqual(["2026-01-01", "2026-01-02"]);
    expect(groups.get("2026-01-01")).toEqual([a, c]);
    expect(groups.get("2026-01-02")).toEqual([b]);
  });
});

describe("renumberDays", () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it("renumbers a trip's days 1..N in date order and leaves other trips alone", async () => {
    await db.trips.bulkPut([makeTrip(), makeTrip({ id: "t2" })]);
    await db.days.bulkPut([
      makeDay({ id: "late", date: "2026-10-02", dayNumber: 7 }),
      makeDay({ id: "early", date: "2026-09-30", dayNumber: 9 }),
      makeDay({ id: "mid", date: "2026-10-01", dayNumber: 3 }),
      makeDay({ id: "other", tripId: "t2", date: "2026-05-05", dayNumber: 42 }),
    ]);

    await renumberDays("t1");

    const byId = Object.fromEntries((await db.days.toArray()).map((d) => [d.id, d.dayNumber]));
    expect(byId).toEqual({ early: 1, mid: 2, late: 3, other: 42 });
  });
});
