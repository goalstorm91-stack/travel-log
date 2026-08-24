// A varied, pleasant palette for coloring visited countries on the map.
const PALETTE = [
  "#6366f1", // indigo
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#10b981", // emerald
  "#3b82f6", // blue
  "#f97316", // orange
  "#06b6d4", // cyan
  "#a855f7", // purple
  "#84cc16", // lime
];

/** Deterministically maps a country code to a palette color, so the same country always renders the same color. */
export function colorForCountry(countryCode: string): string {
  let hash = 0;
  for (let i = 0; i < countryCode.length; i++) {
    hash = (hash * 31 + countryCode.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}
