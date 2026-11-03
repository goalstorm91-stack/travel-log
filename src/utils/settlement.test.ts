import { describe, expect, it } from "vitest";
import { computeSettlement, sumByCategory } from "./settlement";
import { makeExpense } from "../test/factories";

describe("computeSettlement", () => {
  it("splits one payment equally among participants", () => {
    const { balances, transfers } = computeSettlement([
      makeExpense({ amount: 3000, paidBy: "나", participants: ["나", "유석", "민지"] }),
    ]);
    expect(balances["나"]).toBeCloseTo(2000);
    expect(balances["유석"]).toBeCloseTo(-1000);
    expect(transfers).toEqual([
      { from: "유석", to: "나", amount: expect.closeTo(1000) },
      { from: "민지", to: "나", amount: expect.closeTo(1000) },
    ]);
  });

  it("nets out people who paid for each other", () => {
    const { transfers } = computeSettlement([
      makeExpense({ id: "a", amount: 10_000, paidBy: "나", participants: ["나", "유석"] }),
      makeExpense({ id: "b", amount: 10_000, paidBy: "유석", participants: ["나", "유석"] }),
    ]);
    expect(transfers).toEqual([]);
  });

  it("keeps balances summing to zero, and the transfers settle everyone", () => {
    const expenses = [
      makeExpense({ id: "1", amount: 90_000, paidBy: "나", participants: ["나", "유석", "민지"] }),
      makeExpense({ id: "2", amount: 45_000, paidBy: "유석", participants: ["유석", "민지"] }),
      makeExpense({ id: "3", amount: 12_000, paidBy: "민지", participants: ["나", "민지"] }),
    ];
    const { balances, transfers } = computeSettlement(expenses);
    expect(Object.values(balances).reduce((a, b) => a + b, 0)).toBeCloseTo(0);

    const after = { ...balances };
    for (const t of transfers) {
      after[t.from] += t.amount;
      after[t.to] -= t.amount;
    }
    for (const v of Object.values(after)) expect(Math.abs(v)).toBeLessThan(1);
    expect(transfers.length).toBeLessThanOrEqual(2); // 3 people never need more than 2 transfers
  });

  it("owes nothing when you pay only for yourself", () => {
    const { transfers } = computeSettlement([makeExpense({ amount: 500, paidBy: "나", participants: ["나"] })]);
    expect(transfers).toEqual([]);
  });

  it("returns nothing for no expenses", () => {
    expect(computeSettlement([])).toEqual({ balances: {}, transfers: [] });
  });
});

describe("sumByCategory", () => {
  it("adds amounts per category", () => {
    const sums = sumByCategory([
      makeExpense({ id: "1", category: "food", amount: 1000 }),
      makeExpense({ id: "2", category: "food", amount: 500 }),
      makeExpense({ id: "3", category: "transport", amount: 700 }),
    ]);
    expect(sums).toEqual({ food: 1500, transport: 700 });
  });
});
