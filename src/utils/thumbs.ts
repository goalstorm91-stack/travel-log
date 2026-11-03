import { db } from "../db";

// Small copies of photos for grids and cards. A stored photo is up to 1600px wide; the
// browser has to decode it to a full bitmap (~8 MB each) even when it's drawn 80px wide,
// so a day with dozens of photos made the phone slow and memory-hungry. Thumbnails live
// in their own table (so reading one never drags the full photo along), are created the
// first time a photo is shown small, and are left out of backups (they're rebuilt).

export const THUMB_EDGE = 640; // enough for a half-width tile on a 3x phone screen
const THUMB_QUALITY = 0.8;
const MAX_PARALLEL = 2; // resizing many photos at once would spike memory

let running = 0;
const waiting: Array<() => void> = [];

async function limited<T>(job: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL) await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  try {
    return await job();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

async function resize(source: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(source);
  try {
    const ratio = Math.min(1, THUMB_EDGE / Math.max(bmp.width, bmp.height));
    if (ratio >= 1) return source; // already small: no need to re-encode
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * ratio);
    canvas.height = Math.round(bmp.height * ratio);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("thumb"))), "image/jpeg", THUMB_QUALITY),
    );
  } finally {
    bmp.close();
  }
}

const inflight = new Map<string, Promise<Blob | null>>();

/**
 * The thumbnail for a photo, building and saving it if it doesn't exist yet.
 * Resolves to null when the photo itself is gone; to the full photo if it can't be resized.
 */
export function getThumb(photoId: string): Promise<Blob | null> {
  const pending = inflight.get(photoId);
  if (pending) return pending;

  const job = (async () => {
    const cached = await db.thumbs.get(photoId);
    if (cached) return cached.blob;
    return limited(async () => {
      const photo = await db.photos.get(photoId);
      if (!photo) return null;
      let thumb: Blob;
      try {
        thumb = await resize(photo.blob);
      } catch {
        return photo.blob; // undecodable here: show the original, try again next time
      }
      // The photo may have been deleted while we were resizing; don't leave an orphan.
      if (await db.photos.get(photoId)) await db.thumbs.put({ id: photoId, blob: thumb });
      return thumb;
    });
  })().finally(() => inflight.delete(photoId));

  inflight.set(photoId, job);
  return job;
}

/** Drops thumbnails whose photo no longer exists (photos are deleted from many places). */
export async function pruneOrphanThumbs(): Promise<number> {
  const [thumbKeys, photoKeys] = await Promise.all([
    db.thumbs.toCollection().primaryKeys(),
    db.photos.toCollection().primaryKeys(),
  ]);
  const photos = new Set(photoKeys);
  const orphans = thumbKeys.filter((k) => !photos.has(k));
  if (orphans.length > 0) await db.thumbs.bulkDelete(orphans);
  return orphans.length;
}
