import Dexie, { type Table } from "dexie";
import type { Trip, DayEntry, Photo, Expense } from "./types";

class TravelDB extends Dexie {
  trips!: Table<Trip, string>;
  days!: Table<DayEntry, string>;
  photos!: Table<Photo, string>;
  expenses!: Table<Expense, string>;

  constructor() {
    super("travel-journal-db");
    this.version(1).stores({
      trips: "id, createdAt",
      days: "id, tripId, date",
      photos: "id, tripId, dayId",
      expenses: "id, tripId, date, category",
    });
  }
}

export const db = new TravelDB();
