import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { v4 as uuid } from "uuid";
import { db } from "../db";
import { COUNTRIES } from "../data/countries";
import { findCityCoords } from "../utils/geocode";
import type { Trip } from "../types";

const EMOJIS = ["🧳", "✈️", "🏖️", "🗺️", "🌸", "🎡", "⛰️", "🏛️"];

export default function NewTrip() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [countryQuery, setCountryQuery] = useState("");
  const [city, setCity] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [companionsText, setCompanionsText] = useState("");
  const [currency, setCurrency] = useState("KRW");
  const [budget, setBudget] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const matchedCountry = COUNTRIES.find(
    (c) => c.nameKR === countryQuery || c.name === countryQuery,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !matchedCountry || !city.trim() || !startDate || !endDate) {
      setError("여행 이름, 국가, 도시, 날짜를 모두 입력해주세요.");
      return;
    }
    setError("");
    setSaving(true);
    const companions = companionsText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const cityCoords = await findCityCoords(city.trim(), matchedCountry.name);
    const trip: Trip = {
      id: uuid(),
      title: title.trim(),
      emoji,
      countryName: matchedCountry.name,
      countryCode: matchedCountry.id,
      city: city.trim(),
      cityLat: cityCoords?.lat,
      cityLng: cityCoords?.lng,
      startDate,
      endDate,
      companions: ["나", ...companions],
      currency,
      budget: budget ? Number(budget) : undefined,
      createdAt: Date.now(),
    };
    await db.trips.add(trip);
    setSaving(false);
    navigate(`/trips/${trip.id}`);
  }

  return (
    <div className="px-4 pt-6 pb-4">
      <h1 className="mb-5 text-xl font-bold text-gray-900">새 여행 만들기</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <label className="mb-2 block text-xs font-semibold text-gray-500">
            대표 이모지
          </label>
          <div className="flex flex-wrap gap-2">
            {EMOJIS.map((em) => (
              <button
                type="button"
                key={em}
                onClick={() => setEmoji(em)}
                className={`flex h-11 w-11 items-center justify-center rounded-xl text-xl ${
                  emoji === em ? "bg-indigo-100 ring-2 ring-indigo-500" : "bg-gray-50"
                }`}
              >
                {em}
              </button>
            ))}
          </div>
        </div>

        <Field label="여행 이름">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 선셋 헌팅"
            className="input"
          />
        </Field>

        <Field label="국가">
          <input
            list="country-list"
            value={countryQuery}
            onChange={(e) => setCountryQuery(e.target.value)}
            placeholder="국가 검색 (예: 말레이시아)"
            className="input"
          />
          <datalist id="country-list">
            {COUNTRIES.map((c) => (
              <option key={c.id} value={c.nameKR} />
            ))}
          </datalist>
        </Field>

        <Field label="도시">
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="예: 코타키나바루"
            className="input"
          />
        </Field>

        <div className="flex gap-3">
          <Field label="시작일" className="flex-1">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="input"
            />
          </Field>
          <Field label="종료일" className="flex-1">
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="input"
            />
          </Field>
        </div>

        <Field label="함께한 사람 (쉼표로 구분, 선택)">
          <input
            value={companionsText}
            onChange={(e) => setCompanionsText(e.target.value)}
            placeholder="예: 유석, 이호재"
            className="input"
          />
        </Field>

        <Field label="통화">
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="input"
          >
            {["KRW", "USD", "JPY", "VND", "THB", "EUR", "MYR", "PHP", "TWD"].map(
              (c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ),
            )}
          </select>
        </Field>

        <Field label="예산 (선택)">
          <input
            type="number"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder={`전체 예산 (${currency})`}
            className="input"
          />
        </Field>

        {error && <p className="text-center text-xs font-medium text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="mt-2 rounded-full bg-indigo-600 py-3.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "저장 중..." : "여행 시작하기"}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="mb-1.5 block text-xs font-semibold text-gray-500">
        {label}
      </span>
      {children}
    </label>
  );
}
