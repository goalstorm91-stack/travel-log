import Dexie, { type Table } from "dexie";
import type { Trip, DayEntry, Photo, Expense, Thumb } from "./types";

class TravelDB extends Dexie {
  trips!: Table<Trip, string>;
  days!: Table<DayEntry, string>;
  photos!: Table<Photo, string>;
  expenses!: Table<Expense, string>;
  thumbs!: Table<Thumb, string>;

  constructor() {
    super("travel-journal-db");
    this.version(1).stores({
      trips: "id, createdAt",
      days: "id, tripId, date",
      photos: "id, tripId, dayId",
      expenses: "id, tripId, date, category",
    });
    // v2 adds small photo copies for grids; existing data is untouched.
    this.version(2).stores({
      trips: "id, createdAt",
      days: "id, tripId, date",
      photos: "id, tripId, dayId",
      expenses: "id, tripId, date, category",
      thumbs: "id",
    });
  }
}

export const db = new TravelDB();
