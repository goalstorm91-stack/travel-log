import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Link, useNavigate, useParams } from "react-router-dom";
import { v4 as uuid } from "uuid";
import { db } from "../db";
import { COUNTRIES } from "../data/countries";
import { findCityCoords } from "../utils/geocode";
import { useUnsavedGuard } from "../utils/useUnsavedGuard";
import type { Trip } from "../types";

const EMOJIS = ["🧳", "✈️", "🏖️", "🗺️", "🌸", "🎡", "⛰️", "🏛️"];

export default function NewTrip() {
  return <TripForm />;
}

/** Edit screen for an existing trip: the same form, pre-filled. */
export function EditTrip() {
  const { tripId } = useParams<{ tripId: string }>();
  // null = looked up and not found; undefined = still loading
  const trip = useLiveQuery(() => db.trips.get(tripId!).then((t) => t ?? null), [tripId]);
  if (trip === undefined) return null;
  if (trip === null) {
    return (
      <div className="px-4 pt-10 text-center text-sm text-gray-500">
        여행을 찾을 수 없어요.
        <Link to="/" className="mt-4 block font-semibold text-indigo-600">
          홈으로
        </Link>
      </div>
    );
  }
  return <TripForm key={trip.id} trip={trip} />;
}

function TripForm({ trip }: { trip?: Trip }) {
  const editing = !!trip;
  const navigate = useNavigate();
  const [title, setTitle] = useState(trip?.title ?? "");
  const [emoji, setEmoji] = useState(trip?.emoji ?? EMOJIS[0]);
  const [countryQuery, setCountryQuery] = useState(
    trip ? (COUNTRIES.find((c) => c.name === trip.countryName)?.nameKR ?? trip.countryName) : "",
  );
  const [city, setCity] = useState(trip?.city ?? "");
  const [startDate, setStartDate] = useState(trip?.startDate ?? "");
  const [endDate, setEndDate] = useState(trip?.endDate ?? "");
  const [companionsText, setCompanionsText] = useState(
    trip ? trip.companions.filter((c) => c !== "나").join(", ") : "",
  );
  const [currency, setCurrency] = useState(trip?.currency ?? "KRW");
  const [budget, setBudget] = useState(trip?.budget != null ? String(trip.budget) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const snapshot = JSON.stringify([title, emoji, countryQuery, city, startDate, endDate, companionsText, currency, budget]);
  const [initialSnapshot] = useState(snapshot);
  const guard = useUnsavedGuard(snapshot !== initialSnapshot);

  const matchedCountry = COUNTRIES.find(
    (c) => c.nameKR === countryQuery || c.name === countryQuery,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !matchedCountry || !city.trim() || !startDate || !endDate) {
      setError("여행 이름, 국가, 도시, 날짜를 모두 입력해주세요.");
      return;
    }
    if (endDate < startDate) {
      setError("종료일이 시작일보다 빠를 수 없어요.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const companions = [
        ...new Set(
          companionsText
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s && s !== "나"),
        ),
      ];

      if (trip) {
        // Expenses reference people by name, so someone who appears in them can't be dropped.
        const removed = trip.companions.filter((c) => c !== "나" && !companions.includes(c));
        if (removed.length > 0) {
          const expenses = await db.expenses.where("tripId").equals(trip.id).toArray();
          const inUse = removed.filter((name) =>
            expenses.some((x) => x.paidBy === name || x.participants.includes(name)),
          );
          if (inUse.length > 0) {
            setError(`${inUse.join(", ")}은(는) 지출 내역에 들어 있어 뺄 수 없어요. 지출에서 먼저 정리해 주세요.`);
            return;
          }
        }
      }

      // Only look the city up again when the place actually changed.
      const placeChanged = !trip || trip.city !== city.trim() || trip.countryName !== matchedCountry.name;
      const cityCoords = placeChanged
        ? await findCityCoords(city.trim(), matchedCountry.name)
        : { lat: trip!.cityLat, lng: trip!.cityLng };

      const next: Trip = {
        id: trip?.id ?? uuid(),
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
        coverPhotoId: trip?.coverPhotoId,
        createdAt: trip?.createdAt ?? Date.now(),
      };
      await db.trips.put(next);
      guard.leave();
      navigate(`/trips/${next.id}`, { replace: editing });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-4 pt-4 pb-4">
      <Link
        to={trip ? `/trips/${trip.id}` : "/"}
        aria-label="이전 화면으로"
        className="mb-4 inline-flex h-10 items-center gap-1 rounded-full bg-gray-100 px-4 text-sm font-semibold text-gray-700"
      >
        <span className="text-base leading-none">‹</span> 이전
      </Link>
      <h1 className="mb-4 text-xl font-bold text-gray-900">{editing ? "여행 정보 수정" : "새 여행 만들기"}</h1>

      {!editing && (
        <Link
          to="/trips/from-photos"
          className="mb-6 flex items-center gap-3 rounded-2xl bg-indigo-50 p-4"
        >
          <span className="text-2xl">📷</span>
          <span className="flex-1">
            <span className="block text-sm font-bold text-indigo-700">사진으로 한 번에 만들기</span>
            <span className="block text-xs text-indigo-500">
              사진만 고르면 기간·장소·Day가 자동으로 채워져요
            </span>
          </span>
          <span className="text-indigo-400">›</span>
        </Link>
      )}

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
        {editing && (
          <p className="-mt-3 text-[11px] text-gray-400">
            날짜를 바꿔도 이미 만든 Day의 날짜는 그대로예요. Day는 각 하루 기록에서 고칠 수 있어요.
          </p>
        )}

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
          {editing && (
            <span className="mt-1.5 block text-[11px] text-gray-400">
              이미 입력한 지출 금액은 그대로 두고, 표시하는 통화만 바뀌어요.
            </span>
          )}
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
          {saving ? "저장 중..." : editing ? "저장하기" : "여행 시작하기"}
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
