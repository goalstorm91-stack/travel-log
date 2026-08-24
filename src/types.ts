export interface Trip {
  id: string;
  title: string;
  emoji: string;
  countryName: string;
  countryCode: string; // ISO 3166-1 numeric id, matches topojson `id`
  city: string;
  cityLat?: number; // resolved from the bundled city dataset, when matched
  cityLng?: number;
  startDate: string; // ISO date yyyy-MM-dd
  endDate: string; // ISO date yyyy-MM-dd
  companions: string[]; // people involved for settlement, "나" always included
  currency: string; // default currency code, e.g. KRW, VND
  budget?: number; // optional total budget in `currency`
  coverPhotoId?: string;
  createdAt: number;
}

export interface DayEntry {
  id: string;
  tripId: string;
  dayNumber: number;
  date: string; // ISO date yyyy-MM-dd
  title: string;
  locationName?: string;
  text?: string;
  quote?: string;
  photoIds: string[]; // ordered
  createdAt: number;
  updatedAt: number;
}

export interface Photo {
  id: string;
  tripId: string;
  dayId: string;
  blob: Blob;
  createdAt: number;
}

export const EXPENSE_CATEGORIES = [
  { key: "food", label: "식비", icon: "🍜" },
  { key: "activity", label: "액티비티", icon: "📷" },
  { key: "entertainment", label: "유흥", icon: "🍻" },
  { key: "shopping", label: "쇼핑", icon: "🛍️" },
  { key: "transport", label: "교통", icon: "🚕" },
  { key: "lodging", label: "숙박", icon: "🏨" },
  { key: "etc", label: "기타", icon: "💸" },
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["key"];

export interface Expense {
  id: string;
  tripId: string;
  date: string;
  category: ExpenseCategory;
  memo: string;
  amount: number;
  currency: string;
  paidBy: string;
  participants: string[]; // split equally among these people
  createdAt: number;
}
