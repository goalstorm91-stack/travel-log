import { db } from "../db";

/** Reassigns dayNumber 1..N for a trip's days, ordered by date. */
export async function renumberDays(tripId: string): Promise<void> {
  const days = await db.days.where("tripId").equals(tripId).sortBy("date");
  await db.days.bulkPut(
    days.map((d, i) => ({ ...d, dayNumber: i + 1 })),
  );
}
