import { parse } from "exifr";

/**
 * Resolves the moment a photo was taken: EXIF DateTimeOriginal/CreateDate
 * when available, otherwise falls back to the file's last-modified time.
 */
export async function getCaptureMoment(file: File): Promise<Date> {
  try {
    const exif = await parse(file, ["DateTimeOriginal", "CreateDate"]);
    const d: Date | undefined = exif?.DateTimeOriginal ?? exif?.CreateDate;
    if (d instanceof Date && !isNaN(d.getTime())) return d;
  } catch {
    // not a JPEG / no EXIF data — fall through to lastModified
  }
  return new Date(file.lastModified);
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
