import { db } from "../db";
import type { Trip, DayEntry, Expense } from "../types";

const SCHEMA = "travel-journal-backup";
const VERSION = 1;

interface BackupPhoto {
  id: string;
  tripId: string;
  dayId: string;
  createdAt: number;
  takenAt?: number;
  lat?: number;
  lng?: number;
  data: string; // data URL
}

interface BackupFile {
  schema: string;
  version: number;
  exportedAt: string;
  trips: Trip[];
  days: DayEntry[];
  expenses: Expense[];
  photos: BackupPhoto[];
}

export interface BackupSummary {
  trips: number;
  days: number;
  expenses: number;
  photos: number;
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function dataURLToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

export async function exportBackup(): Promise<BackupSummary> {
  const [trips, days, expenses, photos] = await Promise.all([
    db.trips.toArray(),
    db.days.toArray(),
    db.expenses.toArray(),
    db.photos.toArray(),
  ]);

  const photoRecords: BackupPhoto[] = await Promise.all(
    photos.map(async (p) => ({
      id: p.id,
      tripId: p.tripId,
      dayId: p.dayId,
      createdAt: p.createdAt,
      takenAt: p.takenAt,
      lat: p.lat,
      lng: p.lng,
      data: await blobToDataURL(p.blob),
    })),
  );

  const backup: BackupFile = {
    schema: SCHEMA,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    trips,
    days,
    expenses,
    photos: photoRecords,
  };

  const json = JSON.stringify(backup);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `travel-journal-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  return {
    trips: trips.length,
    days: days.length,
    expenses: expenses.length,
    photos: photoRecords.length,
  };
}

export async function importBackup(file: File): Promise<BackupSummary> {
  const text = await file.text();
  let backup: BackupFile;
  try {
    backup = JSON.parse(text);
  } catch {
    throw new Error("파일을 읽을 수 없어요. 올바른 백업 파일인지 확인해주세요.");
  }
  if (backup.schema !== SCHEMA) {
    throw new Error("이 앱의 백업 파일이 아니에요.");
  }

  const photoRecords = await Promise.all(
    (backup.photos ?? []).map(async (p) => ({
      id: p.id,
      tripId: p.tripId,
      dayId: p.dayId,
      createdAt: p.createdAt,
      takenAt: p.takenAt,
      lat: p.lat,
      lng: p.lng,
      blob: await dataURLToBlob(p.data),
    })),
  );

  await db.transaction("rw", db.trips, db.days, db.expenses, db.photos, async () => {
    if (backup.trips?.length) await db.trips.bulkPut(backup.trips);
    if (backup.days?.length) await db.days.bulkPut(backup.days);
    if (backup.expenses?.length) await db.expenses.bulkPut(backup.expenses);
    if (photoRecords.length) await db.photos.bulkPut(photoRecords);
  });

  return {
    trips: backup.trips?.length ?? 0,
    days: backup.days?.length ?? 0,
    expenses: backup.expenses?.length ?? 0,
    photos: photoRecords.length,
  };
}

export async function clearAllData(): Promise<void> {
  await db.transaction("rw", db.trips, db.days, db.expenses, db.photos, async () => {
    await db.trips.clear();
    await db.days.clear();
    await db.expenses.clear();
    await db.photos.clear();
  });
}
