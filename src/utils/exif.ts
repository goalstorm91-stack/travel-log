import { parse, gps } from "exifr";

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

  return meta;
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
