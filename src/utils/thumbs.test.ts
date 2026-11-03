import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db";
import { getThumb, pruneOrphanThumbs } from "./thumbs";
import { clearAllData } from "./backup";
import { makePhotoBlob } from "../test/factories";

beforeEach(async () => {
  await clearAllData();
});

describe("thumbnails", () => {
  it("returns a saved thumbnail without touching the full photo", async () => {
    const thumb = makePhotoBlob(9);
    await db.thumbs.put({ id: "p1", blob: thumb });
    const got = await getThumb("p1");
    expect(got?.size).toBe(thumb.size);
  });

  it("resolves to null when the photo itself no longer exists", async () => {
    expect(await getThumb("missing")).toBeNull();
  });

  it("removes thumbnails whose photo was deleted, and only those", async () => {
    await db.photos.put({ id: "keep", tripId: "t1", dayId: "d1", blob: makePhotoBlob(1), createdAt: 1 });
    await db.thumbs.bulkPut([
      { id: "keep", blob: makePhotoBlob(2) },
      { id: "orphan-1", blob: makePhotoBlob(3) },
      { id: "orphan-2", blob: makePhotoBlob(4) },
    ]);

    expect(await pruneOrphanThumbs()).toBe(2);
    expect(await db.thumbs.toCollection().primaryKeys()).toEqual(["keep"]);
    expect(await pruneOrphanThumbs()).toBe(0); // nothing left to do
  });
});
