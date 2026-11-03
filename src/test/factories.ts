import type { DayEntry, Expense, Trip } from "../types";

export function makeTrip(over: Partial<Trip> = {}): Trip {
  return {
    id: "t1",
    title: "제주 여행",
    emoji: "🏝",
    countryName: "South Korea",
    countryCode: "410",
    city: "제주",
    startDate: "2026-09-30",
    endDate: "2026-10-02",
    companions: ["나", "유석"],
    currency: "KRW",
    createdAt: 1_000,
    ...over,
  };
}

export function makeDay(over: Partial<DayEntry> = {}): DayEntry {
  return {
    id: "d1",
    tripId: "t1",
    dayNumber: 1,
    date: "2026-09-30",
    title: "도착",
    photoIds: [],
    createdAt: 1_000,
    updatedAt: 1_000,
    ...over,
  };
}

export function makeExpense(over: Partial<Expense> = {}): Expense {
  return {
    id: "e1",
    tripId: "t1",
    date: "2026-09-30",
    category: "food",
    memo: "점심",
    amount: 30_000,
    currency: "KRW",
    paidBy: "나",
    participants: ["나", "유석"],
    createdAt: 1_000,
    ...over,
  };
}

/** A small blob whose bytes depend on the seed, so different photos are distinguishable. */
export function makePhotoBlob(seed: number, type = "image/jpeg"): Blob {
  return new Blob([new Uint8Array([0xff, 0xd8, 0xff, seed, seed + 1, seed + 2])], { type });
}
