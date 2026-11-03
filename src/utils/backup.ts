import { db } from "../db";
import type { Trip, DayEntry, Expense } from "../types";
import { currentFingerprint, markBackedUp, type Fingerprint } from "./backupStatus";

// Backup format v2 is a plain .zip: `backup.json` (records) + `photos/<id>.jpg` (the
// photos as ordinary files). Photos are streamed in one at a time, so a few hundred of
// them no longer have to fit in memory as one giant base64 string, and the files can be
// opened with any unzip tool. Format v1 (one JSON file with base64 photos) is still
// accepted on import.

const SCHEMA = "travel-journal-backup";
const VERSION = 2;

interface PhotoMeta {
  id: string;
  tripId: string;
  dayId: string;
  createdAt: number;
  takenAt?: number;
  lat?: number;
  lng?: number;
  file?: string; // v2: path inside the zip
  type?: string; // v2: MIME type
  data?: string; // v1: data URL
}

interface Manifest {
  schema: string;
  version: number;
  exportedAt: string;
  scope: "all" | "trip";
  trips: Trip[];
  days: DayEntry[];
  expenses: Expense[];
  photos: PhotoMeta[];
}

export interface BackupSummary {
  trips: number;
  days: number;
  expenses: number;
  photos: number;
  /** items that could not be restored (missing photo files, dangling references) */
  skipped: number;
}

export interface BuiltBackup {
  blob: Blob;
  filename: string;
  summary: BackupSummary;
  scope: "all" | "trip";
  fingerprint: Fingerprint;
}

type Progress = (done: number, total: number) => void;

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic" };

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

function safeName(s: string) {
  return s.replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "trip";
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** Packs everything (or a single trip) into a zip, without holding all photos in memory at once. */
export async function buildBackup(opts: { tripId?: string; onProgress?: Progress } = {}): Promise<BuiltBackup> {
  const { tripId, onProgress } = opts;
  const { Zip, ZipPassThrough, ZipDeflate, strToU8 } = await import("fflate");

  const [trips, days, expenses, photoIds, fingerprint] = await Promise.all([
    tripId ? db.trips.where("id").equals(tripId).toArray() : db.trips.toArray(),
    tripId ? db.days.where("tripId").equals(tripId).toArray() : db.days.toArray(),
    tripId ? db.expenses.where("tripId").equals(tripId).toArray() : db.expenses.toArray(),
    (tripId ? db.photos.where("tripId").equals(tripId) : db.photos.toCollection()).primaryKeys(),
    currentFingerprint(),
  ]);
  if (tripId && trips.length === 0) throw new Error("여행을 찾을 수 없어요.");

  const parts: Uint8Array[] = [];
  const state: { error: Error | null } = { error: null };
  const zip = new Zip((err, chunk) => {
    if (err) state.error = err;
    else parts.push(chunk);
  });

  const metas: PhotoMeta[] = [];
  let done = 0;
  onProgress?.(0, photoIds.length);
  for (const id of photoIds) {
    const p = await db.photos.get(id as string);
    if (p) {
      const type = p.blob.type || "image/jpeg";
      const file = `photos/${p.id}.${EXT[type] ?? "bin"}`;
      const entry = new ZipPassThrough(file); // JPEGs are already compressed
      zip.add(entry);
      entry.push(new Uint8Array(await p.blob.arrayBuffer()), true);
      metas.push({
        id: p.id,
        tripId: p.tripId,
        dayId: p.dayId,
        createdAt: p.createdAt,
        takenAt: p.takenAt,
        lat: p.lat,
        lng: p.lng,
        file,
        type,
      });
    }
    done++;
    onProgress?.(done, photoIds.length);
    if (done % 8 === 0) await tick(); // let the progress text repaint
  }

  const manifest: Manifest = {
    schema: SCHEMA,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    scope: tripId ? "trip" : "all",
    trips,
    days,
    expenses,
    photos: metas,
  };
  const json = new ZipDeflate("backup.json", { level: 6 });
  zip.add(json);
  json.push(strToU8(JSON.stringify(manifest)), true);
  zip.end();
  if (state.error) throw state.error;

  const blob = new Blob(parts as BlobPart[], { type: "application/zip" });
  const filename = tripId
    ? `travel-journal-${safeName(trips[0].title)}-${stamp()}.zip`
    : `travel-journal-backup-${stamp()}.zip`;

  return {
    blob,
    filename,
    scope: manifest.scope,
    fingerprint,
    summary: { trips: trips.length, days: days.length, expenses: expenses.length, photos: metas.length, skipped: 0 },
  };
}

export type DeliverResult = "shared" | "downloaded" | "cancelled";

/**
 * Hands the file to the phone's share sheet (so it can go to Files / iCloud / Drive /
 * KakaoTalk) when the browser can share it, otherwise downloads it. A full backup is
 * only recorded as "done" once the file actually left the app.
 */
export async function deliverBackup(built: BuiltBackup): Promise<DeliverResult> {
  const file = new File([built.blob], built.filename, { type: "application/zip" });
  let result: DeliverResult | null = null;

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "여행 기록 백업" });
      result = "shared";
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return "cancelled";
      // sharing failed for another reason — fall back to a plain download
    }
  }

  if (!result) {
    const url = URL.createObjectURL(built.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = built.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    result = "downloaded";
  }

  if (built.scope === "all") markBackedUp(built.fingerprint);
  return result;
}

