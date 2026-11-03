import { beforeEach, describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { db } from "../db";
import { applyBackup, buildBackup, clearAllData, importBackup, readBackup } from "./backup";
import { makeDay, makeExpense, makePhotoBlob, makeTrip } from "../test/factories";

async function seed() {
  await db.trips.bulkPut([makeTrip(), makeTrip({ id: "t2", title: "방콕 여행", coverPhotoId: "p4" })]);
  await db.days.bulkPut([
    makeDay({ photoIds: ["p1", "p2", "p3"] }),
    makeDay({ id: "d2", tripId: "t2", photoIds: ["p4"] }),
  ]);
  await db.expenses.bulkPut([makeExpense(), makeExpense({ id: "e2", tripId: "t2" })]);
  await db.photos.bulkPut(
    ["p1", "p2", "p3", "p4"].map((id, i) => ({
      id,
      tripId: i < 3 ? "t1" : "t2",
      dayId: i < 3 ? "d1" : "d2",
      blob: makePhotoBlob(i * 10),
      createdAt: i,
      takenAt: 1_000 + i,
      lat: 33.5,
      lng: 126.5,
    })),
  );
}

const asFile = (blob: Blob, name = "backup.zip") => new File([blob], name);
const counts = async () => [await db.trips.count(), await db.days.count(), await db.expenses.count(), await db.photos.count()];
const bytes = async (id: string) => new Uint8Array(await (await db.photos.get(id))!.blob.arrayBuffer());

beforeEach(async () => {
  await clearAllData();
  await db.thumbs.clear();
});

describe("backup round trip", () => {
  it("packs records and photos into a zip with photos as plain files", async () => {
    await seed();
    const progress: string[] = [];
    const built = await buildBackup({ onProgress: (d, t) => progress.push(`${d}/${t}`) });

    expect(built.summary).toEqual({ trips: 2, days: 2, expenses: 2, photos: 4, skipped: 0 });
    expect(built.scope).toBe("all");
    expect(built.filename).toMatch(/^travel-journal-backup-\d{4}-\d{2}-\d{2}\.zip$/);
    expect(progress.at(0)).toBe("0/4");
    expect(progress.at(-1)).toBe("4/4");

    const files = unzipSync(new Uint8Array(await built.blob.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(["backup.json", "photos/p1.jpg", "photos/p2.jpg", "photos/p3.jpg", "photos/p4.jpg"]);
    const manifest = JSON.parse(strFromU8(files["backup.json"]));
    expect(manifest).toMatchObject({ schema: "travel-journal-backup", version: 2, scope: "all" });
    expect(files["photos/p1.jpg"]).toEqual(await bytes("p1"));
  });

  it("restores everything identically after the data is wiped", async () => {
    await seed();
    const before = { trips: await db.trips.toArray(), days: await db.days.toArray(), expenses: await db.expenses.toArray(), p2: await bytes("p2") };
    const built = await buildBackup();

    await clearAllData();
    expect(await counts()).toEqual([0, 0, 0, 0]);

    const result = await importBackup(asFile(built.blob));
    expect(result).toEqual({ trips: 2, days: 2, expenses: 2, photos: 4, skipped: 0 });
    expect(await db.trips.toArray()).toEqual(before.trips);
    expect(await db.days.toArray()).toEqual(before.days);
    expect(await db.expenses.toArray()).toEqual(before.expenses);
    expect(await bytes("p2")).toEqual(before.p2);
    const meta = (await db.photos.get("p2"))!;
    expect(meta).toMatchObject({ takenAt: 1_001, lat: 33.5, lng: 126.5, tripId: "t1", dayId: "d1" });
    expect(meta.blob.type).toBe("image/jpeg");
  });

  it("exports a single trip with only its own records", async () => {
    await seed();
    const built = await buildBackup({ tripId: "t2" });
    expect(built.scope).toBe("trip");
    expect(built.summary).toEqual({ trips: 1, days: 1, expenses: 1, photos: 1, skipped: 0 });
    expect(built.filename).toContain("방콕-여행");

    const parsed = await readBackup(asFile(built.blob));
    expect(parsed.trips.map((t) => t.id)).toEqual(["t2"]);
    expect(parsed.photos.map((p) => p.id)).toEqual(["p4"]);
  });

  it("merges into existing data: same ids are overwritten, other data is kept", async () => {
    await seed();
    const built = await buildBackup({ tripId: "t1" });
    await db.trips.update("t1", { title: "고쳐 쓴 제목" });
    await db.trips.put(makeTrip({ id: "t3", title: "다른 여행" }));

    await importBackup(asFile(built.blob));
    expect((await db.trips.get("t1"))!.title).toBe("제주 여행"); // overwritten by the backup
    expect(await db.trips.get("t3")).toBeTruthy(); // untouched
  });

  it("lets the caller cancel after seeing what is inside, writing nothing", async () => {
    await seed();
    const built = await buildBackup();
    await clearAllData();

    let seen: unknown;
    const result = await importBackup(asFile(built.blob), (info) => {
      seen = info;
      return false;
    });
    expect(result).toBeNull();
    expect(seen).toMatchObject({ trips: 2, days: 2, expenses: 2, photos: 4 });
    expect(await counts()).toEqual([0, 0, 0, 0]);
  });

  it("drops stale thumbnails of restored photos so they are rebuilt", async () => {
    await seed();
    await db.thumbs.put({ id: "p1", blob: new Blob(["old"]) });
    const built = await buildBackup();
    await importBackup(asFile(built.blob));
    expect(await db.thumbs.get("p1")).toBeUndefined();
  });

  it("refuses to back up a trip that does not exist", async () => {
    await expect(buildBackup({ tripId: "nope" })).rejects.toThrow();
  });
});

describe("restore safety", () => {
  async function tamper(edit: (files: Record<string, Uint8Array>, manifest: any) => void) {
    await seed();
    const built = await buildBackup();
    const files = unzipSync(new Uint8Array(await built.blob.arrayBuffer()));
    const manifest = JSON.parse(strFromU8(files["backup.json"]));
    edit(files, manifest);
    files["backup.json"] = strToU8(JSON.stringify(manifest));
    await clearAllData();
    return asFile(new Blob([zipSync(files) as BlobPart]));
  }

  it("skips photos missing from the file and repairs the references to them", async () => {
    const file = await tamper((files, manifest) => {
      delete files["photos/p3.jpg"]; // listed in the manifest but absent
      manifest.trips[1].coverPhotoId = "p3"; // a cover pointing at the missing photo
    });
    const result = await importBackup(file);
    expect(result!.photos).toBe(3);
    expect(result!.skipped).toBeGreaterThanOrEqual(2); // the missing file + the dangling day reference
    expect((await db.days.get("d1"))!.photoIds).toEqual(["p1", "p2"]);
    expect((await db.trips.get("t2"))!.coverPhotoId).toBeUndefined();
  });

  it("ignores photos that belong to no trip in the file", async () => {
    const file = await tamper((_files, manifest) => {
      manifest.photos.push({ ...manifest.photos[0], id: "stray", tripId: "ghost", file: "photos/p1.jpg" });
    });
    const result = await importBackup(file);
    expect(result!.photos).toBe(4);
    expect(await db.photos.get("stray")).toBeUndefined();
  });

  it("rejects files that are not backups, with a readable reason", async () => {
    await expect(importBackup(new File(["PK not really a zip"], "x.zip"))).rejects.toThrow("올바른 백업 파일이 아니에요");
    await expect(importBackup(new File(["nope"], "x.json"))).rejects.toThrow("올바른 백업 파일이 아니에요");
    await expect(importBackup(new File(['{"hello":1}'], "x.json"))).rejects.toThrow("이 앱의 백업 파일이 아니에요");
    await expect(
      importBackup(new File([zipSync({ "other.txt": strToU8("hi") }) as BlobPart], "x.zip")),
    ).rejects.toThrow("올바른 백업 파일이 아니에요");
  });

  it("rejects backups from a newer app version", async () => {
    const future = { schema: "travel-journal-backup", version: 99, trips: [], days: [], expenses: [], photos: [] };
    await expect(importBackup(new File([JSON.stringify(future)], "future.json"))).rejects.toThrow("더 새로운 버전");
  });

  it("rejects malformed records instead of importing garbage", async () => {
    const bad = {
      schema: "travel-journal-backup",
      version: 2,
      trips: [{ id: "t1" }], // no title / companions
      days: [],
      expenses: [],
      photos: [],
    };
    await expect(importBackup(new File([JSON.stringify(bad)], "bad.json"))).rejects.toThrow("올바른 백업 파일이 아니에요");
    expect(await counts()).toEqual([0, 0, 0, 0]);
  });
});

describe("legacy v1 backups (one JSON file, photos as data URLs)", () => {
  it("still restore", async () => {
    const dataUrl = "data:image/jpeg;base64," + Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]).toString("base64");
    const v1 = {
      schema: "travel-journal-backup",
      version: 1,
      exportedAt: "2026-01-01T00:00:00.000Z",
      trips: [makeTrip()],
      days: [makeDay({ photoIds: ["p1"] })],
      expenses: [makeExpense()],
      photos: [{ id: "p1", tripId: "t1", dayId: "d1", createdAt: 1, data: dataUrl }],
    };
    const result = await importBackup(new File([JSON.stringify(v1)], "old.json"));
    expect(result).toEqual({ trips: 1, days: 1, expenses: 1, photos: 1, skipped: 0 });
    expect(Array.from(await bytes("p1"))).toEqual([0xff, 0xd8, 0xff, 1, 2, 3]);
  });
});

describe("applyBackup", () => {
  it("keeps references to photos that already exist on this device", async () => {
    await db.photos.put({ id: "local", tripId: "t1", dayId: "d1", blob: makePhotoBlob(1), createdAt: 1 });
    const result = await applyBackup({
      version: 2,
      exportedAt: "",
      trips: [makeTrip()],
      days: [makeDay({ photoIds: ["local", "gone"] })],
      expenses: [],
      photos: [],
      skipped: 0,
    });
    expect(result.skipped).toBe(1);
    expect((await db.days.get("d1"))!.photoIds).toEqual(["local"]);
  });
});
