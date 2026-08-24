import type { Expense } from "../types";

export interface SettlementTransfer {
  from: string;
  to: string;
  amount: number;
}

/**
 * Computes each person's net balance (paid - owed) then greedily matches
 * debtors to creditors to minimize the number of transfers.
 */
export function computeSettlement(expenses: Expense[]): {
  balances: Record<string, number>;
  transfers: SettlementTransfer[];
} {
  const balances: Record<string, number> = {};

  for (const exp of expenses) {
    const share = exp.amount / exp.participants.length;
    balances[exp.paidBy] = (balances[exp.paidBy] ?? 0) + exp.amount;
    for (const p of exp.participants) {
      balances[p] = (balances[p] ?? 0) - share;
    }
  }

  const creditors = Object.entries(balances)
    .filter(([, v]) => v > 0.5)
    .map(([name, v]) => ({ name, amount: v }))
    .sort((a, b) => b.amount - a.amount);
  const debtors = Object.entries(balances)
    .filter(([, v]) => v < -0.5)
    .map(([name, v]) => ({ name, amount: -v }))
    .sort((a, b) => b.amount - a.amount);

  const transfers: SettlementTransfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = Math.min(debtor.amount, creditor.amount);
    if (amount > 0.5) {
      transfers.push({ from: debtor.name, to: creditor.name, amount });
    }
    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount <= 0.5) i++;
    if (creditor.amount <= 0.5) j++;
  }

  return { balances, transfers };
}

export function sumByCategory(expenses: Expense[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of expenses) {
    out[e.category] = (out[e.category] ?? 0) + e.amount;
  }
  return out;
}
