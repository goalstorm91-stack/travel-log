import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db";
import { currentFingerprint, describeChanges, getBackupStatus, markBackedUp, snoozeReminder } from "./backupStatus";
import { clearAllData } from "./backup";
import { makeDay, makeExpense, makePhotoBlob, makeTrip } from "../test/factories";

const DAY = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  localStorage.clear();
  await clearAllData();
});

describe("getBackupStatus", () => {
  it("has nothing to protect when there is no data", async () => {
    expect((await getBackupStatus()).level).toBe("none");
  });

  it("asks for a first backup once there is data", async () => {
    await db.trips.put(makeTrip());
    const s = await getBackupStatus();
    expect(s.level).toBe("never");
    expect(s.lastAt).toBeNull();
  });

  it("is fine right after a backup", async () => {
    await db.trips.put(makeTrip());
    markBackedUp(await currentFingerprint());
    const s = await getBackupStatus();
    expect(s.level).toBe("ok");
    expect(s.ageDays).toBe(0);
    expect(describeChanges(s)).toBe("");
  });

  it("stays fine while nothing changed, however old the backup is", async () => {
    await db.trips.put(makeTrip());
    markBackedUp(await currentFingerprint());
    const s = await getBackupStatus(Date.now() + 60 * DAY);
    expect(s.level).toBe("ok");
    expect(s.ageDays).toBe(60);
  });

  it("stays fine for a week even after new records", async () => {
    await db.trips.put(makeTrip());
    markBackedUp(await currentFingerprint());
    await db.photos.put({ id: "p1", tripId: "t1", dayId: "d1", blob: makePhotoBlob(1), createdAt: 1 });
    expect((await getBackupStatus(Date.now() + 3 * DAY)).level).toBe("ok");
  });

  it("asks again when records were added and the backup is a week old", async () => {
    await db.trips.put(makeTrip());
    markBackedUp(await currentFingerprint());
    await db.days.put(makeDay());
    await db.expenses.put(makeExpense());
    await db.photos.put({ id: "p1", tripId: "t1", dayId: "d1", blob: makePhotoBlob(1), createdAt: 1 });

    const s = await getBackupStatus(Date.now() + 8 * DAY);
    expect(s.level).toBe("stale");
    expect(s.added).toEqual({ trips: 0, days: 1, expenses: 1, photos: 1 });
    expect(describeChanges(s)).toBe("백업 뒤 새로 생긴 것: 하루 기록 1개 · 지출 1건 · 사진 1장");
  });

  it("notices an edited day even when no counts changed", async () => {
    await db.trips.put(makeTrip());
    await db.days.put(makeDay({ updatedAt: 1_000 }));
    markBackedUp(await currentFingerprint());
    await db.days.put(makeDay({ updatedAt: Date.now() + 5_000 })); // edited after the backup

    const s = await getBackupStatus(Date.now() + 10 * DAY);
    expect(s.level).toBe("stale");
    expect(s.edited).toBe(true);
    expect(describeChanges(s)).toBe("백업 뒤 고친 기록이 있어요");
  });

  it("can be snoozed, and a new backup clears the snooze", async () => {
    await db.trips.put(makeTrip());
    expect((await getBackupStatus()).snoozed).toBe(false);
    snoozeReminder();
    expect((await getBackupStatus()).snoozed).toBe(true);
    expect((await getBackupStatus(Date.now() + 4 * DAY)).snoozed).toBe(false); // 3 days later it returns
    markBackedUp(await currentFingerprint());
    expect((await getBackupStatus()).snoozed).toBe(false);
  });
});
