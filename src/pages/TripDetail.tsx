import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Link, useNavigate, useParams } from "react-router-dom";
import { v4 as uuid } from "uuid";
import { db } from "../db";
import type { DayEntry } from "../types";
import { getCountryLabel } from "../data/countries";
import { formatDateKR } from "../utils/format";
import { getCaptureMoment, toISODate } from "../utils/exif";
import { renumberDays } from "../utils/days";
import PhotoImg from "../components/PhotoImg";
import PhotoCollage from "../components/PhotoCollage";

export default function TripDetail() {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const coverInputRef = useRef<HTMLInputElement>(null);
  const autoOrganizeInputRef = useRef<HTMLInputElement>(null);
  const [organizing, setOrganizing] = useState<{ done: number; total: number } | null>(null);

  const trip = useLiveQuery(() => db.trips.get(tripId!), [tripId]);
  const days = useLiveQuery(
    () => db.days.where("tripId").equals(tripId!).sortBy("dayNumber"),
    [tripId],
  );

  if (!trip) return null;

  async function handleAutoOrganize(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    setOrganizing({ done: 0, total: files.length });

    const moments: { file: File; date: string; time: number }[] = [];
    for (const file of files) {
      const moment = await getCaptureMoment(file);
      moments.push({ file, date: toISODate(moment), time: moment.getTime() });
      setOrganizing((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
    }
    moments.sort((a, b) => a.time - b.time);

    const groups = new Map<string, File[]>();
    for (const m of moments) {
      (groups.get(m.date) ?? groups.set(m.date, []).get(m.date)!).push(m.file);
    }

    const existingDays = await db.days.where("tripId").equals(tripId!).toArray();
    const byDate = new Map(existingDays.map((d) => [d.date, d]));

    for (const [date, dateFiles] of groups) {
      let day = byDate.get(date);
      if (!day) {
        const now = Date.now();
        day = {
          id: uuid(),
          tripId: tripId!,
          dayNumber: 0,
          date,
          title: "",
          photoIds: [],
          createdAt: now,
          updatedAt: now,
        } satisfies DayEntry;
        byDate.set(date, day);
      }
      for (const file of dateFiles) {
        const photoId = uuid();
        await db.photos.add({
          id: photoId,
          tripId: tripId!,
          dayId: day.id,
          blob: file,
          createdAt: Date.now(),
        });
        day.photoIds.push(photoId);
      }
      day.updatedAt = Date.now();
      await db.days.put(day);
    }

    await renumberDays(tripId!);
    setOrganizing(null);
  }

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const photoId = uuid();
    await db.photos.add({
      id: photoId,
      tripId: trip!.id,
      dayId: "__cover__",
      blob: file,
      createdAt: Date.now(),
    });
    await db.trips.update(trip!.id, { coverPhotoId: photoId });
    e.target.value = "";
  }

  async function handleDeleteTrip() {
    if (!confirm(`"${trip!.title}" 여행을 삭제할까요? 모든 기록과 사진이 사라집니다.`)) return;
    const dayIds = (await db.days.where("tripId").equals(trip!.id).primaryKeys()) as string[];
    await db.photos.where("tripId").equals(trip!.id).delete();
    await db.days.bulkDelete(dayIds);
    await db.expenses.where("tripId").equals(trip!.id).delete();
    await db.trips.delete(trip!.id);
    navigate("/");
  }

  return (
    <div className="pb-4">
      <div
        className="relative h-48 w-full bg-gray-100"
        onClick={() => coverInputRef.current?.click()}
      >
        {trip.coverPhotoId ? (
          <PhotoImg photoId={trip.coverPhotoId} className="h-full w-full" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-6xl">
            {trip.emoji}
          </div>
        )}
        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleCoverUpload}
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-10">
          <p className="text-xs text-white/80">
            {getCountryLabel(trip.countryName)} · {trip.city}
          </p>
          <h1 className="text-xl font-bold text-white">{trip.title}</h1>
          <p className="text-xs text-white/80">
            {formatDateKR(trip.startDate)} - {formatDateKR(trip.endDate)}
          </p>
        </div>
        <Link
          to="/"
          className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white"
        >
          ‹
        </Link>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleDeleteTrip();
          }}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white"
        >
          🗑
        </button>
      </div>

      <div className="flex border-b border-gray-100 px-4">
        <div className="flex-1 border-b-2 border-indigo-600 py-3 text-center text-sm font-semibold text-indigo-600">
          기록
        </div>
        <Link
          to={`/trips/${trip.id}/expenses`}
          className="flex-1 border-b-2 border-transparent py-3 text-center text-sm font-semibold text-gray-400"
        >
          지출/정산
        </Link>
      </div>

      <div className="px-4">
        {days && days.length === 0 && (
          <div className="mt-10 flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-gray-500">
              첫 하루를 기록해보세요.
            </p>
          </div>
        )}

        {days?.map((day) => (
          <div key={day.id} className="mt-6 border-b border-gray-50 pb-6">
            <div className="mb-3 flex items-start justify-between">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-gray-900">
                  {day.dayNumber}
                </span>
                <div>
                  <p className="text-[10px] font-bold tracking-wider text-gray-400">
                    DAY
                  </p>
                  <p className="text-sm font-semibold text-gray-700">
                    {formatDateKR(day.date)}
                  </p>
                </div>
              </div>
              <Link
                to={`/trips/${trip.id}/days/${day.id}`}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-50 text-gray-500"
              >
                ✎
              </Link>
            </div>

            {day.title && (
              <p className="mb-2 text-sm font-semibold text-gray-800">
                {day.title}
              </p>
            )}

            {day.photoIds.length > 0 && (
              <div className="mb-3">
                <PhotoCollage photoIds={day.photoIds} />
              </div>
            )}

            {day.locationName && (
              <p className="mb-1 text-xs text-indigo-500">
                📍 {day.locationName}
              </p>
            )}
            {day.text && (
              <p className="mb-2 text-sm leading-relaxed text-gray-700">
                {day.text}
              </p>
            )}
            {day.quote && (
              <p className="border-t border-gray-100 pt-2 text-sm font-medium italic text-gray-500">
                "{day.quote}"
              </p>
            )}
          </div>
        ))}

        <div className="mt-6 flex gap-2">
          <Link
            to={`/trips/${trip.id}/days/new`}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-dashed border-gray-300 py-3.5 text-sm font-semibold text-gray-500"
          >
            + 하루 기록 추가
          </Link>
          <button
            onClick={() => autoOrganizeInputRef.current?.click()}
            disabled={!!organizing}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-dashed border-indigo-300 py-3.5 text-sm font-semibold text-indigo-500 disabled:opacity-50"
          >
            📷 사진으로 자동 정리
          </button>
          <input
            ref={autoOrganizeInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleAutoOrganize}
          />
        </div>
        {organizing && (
          <p className="mt-2 text-center text-xs text-gray-400">
            촬영일 분석 중... {organizing.done}/{organizing.total}
          </p>
        )}
        <p className="mt-2 text-center text-[11px] text-gray-400">
          사진의 촬영일을 읽어 자동으로 Day별로 정리해줘요.
        </p>
      </div>
    </div>
  );
}
