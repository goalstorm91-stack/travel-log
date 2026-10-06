import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { v4 as uuid } from "uuid";
import { db } from "../db";
import { COUNTRIES, findCountryByName } from "../data/countries";
import { CURRENCY_OPTIONS, defaultCurrencyFor } from "../data/currencies";
import { findCityCoords } from "../utils/geocode";
import { formatDateKR } from "../utils/format";
import {
  analyzePhotos,
  attachPlaces,
  dominantPlace,
  groupByDate,
  makeThumbnail,
  savePhotosToTrip,
  type AnalyzedPhoto,
} from "../utils/photoImport";
import type { Trip } from "../types";

type Phase = "pick" | "analyzing" | "review" | "saving";

export default function PhotoTrip() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("pick");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [photos, setPhotos] = useState<AnalyzedPhoto[]>([]);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [countryQuery, setCountryQuery] = useState("");
  const [city, setCity] = useState("");
  const [currency, setCurrency] = useState("KRW");

  const detected = useMemo(() => dominantPlace(photos), [photos]);
  const days = useMemo(() => [...groupByDate(photos).entries()], [photos]);
  const located = photos.filter((p) => p.lat != null).length;
  const fileDated = photos.filter((p) => p.dateSource === "file").length;

  const startDate = days[0]?.[0] ?? "";
  const endDate = days[days.length - 1]?.[0] ?? "";
  const spanDays =
    startDate && endDate
      ? Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000) + 1
      : 0;

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    setError("");
    setPhase("analyzing");
    setProgress({ done: 0, total: files.length });
    try {
      const analyzed = await analyzePhotos(files, (done, total) => setProgress({ done, total }));
      await attachPlaces(analyzed);
      const place = dominantPlace(analyzed);
      const country = place ? findCountryByName(place.country) : undefined;

      setPhotos(analyzed);
      setCity(place?.label ?? "");
      setCountryQuery(country?.nameKR ?? "");
      setTitle(place ? `${place.label} 여행` : "");
      setCurrency(country ? defaultCurrencyFor(country.name) : "KRW");
      setPhase("review");
    } catch {
      setError("사진을 읽는 중 문제가 생겼어요. 20~50장씩 나눠서 다시 시도해 주세요.");
      setPhase("pick");
    }
  }

  async function handleSave() {
    const matched = COUNTRIES.find(
      (c) => c.nameKR === countryQuery || c.name === countryQuery,
    );
    if (!title.trim() || !matched || !city.trim()) {
      setError("여행 이름, 국가, 도시를 확인해 주세요.");
      return;
    }
    setError("");
    setPhase("saving");
    try {
      // Reuse the GPS-derived city center when the user kept the detected place.
      const keptDetected =
        detected && city.trim() === detected.label && matched.name === detected.country;
      const coords = keptDetected
        ? { lat: detected.lat, lng: detected.lng }
        : await findCityCoords(city.trim(), matched.name);

      const trip: Trip = {
        id: uuid(),
        title: title.trim(),
        emoji: "🧳",
        countryName: matched.name,
        countryCode: matched.id,
        city: city.trim(),
        cityLat: coords?.lat,
        cityLng: coords?.lng,
        startDate,
        endDate,
        companions: ["나"],
        currency,
        createdAt: Date.now(),
      };
      await db.trips.add(trip);

      const { firstPhoto } = await savePhotosToTrip(trip.id, photos);
      if (firstPhoto) {
        const coverId = uuid();
        await db.photos.add({
          id: coverId,
          tripId: trip.id,
          dayId: "__cover__",
          blob: await makeThumbnail(firstPhoto.blob),
          createdAt: Date.now(),
        });
        await db.trips.update(trip.id, { coverPhotoId: coverId });
      }
      navigate(`/trips/${trip.id}`);
    } catch {
      setError("여행을 만드는 중 문제가 생겼어요. 다시 시도해 주세요.");
      setPhase("review");
    }
  }

  return (
    <div className="px-4 pt-6 pb-4">
      <div className="mb-5 flex items-center gap-3">
        <Link
          to="/trips/new"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-50 text-gray-600"
        >
          ‹
        </Link>
        <h1 className="text-xl font-bold text-gray-900">사진으로 여행 만들기</h1>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFiles}
      />

      {phase === "pick" && (
        <div className="rounded-3xl bg-indigo-50 p-6 text-center">
          <p className="text-3xl">📷</p>
          <h2 className="mt-2 text-base font-bold text-gray-900">여행 사진을 골라주세요</h2>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            촬영 시간과 위치를 읽어서 기간, 도시, Day별 기록을 자동으로 만들어요.
            <br />
            사진은 서버로 보내지 않고 이 기기에만 저장돼요.
          </p>
          <button
            onClick={() => inputRef.current?.click()}
            className="mt-4 rounded-full bg-indigo-600 px-6 py-3 text-sm font-semibold text-white"
          >
            사진 고르기
          </button>
          <p className="mt-3 text-[11px] text-gray-400">
            위치(GPS)가 담긴 원본 사진이어야 장소를 알아낼 수 있어요.
          </p>
        </div>
      )}

      {phase === "analyzing" && (
        <p className="mt-16 text-center text-sm text-gray-500">
          사진을 읽는 중... {progress.done}/{progress.total}
        </p>
      )}

      {(phase === "review" || phase === "saving") && (
        <div className="flex flex-col gap-5">
          <div className="flex gap-3">
            <Stat label="사진" value={photos.length} />
            <Stat label="위치 있음" value={located} />
            <Stat label="기간" value={`${spanDays}일`} />
          </div>

          {spanDays > 30 && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
              기간이 {spanDays}일로 길어요. 한 번의 여행 사진만 골랐는지 확인해 주세요.
            </p>
          )}
          {located === 0 && (
            <p className="rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-500">
              위치 정보가 담긴 사진이 없어서 장소를 직접 입력해야 해요. 메신저로 받은 사진은
              위치가 지워져 있을 수 있어요.
            </p>
          )}
          {fileDated > 0 && (
            <p className="rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-500">
              촬영 정보가 없는 사진 {fileDated}장은 파일 수정일로 정리했어요.
            </p>
          )}

          <Field label="여행 이름">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" />
          </Field>

          <div className="flex gap-3">
            <Field label="국가" className="flex-1">
              <input
                list="photo-trip-countries"
                value={countryQuery}
                onChange={(e) => {
                  setCountryQuery(e.target.value);
                  const match = COUNTRIES.find(
                    (c) => c.nameKR === e.target.value || c.name === e.target.value,
                  );
                  if (match) setCurrency(defaultCurrencyFor(match.name));
                }}
                placeholder="국가 검색"
                className="input"
              />
              <datalist id="photo-trip-countries">
                {COUNTRIES.map((c) => (
                  <option key={c.id} value={c.nameKR} />
                ))}
              </datalist>
            </Field>
            <Field label="도시" className="flex-1">
              <input value={city} onChange={(e) => setCity(e.target.value)} className="input" />
            </Field>
          </div>

          <Field label="통화">
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="input">
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>

          <div>
            <p className="mb-2 text-xs font-semibold text-gray-500">만들어질 Day</p>
            <div className="flex flex-col gap-1.5">
              {days.map(([date, list], i) => {
                const place = dominantPlace(list);
                return (
                  <div
                    key={date}
                    className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2.5 text-sm"
                  >
                    <span className="font-semibold text-gray-800">
                      Day {i + 1}{" "}
                      <span className="font-normal text-gray-500">{formatDateKR(date)}</span>
                    </span>
                    <span className="text-xs text-gray-500">
                      {place ? `📍 ${place.label} · ` : ""}
                      {list.length}장
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {error && <p className="text-center text-xs font-medium text-red-500">{error}</p>}

          <button
            onClick={handleSave}
            disabled={phase === "saving"}
            className="rounded-full bg-indigo-600 py-3.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {phase === "saving" ? "만드는 중..." : "여행 만들기"}
          </button>
          <button
            onClick={() => {
              setPhotos([]);
              setPhase("pick");
            }}
            disabled={phase === "saving"}
            className="text-xs font-medium text-gray-400"
          >
            사진 다시 고르기
          </button>
        </div>
      )}

      {phase === "pick" && error && (
        <p className="mt-4 text-center text-xs font-medium text-red-500">{error}</p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex-1 rounded-2xl bg-gray-50 px-3 py-3 text-center">
      <p className="text-lg font-bold text-gray-900">{value}</p>
      <p className="text-[11px] text-gray-500">{label}</p>
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
      <span className="mb-1.5 block text-xs font-semibold text-gray-500">{label}</span>
      {children}
    </label>
  );
}
