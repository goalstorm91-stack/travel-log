import { db } from "../db";

// "Do I need a backup?" bookkeeping. It lives in localStorage on purpose: it describes
// this device's last export, so it must not travel inside (or be restored from) a backup.

const KEY = "last-backup";
const SNOOZE_KEY = "backup-reminder-snooze-until";
const DAY = 24 * 60 * 60 * 1000;
const STALE_AFTER_DAYS = 7;
const SNOOZE_DAYS = 3;

/** What the data looked like when it was last exported. */
export interface Fingerprint {
  trips: number;
  days: number;
  expenses: number;
  photos: number;
  latest: number; // newest edit time we can see (ms)
}

interface Stored {
  at: number;
  fp: Fingerprint;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // private mode: the reminder just can't remember
  }
}

export async function currentFingerprint(): Promise<Fingerprint> {
  const [trips, days, expenses, photos] = await Promise.all([
    db.trips.toArray(),
    db.days.toArray(),
    db.expenses.count(),
    db.photos.count(),
  ]);
  const latest = Math.max(
    0,
    ...days.map((d) => d.updatedAt),
    ...trips.map((t) => t.createdAt),
  );
  return { trips: trips.length, days: days.length, expenses, photos, latest };
}

export function markBackedUp(fp: Fingerprint) {
  write(KEY, { at: Date.now(), fp } satisfies Stored);
  try {
    localStorage.removeItem(SNOOZE_KEY);
  } catch {
    // ignore
  }
}

export function snoozeReminder() {
  write(SNOOZE_KEY, Date.now() + SNOOZE_DAYS * DAY);
}

export interface BackupStatus {
  /** none: nothing to protect · ok: up to date · never: no backup yet · stale: changes since an old backup */
  level: "none" | "ok" | "never" | "stale";
  lastAt: number | null;
  ageDays: number | null;
  /** how much was added since the last backup (never negative) */
  added: { trips: number; days: number; expenses: number; photos: number };
  edited: boolean;
  snoozed: boolean;
}

export async function getBackupStatus(now = Date.now()): Promise<BackupStatus> {
  const fp = await currentFingerprint();
  const last = read<Stored>(KEY);
  const snoozeUntil = read<number>(SNOOZE_KEY);
  const snoozed = snoozeUntil != null && snoozeUntil > now;

  const added = {
    trips: Math.max(0, fp.trips - (last?.fp.trips ?? 0)),
    days: Math.max(0, fp.days - (last?.fp.days ?? 0)),
    expenses: Math.max(0, fp.expenses - (last?.fp.expenses ?? 0)),
    photos: Math.max(0, fp.photos - (last?.fp.photos ?? 0)),
  };
  const countsChanged =
    !!last && (fp.trips !== last.fp.trips || fp.days !== last.fp.days || fp.expenses !== last.fp.expenses || fp.photos !== last.fp.photos);
  const edited = !!last && fp.latest > last.fp.latest;
  const ageDays = last ? Math.floor((now - last.at) / DAY) : null;

  let level: BackupStatus["level"];
  if (fp.trips === 0) level = "none";
  else if (!last) level = "never";
  else if ((countsChanged || edited) && ageDays! >= STALE_AFTER_DAYS) level = "stale";
  else level = "ok";

  return { level, lastAt: last?.at ?? null, ageDays, added, edited, snoozed };
}

/** "백업 뒤 새로 생긴 것: 사진 8장 · 하루 기록 2개" — empty when nothing changed. */
export function describeChanges(s: BackupStatus): string {
  const parts: string[] = [];
  if (s.added.trips) parts.push(`여행 ${s.added.trips}개`);
  if (s.added.days) parts.push(`하루 기록 ${s.added.days}개`);
  if (s.added.expenses) parts.push(`지출 ${s.added.expenses}건`);
  if (s.added.photos) parts.push(`사진 ${s.added.photos}장`);
  if (parts.length > 0) return `백업 뒤 새로 생긴 것: ${parts.join(" · ")}`;
  return s.edited ? "백업 뒤 고친 기록이 있어요" : "";
}