// ---------------------------------------------------------------- restore

export interface ParsedBackup {
  version: number;
  exportedAt: string;
  trips: Trip[];
  days: DayEntry[];
  expenses: Expense[];
  photos: { id: string; tripId: string; dayId: string; createdAt: number; takenAt?: number; lat?: number; lng?: number; blob: Blob }[];
  skipped: number;
}

const BAD_FILE = "올바른 백업 파일이 아니에요. 이 앱에서 내보낸 .zip 파일(또는 예전 .json 파일)을 골라 주세요.";

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function validateManifest(raw: unknown): Manifest {
  if (!isObj(raw) || raw.schema !== SCHEMA) throw new Error("이 앱의 백업 파일이 아니에요.");
  if (typeof raw.version !== "number" || raw.version > VERSION) {
    throw new Error("더 새로운 버전의 앱에서 만든 백업이에요. 앱을 새로고침해서 최신 버전으로 연 뒤 다시 시도해 주세요.");
  }
  for (const key of ["trips", "days", "expenses", "photos"] as const) {
    if (raw[key] != null && !Array.isArray(raw[key])) throw new Error(BAD_FILE);
  }
  const trips = (raw.trips ?? []) as Trip[];
  const days = (raw.days ?? []) as DayEntry[];
  const expenses = (raw.expenses ?? []) as Expense[];
  const okTrip = (t: unknown) => isObj(t) && typeof t.id === "string" && typeof t.title === "string" && Array.isArray(t.companions);
  const okDay = (d: unknown) => isObj(d) && typeof d.id === "string" && typeof d.tripId === "string" && Array.isArray(d.photoIds);
  const okExp = (e: unknown) => isObj(e) && typeof e.id === "string" && typeof e.tripId === "string" && typeof e.amount === "number" && Array.isArray(e.participants);
  if (!trips.every(okTrip) || !days.every(okDay) || !expenses.every(okExp)) throw new Error(BAD_FILE);
  return raw as unknown as Manifest;
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

/** Reads and checks a backup file without touching the database. */
export async function readBackup(file: File): Promise<ParsedBackup> {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  const isZip = head[0] === 0x50 && head[1] === 0x4b; // "PK"

  let manifest: Manifest;
  const photos: ParsedBackup["photos"] = [];
  let skipped = 0;

  if (isZip) {
    const { unzip, strFromU8 } = await import("fflate");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) =>
      unzip(bytes, (err, data) => (err ? reject(new Error(BAD_FILE)) : resolve(data))),
    );
    const json = files["backup.json"];
    if (!json) throw new Error(BAD_FILE);
    try {
      manifest = validateManifest(JSON.parse(strFromU8(json)));
    } catch (err) {
      throw err instanceof SyntaxError ? new Error(BAD_FILE) : err;
    }
    for (const m of manifest.photos) {
      const data = m.file ? files[m.file] : undefined;
      if (!data || typeof m.id !== "string") {
        skipped++;
        continue;
      }
      photos.push({ ...pickPhoto(m), blob: new Blob([data as BlobPart], { type: m.type || "image/jpeg" }) });
    }
  } else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      throw new Error(BAD_FILE);
    }
    manifest = validateManifest(parsed);
    for (const m of manifest.photos) {
      if (!m.data || typeof m.id !== "string") {
        skipped++;
        continue;
      }
      photos.push({ ...pickPhoto(m), blob: await dataUrlToBlob(m.data) });
    }
  }

  return {
    version: manifest.version,
    exportedAt: manifest.exportedAt,
    trips: manifest.trips ?? [],
    days: manifest.days ?? [],
    expenses: manifest.expenses ?? [],
    photos,
    skipped,
  };
}

