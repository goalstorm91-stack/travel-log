import { v4 as uuid } from "uuid";
import { db } from "../db";
import type { DayEntry } from "../types";
import { readPhotoMeta, toISODate } from "./exif";
import { findNearestCity, type NearestCity } from "./geocode";
import { renumberDays } from "./days";
import { prepareImageForStorage } from "./imageStore";
import { requestPersistentStorage } from "./storage";

export interface AnalyzedPhoto {
  file: File;
  date: string; // yyyy-MM-dd as written on the photo
  time: number;
  dateSource: "exif" | "file";
  lat?: number;
  lng?: number;
  place?: NearestCity;
}

/** Reads capture time + GPS for each file, returned in chronological order. */
export async function analyzePhotos(
  files: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<AnalyzedPhoto[]> {
  const out: AnalyzedPhoto[] = [];
  for (const file of files) {
    const meta = await readPhotoMeta(file, file.lastModified);
    out.push({
      file,
      date: toISODate(new Date(meta.takenAt)),
      time: meta.takenAt,
      dateSource: meta.dateSource,
      lat: meta.lat,
      lng: meta.lng,
    });
    onProgress?.(out.length, files.length);
  }
  return out.sort((a, b) => a.time - b.time);
}

/** Resolves the nearest known city for every geotagged photo (offline). */
export async function attachPlaces(photos: AnalyzedPhoto[]): Promise<void> {
  for (const p of photos) {
    if (p.lat != null && p.lng != null) {
      p.place = await findNearestCity(p.lat, p.lng);
    }
  }
}

/** The place most of the given photos were taken in. */
export function dominantPlace(photos: AnalyzedPhoto[]): NearestCity | undefined {
  const counts = new Map<string, { n: number; place: NearestCity }>();
  for (const p of photos) {
    if (!p.place) continue;
    const key = `${p.place.city}|${p.place.country}`;
    const entry = counts.get(key);
    if (entry) entry.n++;
    else counts.set(key, { n: 1, place: p.place });
  }
  let best: { n: number; place: NearestCity } | undefined;
  for (const entry of counts.values()) if (!best || entry.n > best.n) best = entry;
  return best?.place;
}

export function groupByDate(photos: AnalyzedPhoto[]): Map<string, AnalyzedPhoto[]> {
  const groups = new Map<string, AnalyzedPhoto[]>();
  for (const p of photos) {
    const list = groups.get(p.date);
    if (list) list.push(p);
    else groups.set(p.date, [p]);
  }
  return groups;
}

/**
 * Stores photos (with their capture time and GPS) into a trip, creating a Day
 * per date, filling each new Day's place from its photos, and renumbering.
 * Photos are converted/shrunk first (see prepareImageForStorage); ones that
 * can't be converted are skipped and counted in `failed`.
 * Returns the first stored photo (chronologically) for cover selection.
 */
export async function savePhotosToTrip(
  tripId: string,
  photos: AnalyzedPhoto[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ firstPhoto?: { id: string; blob: Blob }; saved: number; failed: number }> {
  void requestPersistentStorage(); // keep the browser from evicting the photos we are about to store
  const existingDays = await db.days.where("tripId").equals(tripId).toArray();
  const byDate = new Map(existingDays.map((d) => [d.date, d]));
  let firstPhoto: { id: string; blob: Blob } | undefined;
  let saved = 0;
  let failed = 0;
  let done = 0;

  for (const [date, dayPhotos] of groupByDate(photos)) {
    const ready: { p: AnalyzedPhoto; blob: Blob }[] = [];
    for (const p of dayPhotos) {
      try {
        ready.push({ p, blob: await prepareImageForStorage(p.file) });
      } catch {
        failed++;
      }
      onProgress?.(++done, photos.length);
    }
    if (ready.length === 0) continue; // don't create an empty Day

    let day = byDate.get(date);
    if (!day) {
      const now = Date.now();
      day = {
        id: uuid(),
        tripId,
        dayNumber: 0,
        date,
        title: "",
        photoIds: [],
        createdAt: now,
        updatedAt: now,
      } satisfies DayEntry;
      byDate.set(date, day);
    }

    for (const { p, blob } of ready) {
      const id = uuid();
      await db.photos.add({
        id,
        tripId,
        dayId: day.id,
        blob,
        createdAt: Date.now(),
        takenAt: p.time,
        lat: p.lat,
        lng: p.lng,
      });
      day.photoIds.push(id);
      saved++;
      firstPhoto ??= { id, blob };
    }

    if (!day.locationName) {
      const place = dominantPlace(ready.map((r) => r.p));
      if (place) day.locationName = place.label;
    }
    day.updatedAt = Date.now();
    await db.days.put(day);
  }

  await renumberDays(tripId);
  return { firstPhoto, saved, failed };
}

/** Downscaled JPEG copy for covers; falls back to the original if it can't be decoded. */
export async function makeThumbnail(blob: Blob, maxEdge = 1200): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(blob);
    const ratio = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * ratio);
    canvas.height = Math.round(bmp.height * ratio);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b ?? blob), "image/jpeg", 0.85),
    );
  } catch {
    return blob;
  }
}
