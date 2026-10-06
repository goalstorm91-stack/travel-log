import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Link, useParams } from "react-router-dom";
import { v4 as uuid } from "uuid";
import { db } from "../db";
import { EXPENSE_CATEGORIES, type Expense, type ExpenseCategory } from "../types";
import { computeSettlement, sumByCategory } from "../utils/settlement";
import { formatMoney, formatDateKR } from "../utils/format";
import TripTabs from "../components/TripTabs";

export default function Expenses() {
  const { tripId } = useParams<{ tripId: string }>();
  const trip = useLiveQuery(() => db.trips.get(tripId!), [tripId]);
  const expenses = useLiveQuery(
    () => db.expenses.where("tripId").equals(tripId!).reverse().sortBy("date"),
    [tripId],
  );
  const [showForm, setShowForm] = useState(false);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");

  if (!trip) return null;

  const list = expenses ?? [];
  const total = list.reduce((sum, e) => sum + e.amount, 0);
  const byCategory = sumByCategory(list);
  const { transfers } = computeSettlement(list);
  const multiPerson = trip.companions.length > 1;
  const remaining = trip.budget != null ? trip.budget - total : null;
  const spentPct =
    trip.budget && trip.budget > 0 ? Math.min(100, Math.round((total / trip.budget) * 100)) : 0;

  async function handleDelete(id: string) {
    await db.expenses.delete(id);
  }

  function startEditBudget() {
    setBudgetInput(trip!.budget != null ? String(trip!.budget) : "");
    setEditingBudget(true);
  }

  async function saveBudget() {
    const val = budgetInput.trim() ? Number(budgetInput) : undefined;
    await db.trips.update(trip!.id, { budget: val });
    setEditingBudget(false);
  }

  return (
    <div className="pb-4">
      <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-4">
        <Link
          to={`/trips/${trip.id}`}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-50 text-gray-600"
        >
          ‹
        </Link>
        <div>
          <p className="text-xs text-gray-400">{trip.title}</p>
          <h1 className="text-base font-bold text-gray-900">지출 / 정산</h1>
        </div>
      </div>

      <TripTabs tripId={trip.id} active="expenses" />

      <div className="px-4">
        <div className="mt-5 rounded-2xl bg-gray-900 p-5 text-white">
          <p className="text-xs text-gray-300">쓴 돈</p>
          <p className="text-2xl font-bold">{formatMoney(total, trip.currency)}</p>

          {editingBudget ? (
            <div className="mt-3 flex items-center gap-2">
              <input
                type="number"
                autoFocus
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                placeholder={`전체 예산 (${trip.currency})`}
                className="flex-1 rounded-lg bg-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-400 outline-none"
              />
              <button
                onClick={saveBudget}
                className="rounded-lg bg-indigo-500 px-3 py-2 text-xs font-semibold"
              >
                저장
              </button>
              <button
                onClick={() => setEditingBudget(false)}
                className="text-xs text-gray-400"
              >
                취소
              </button>
            </div>
          ) : trip.budget != null ? (
            <button onClick={startEditBudget} className="mt-3 block w-full text-left">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-gray-300">남은 돈</span>
                <span className={remaining! < 0 ? "font-semibold text-red-400" : "font-semibold text-emerald-400"}>
                  {formatMoney(remaining!, trip.currency)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
                <div
                  className={`h-full rounded-full ${spentPct >= 100 ? "bg-red-400" : "bg-emerald-400"}`}
                  style={{ width: `${spentPct}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-gray-400">
                예산 {formatMoney(trip.budget, trip.currency)} 중 {spentPct}% 사용 · 탭하여 수정
              </p>
            </button>
          ) : (
            <button
              onClick={startEditBudget}
              className="mt-3 rounded-lg border border-dashed border-white/30 px-3 py-2 text-xs font-medium text-gray-300"
            >
              + 예산 설정하기
            </button>
          )}

          <div className="mt-4 flex flex-col gap-2">
            {EXPENSE_CATEGORIES.filter((c) => byCategory[c.key]).map((c) => {
              const amt = byCategory[c.key] ?? 0;
              const pct = total > 0 ? Math.round((amt / total) * 100) : 0;
              return (
                <div key={c.key} className="flex items-center gap-2 text-xs">
                  <span className="w-24 shrink-0 text-gray-300">
                    {c.icon} {c.label}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
                    <div
                      className="h-full rounded-full bg-indigo-400"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right text-gray-300">
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {multiPerson && transfers.length > 0 && (
          <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
            <p className="mb-2 text-xs font-bold text-indigo-600">정산 결과</p>
            <div className="flex flex-col gap-1.5">
              {transfers.map((t, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">
                    {t.from} → {t.to}
                  </span>
                  <span className="font-semibold text-gray-900">
                    {formatMoney(t.amount, trip.currency)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => setShowForm((v) => !v)}
          className="mt-4 w-full rounded-full border border-dashed border-gray-300 py-3 text-sm font-semibold text-gray-500"
        >
          {showForm ? "닫기" : "+ 지출 추가"}
        </button>

        {showForm && (
          <ExpenseForm
            tripId={trip.id}
            currency={trip.currency}
            companions={trip.companions}
            onDone={() => setShowForm(false)}
          />
        )}

        <div className="mt-5 flex flex-col gap-2">
          {list.map((exp) => {
            const cat = EXPENSE_CATEGORIES.find((c) => c.key === exp.category);
            return (
              <div
                key={exp.id}
                className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5"
              >
                <span className="text-xl">{cat?.icon}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">
                    {exp.memo || cat?.label}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {formatDateKR(exp.date)} · {exp.paidBy} 결제
                    {multiPerson ? ` · ${exp.participants.join(", ")}` : ""}
                  </p>
                </div>
                <span className="text-sm font-semibold text-gray-900">
                  {formatMoney(exp.amount, exp.currency)}
                </span>
                <button
                  onClick={() => handleDelete(exp.id)}
                  className="ml-1 text-xs text-gray-300"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ExpenseForm({
  tripId,
  currency,
  companions,
  onDone,
}: {
  tripId: string;
  currency: string;
  companions: string[];
  onDone: () => void;
}) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState<ExpenseCategory>("food");
  const [memo, setMemo] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState(companions[0]);
  const [participants, setParticipants] = useState<string[]>(companions);
  const [error, setError] = useState("");

  function toggleParticipant(name: string) {
    setParticipants((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0 || participants.length === 0) {
      setError("금액과 정산 대상을 확인해주세요.");
      return;
    }
    setError("");
    const expense: Expense = {
      id: uuid(),
      tripId,
      date,
      category,
      memo: memo.trim(),
      amount: amt,
      currency,
      paidBy,
      participants,
      createdAt: Date.now(),
    };
    await db.expenses.add(expense);
    onDone();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 flex flex-col gap-3 rounded-2xl border border-gray-100 p-4"
    >
      <div className="flex flex-wrap gap-1.5">
        {EXPENSE_CATEGORIES.map((c) => (
          <button
            type="button"
            key={c.key}
            onClick={() => setCategory(c.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              category === c.key
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {c.icon} {c.label}
          </button>
        ))}
      </div>

      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder={`금액 (${currency})`}
        className="input"
      />
      <input
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="메모 (예: 저녁 식사)"
        className="input"
      />
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="input"
      />

      {companions.length > 1 && (
        <>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-gray-500">결제자</p>
            <div className="flex flex-wrap gap-1.5">
              {companions.map((name) => (
                <button
                  type="button"
                  key={name}
                  onClick={() => setPaidBy(name)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                    paidBy === name
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-gray-500">
              정산 대상 (N분의 1)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {companions.map((name) => (
                <button
                  type="button"
                  key={name}
                  onClick={() => toggleParticipant(name)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                    participants.includes(name)
                      ? "bg-indigo-100 text-indigo-600"
                      : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {error && <p className="text-center text-xs font-medium text-red-500">{error}</p>}

      <button
        type="submit"
        className="mt-1 rounded-full bg-indigo-600 py-2.5 text-sm font-semibold text-white"
      >
        추가
      </button>
    </form>
  );
}