function pickPhoto(m: PhotoMeta) {
  return { id: m.id, tripId: m.tripId, dayId: m.dayId, createdAt: m.createdAt, takenAt: m.takenAt, lat: m.lat, lng: m.lng };
}

/** Writes a checked backup into the database, repairing references to photos that aren't there. */
export async function applyBackup(b: ParsedBackup): Promise<BackupSummary> {
  const tripIds = new Set(b.trips.map((t) => t.id));
  const photos = b.photos.filter((p) => {
    if (tripIds.has(p.tripId)) return true;
    b.skipped++;
    return false;
  });

  const available = new Set<string>(photos.map((p) => p.id));
  for (const key of await db.photos.toCollection().primaryKeys()) available.add(key as string);

  let skipped = b.skipped;
  const days = b.days.map((d) => {
    const kept = d.photoIds.filter((id) => available.has(id));
    skipped += d.photoIds.length - kept.length;
    return kept.length === d.photoIds.length ? d : { ...d, photoIds: kept };
  });
  const trips = b.trips.map((t) => (t.coverPhotoId && !available.has(t.coverPhotoId) ? { ...t, coverPhotoId: undefined } : t));

  await db.transaction("rw", db.trips, db.days, db.expenses, db.photos, async () => {
    if (trips.length) await db.trips.bulkPut(trips);
    if (days.length) await db.days.bulkPut(days);
    if (b.expenses.length) await db.expenses.bulkPut(b.expenses);
    if (photos.length) await db.photos.bulkPut(photos);
  });

  return { trips: trips.length, days: days.length, expenses: b.expenses.length, photos: photos.length, skipped };
}

/**
 * Restores a backup. `confirmFn` sees what the file contains before anything is written;
 * return false there to cancel (the call then resolves to null).
 */
export async function importBackup(
  file: File,
  confirmFn?: (info: { exportedAt: string; trips: number; days: number; expenses: number; photos: number }) => boolean | Promise<boolean>,
): Promise<BackupSummary | null> {
  const parsed = await readBackup(file);
  if (confirmFn) {
    const ok = await confirmFn({
      exportedAt: parsed.exportedAt,
      trips: parsed.trips.length,
      days: parsed.days.length,
      expenses: parsed.expenses.length,
      photos: parsed.photos.length,
    });
    if (!ok) return null;
  }
  return applyBackup(parsed);
}

export async function clearAllData(): Promise<void> {
  await db.transaction("rw", db.trips, db.days, db.expenses, db.photos, async () => {
    await db.trips.clear();
    await db.days.clear();
    await db.expenses.clear();
    await db.photos.clear();
  });
}
