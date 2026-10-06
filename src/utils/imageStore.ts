import { getKeepOriginals } from "./settings";

/** Long edge photos are shrunk to before they're stored (unless the user keeps originals). */
export const MAX_STORED_EDGE = 1600;
const JPEG_QUALITY = 0.85;

export function isHeic(file: Blob & { name?: string }): boolean {
  if (/image\/(heic|heif)/i.test(file.type)) return true;
  return /\.(heic|heif)$/i.test(file.name ?? "");
}

async function heicToJpeg(file: Blob): Promise<Blob> {
  // ~1.3MB of WASM, only fetched when someone actually imports a HEIC photo.
  const { default: heic2any } = await import("heic2any");
  const out = await heic2any({ blob: file, toType: "image/jpeg", quality: JPEG_QUALITY });
  return Array.isArray(out) ? out[0] : out;
}

/**
 * Turns an imported photo into what we store: HEIC (which most browsers can't
 * display) becomes JPEG, and big photos are scaled down so the database and
 * backup files don't balloon. Capture time and GPS must already have been read
 * from the original — re-encoding drops EXIF.
 *
 * Throws only if a HEIC photo can't be converted.
 */
export async function prepareImageForStorage(file: File): Promise<Blob> {
  const heic = isHeic(file);
  if (getKeepOriginals() && !heic) return file;

  const source = heic ? await heicToJpeg(file) : file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source); // applies EXIF orientation
  } catch {
    return source; // a format we can't decode here — store it as it came
  }

  const longEdge = Math.max(bitmap.width, bitmap.height);
  const keep = getKeepOriginals();
  if (keep || longEdge <= MAX_STORED_EDGE) {
    bitmap.close();
    return source;
  }

  const ratio = MAX_STORED_EDGE / longEdge;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const scaled = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  return scaled ?? source;
}
