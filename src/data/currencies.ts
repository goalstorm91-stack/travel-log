// Default currency suggestions (limited to the codes the trip forms offer).
export const CURRENCY_OPTIONS = ["KRW", "USD", "JPY", "VND", "THB", "EUR", "MYR", "PHP", "TWD"];

const EURO_COUNTRIES = [
  "France", "Germany", "Italy", "Spain", "Portugal", "Netherlands", "Austria",
  "Belgium", "Greece", "Finland", "Ireland", "Croatia", "Slovakia", "Slovenia",
  "Estonia", "Latvia", "Lithuania", "Luxembourg",
];

const BY_COUNTRY: Record<string, string> = {
  "South Korea": "KRW",
  Japan: "JPY",
  Vietnam: "VND",
  Thailand: "THB",
  Malaysia: "MYR",
  Philippines: "PHP",
  Taiwan: "TWD",
  "United States of America": "USD",
};
for (const c of EURO_COUNTRIES) BY_COUNTRY[c] = "EUR";

export function defaultCurrencyFor(countryName: string): string {
  return BY_COUNTRY[countryName] ?? "KRW";
}
