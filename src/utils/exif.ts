import { parse, gps } from "exifr";
import { isHeic } from "./imageStore";

export interface PhotoMeta {
  takenAt: number;
  dateSource: "exif" | "file";
  lat?: number;
  lng?: number;
}

/**
 * Reads capture time and GPS from a photo. Capture time falls back to
 * `fallbackTime` (the file's last-modified time) when EXIF has none.
 */
export async function readPhotoMeta(file: Blob, fallbackTime: number): Promise<PhotoMeta> {
  const meta: PhotoMeta = { takenAt: fallbackTime, dateSource: "file" };

  try {
    const exif = await parse(file, ["DateTimeOriginal", "CreateDate"]);
    const d: Date | undefined = exif?.DateTimeOriginal ?? exif?.CreateDate;
    if (d instanceof Date && !isNaN(d.getTime())) {
      meta.takenAt = d.getTime();
      meta.dateSource = "exif";
    }
  } catch {
    // not a JPEG/HEIC with EXIF — keep the fallback time
  }

  try {
    const pos = await gps(file);
    if (
      pos &&
      Number.isFinite(pos.latitude) &&
      Number.isFinite(pos.longitude) &&
      // some cameras write 0,0 when they have no fix
      !(Math.abs(pos.latitude) < 0.0001 && Math.abs(pos.longitude) < 0.0001)
    ) {
      meta.lat = pos.latitude;
      meta.lng = pos.longitude;
    }
  } catch {
    // no GPS block
  }

  // Some HEIC writers lay out their boxes in a way exifr's HEIC reader can't walk,
  // even though the EXIF block itself is standard. Find that block directly.
  if (isHeic(file as File) && (meta.dateSource === "file" || meta.lat === undefined)) {
    await fillFromRawExif(file, meta);
  }

  return meta;
}

/** Offset of the TIFF header that follows an "Exif" + two NUL bytes marker, or -1. */
function findExifTiff(bytes: Uint8Array): number {
  const marker = [0x45, 0x78, 0x69, 0x66, 0, 0]; // "Exif", 0, 0
  outer: for (let i = 0; i <= bytes.length - 10; i++) {
    for (let j = 0; j < marker.length; j++) if (bytes[i + j] !== marker[j]) continue outer;
    const t = i + 6;
    const le = bytes[t] === 0x49 && bytes[t + 1] === 0x49 && bytes[t + 2] === 0x2a && bytes[t + 3] === 0;
    const be = bytes[t] === 0x4d && bytes[t + 1] === 0x4d && bytes[t + 2] === 0 && bytes[t + 3] === 0x2a;
    if (le || be) return t;
  }
  return -1;
}

async function fillFromRawExif(file: Blob, meta: PhotoMeta): Promise<void> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const at = findExifTiff(bytes);
    if (at < 0) return;
    const tiff = bytes.subarray(at);
    if (meta.dateSource === "file") {
      const exif = await parse(tiff, ["DateTimeOriginal", "CreateDate"]);
      const d: Date | undefined = exif?.DateTimeOriginal ?? exif?.CreateDate;
      if (d instanceof Date && !isNaN(d.getTime())) {
        meta.takenAt = d.getTime();
        meta.dateSource = "exif";
      }
    }
    if (meta.lat === undefined) {
      const pos = await gps(tiff);
      if (pos && Number.isFinite(pos.latitude) && Number.isFinite(pos.longitude)) {
        meta.lat = pos.latitude;
        meta.lng = pos.longitude;
      }
    }
  } catch {
    // leave whatever we already have
  }
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
