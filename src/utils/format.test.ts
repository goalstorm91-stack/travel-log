import { describe, expect, it } from "vitest";
import { formatDateKR, formatMoney } from "./format";
import { toISODate } from "./exif";

describe("format", () => {
  it("formats money with thousands separators and no decimals", () => {
    expect(formatMoney(30000, "KRW")).toBe("KRW 30,000");
    expect(formatMoney(1234.56, "USD")).toBe("USD 1,235");
    expect(formatMoney(0, "JPY")).toBe("JPY 0");
  });

  it("writes dates in Korean without zero padding", () => {
    expect(formatDateKR("2026-09-05")).toBe("2026년 9월 5일");
    expect(formatDateKR("2026-12-31")).toBe("2026년 12월 31일");
  });

  it("toISODate uses the local calendar date, zero padded", () => {
    expect(toISODate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(toISODate(new Date(2026, 10, 30, 0, 0))).toBe("2026-11-30");
  });
});
