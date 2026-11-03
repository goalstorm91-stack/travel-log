import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Link, useNavigate, useParams } from "react-router-dom";
import { v4 as uuid } from "uuid";
import { db } from "../db";
import type { DayEntry } from "../types";
import { readPhotoMeta } from "../utils/exif";
import { prepareImageForStorage } from "../utils/imageStore";
import PhotoImg from "../components/PhotoImg";
import { useUnsavedGuard } from "../utils/useUnsavedGuard";

export default function DayEditor() {
  const { tripId, dayId: routeDayId } = useParams<{ tripId: string; dayId?: string }>();
  const isNew = !routeDayId;
  const [newDayId] = useState(() => uuid());

  // null = looked up and not found; undefined = still loading
  const trip = useLiveQuery(() => db.trips.get(tripId!).then((t) => t ?? null), [tripId]);
  const tripDays = useLiveQuery(() => db.days.where("tripId").equals(tripId!).sortBy("dayNumber"), [tripId]);
  const existingDay = useLiveQuery(
    () => (routeDayId ? db.days.get(routeDayId).then((d) => d ?? null) : null),
    [routeDayId],
  );

  // The form below starts from these values once, so wait until they are known.
  if (trip === undefined || tripDays === undefined || existingDay === undefined) return null;
  if (trip === null || (!isNew && existingDay === null)) {
    return (
      <div className="px-4 pt-10 text-center text-sm text-gray-500">
        기록을 찾을 수 없어요.
        <Link to={trip ? `/trips/${trip.id}` : "/"} className="mt-4 block font-semibold text-indigo-600">
          돌아가기
        </Link>
      </div>
    );
  }

  // A new day continues the numbering and dates of the trip so far.
  const next = tripDays.length;
  const base = new Date(trip.startDate);
  base.setDate(base.getDate() + next);

  return (
    <DayForm
      key={existingDay?.id ?? newDayId}
      tripId={trip.id}
      dayId={existingDay?.id ?? newDayId}
      existingDay={existingDay ?? undefined}
      defaultDate={base.toISOString().slice(0, 10)}
      defaultDayNumber={next + 1}
    />
  );
}

function DayForm({
  tripId,
  dayId,
  existingDay,
  defaultDate,
  defaultDayNumber,
}: {
  tripId: string;
  dayId: string;
  existingDay?: DayEntry;
  defaultDate: string;
  defaultDayNumber: number;
}) {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isNew = !existingDay;
  // What the form started from: "unsaved changes" means differing from this.
  const [baseline] = useState(existingDay);

  const [date, setDate] = useState(existingDay?.date ?? defaultDate);
  const [dayNumber, setDayNumber] = useState(existingDay?.dayNumber ?? defaultDayNumber);
  const [title, setTitle] = useState(existingDay?.title ?? "");
  const [locationName, setLocationName] = useState(existingDay?.locationName ?? "");
  const [text, setText] = useState(existingDay?.text ?? "");
  const [quote, setQuote] = useState(existingDay?.quote ?? "");
  const [photoIds, setPhotoIds] = useState<string[]>(existingDay?.photoIds ?? []);
  const [error, setError] = useState("");

  // Photo changes are staged until "저장하기": new photos are stored right away (they have to
  // be, to show a preview) but removed again if the edit is abandoned, and removed photos are
  // only deleted for real on save.
  const [selected, setSelected] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const pending = useRef({ added, committed: false });
  useEffect(() => {
    pending.current.added = added;
  }, [added]);
  useEffect(
    () => () => {
      const p = pending.current;
      if (!p.committed && p.added.length > 0) void db.photos.bulkDelete(p.added);
    },
    [],
  );

  const selectedIndex = selected ? photoIds.indexOf(selected) : -1;

  const dirty =
    added.length > 0 ||
    removed.length > 0 ||
    (baseline
      ? date !== baseline.date ||
        dayNumber !== baseline.dayNumber ||
        title !== baseline.title ||
        locationName !== (baseline.locationName ?? "") ||
        text !== (baseline.text ?? "") ||
        quote !== (baseline.quote ?? "") ||
        photoIds.join() !== baseline.photoIds.join()
      : !!(title.trim() || locationName.trim() || text.trim() || quote.trim()));
  const guard = useUnsavedGuard(dirty);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const newIds: string[] = [];
    let failedCount = 0;
    for (const file of files) {
      const id = uuid();
      const meta = await readPhotoMeta(file, file.lastModified); // read before re-encoding drops EXIF
      let blob: Blob;
      try {
        blob = await prepareImageForStorage(file);
      } catch {
        failedCount++;
        continue;
      }
      await db.photos.add({
        id,
        tripId,
        dayId,
        blob,
        createdAt: Date.now(),
        takenAt: meta.takenAt,
        lat: meta.lat,
        lng: meta.lng,
      });
      newIds.push(id);
    }
    setPhotoIds((prev) => [...prev, ...newIds]);
    setAdded((prev) => [...prev, ...newIds]);
    if (failedCount > 0) setError(`사진 ${failedCount}장은 변환하지 못해 건너뛰었어요.`);
    e.target.value = "";
  }

  async function removePhoto(id: string) {
    setSelected(null);
    setPhotoIds((prev) => prev.filter((p) => p !== id));
    if (added.includes(id)) {
      // never part of the saved day, so nothing to keep
      await db.photos.delete(id);
      setAdded((prev) => prev.filter((p) => p !== id));
    } else {
      setRemoved((prev) => [...prev, id]);
    }
  }

  function movePhoto(index: number, dir: -1 | 1) {
    setPhotoIds((prev) => {
      const arr = [...prev];
      const target = index + dir;
      if (target < 0 || target >= arr.length) return arr;
      [arr[index], arr[target]] = [arr[target], arr[index]];
      return arr;
    });
  }

  async function handleSave() {
    if (!date) {
      setError("날짜를 입력해주세요.");
      return;
    }
    setError("");
    const now = Date.now();
    const entry: DayEntry = {
      id: dayId,
      tripId,
      dayNumber,
      date,
      title: title.trim(),
      locationName: locationName.trim() || undefined,
      text: text.trim() || undefined,
      quote: quote.trim() || undefined,
      photoIds,
      createdAt: baseline?.createdAt ?? now,
      updatedAt: now,
    };
    await db.days.put(entry);
    if (removed.length > 0) await db.photos.bulkDelete(removed);
    pending.current.committed = true;
    guard.leave();
    navigate(`/trips/${tripId}`);
  }

  async function handleDelete() {
    if (!confirm("이 하루 기록을 삭제할까요?")) return;
    await db.photos.where("dayId").equals(dayId).delete();
    await db.days.delete(dayId);
    pending.current.committed = true;
    guard.leave();
    navigate(`/trips/${tripId}`);
  }

  return (
    <div className="px-4 pt-4 pb-4">
      <div className="mb-4 flex items-center justify-between">
        <Link
          to={`/trips/${tripId}`}
          aria-label="여행 기록으로 돌아가기"
          className="flex h-10 items-center gap-1 rounded-full bg-gray-100 px-4 text-sm font-semibold text-gray-700"
        >
          <span className="text-base leading-none">‹</span> 이전
        </Link>
        {!isNew && (
          <button
            onClick={handleDelete}
            className="flex h-10 items-center rounded-full bg-red-50 px-4 text-[13px] font-semibold text-red-500"
          >
            🗑 삭제
          </button>
        )}
      </div>
      <h1 className="mb-5 text-xl font-bold text-gray-900">
        {isNew ? "하루 기록 추가" : "하루 기록 수정"}
      </h1>

      <div className="flex flex-col gap-5">
        <div className="flex gap-3">
          <Field label="Day" className="w-20">
            <input
              type="number"
              min={1}
              value={dayNumber}
              onChange={(e) => setDayNumber(Number(e.target.value))}
              className="input"
            />
          </Field>
          <Field label="날짜" className="flex-1">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input"
            />
          </Field>
        </div>

        <Field label="제목">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 선셋 헌팅"
            className="input"
          />
        </Field>

        {/* a <div>, not a <Field> label: a label would forward stray taps to its first button */}
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-gray-500">사진</span>
          <div className="flex flex-wrap gap-2">
            {photoIds.map((id, i) => {
              const on = selected === id;
              return (
                <button
                  type="button"
                  key={id}
                  onClick={() => setSelected(on ? null : id)}
                  aria-pressed={on}
                  aria-label={`사진 ${i + 1}번 선택`}
                  className={`relative h-20 w-20 rounded-lg ${on ? "ring-2 ring-indigo-500 ring-offset-2" : ""}`}
                >
                  <PhotoImg photoId={id} size="thumb" className="h-20 w-20 rounded-lg" />
                  <span className="absolute left-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-black/55 px-1 text-[10px] font-bold text-white">
                    {i + 1}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="사진 추가"
              className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-gray-300 text-2xl text-gray-300"
            >
              +
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFiles}
            />
          </div>

          {selectedIndex >= 0 ? (
            <div className="mt-3 flex gap-2" role="group" aria-label={`사진 ${selectedIndex + 1}번 편집`}>
              <button
                type="button"
                onClick={() => movePhoto(selectedIndex, -1)}
                disabled={selectedIndex === 0}
                className="flex h-11 flex-1 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-700 disabled:opacity-35"
              >
                ← 앞으로
              </button>
              <button
                type="button"
                onClick={() => movePhoto(selectedIndex, 1)}
                disabled={selectedIndex === photoIds.length - 1}
                className="flex h-11 flex-1 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-700 disabled:opacity-35"
              >
                뒤로 →
              </button>
              <button
                type="button"
                onClick={() => void removePhoto(selected!)}
                className="flex h-11 flex-1 items-center justify-center rounded-full bg-red-50 text-sm font-semibold text-red-500"
              >
                🗑 삭제
              </button>
            </div>
          ) : (
            photoIds.length > 0 && (
              <p className="mt-2 text-[11px] text-gray-400">사진을 누르면 순서를 바꾸거나 삭제할 수 있어요.</p>
            )
          )}
        </div>

        <Field label="위치 (선택)">
          <input
            value={locationName}
            onChange={(e) => setLocationName(e.target.value)}
            placeholder="예: 탄중아루해변"
            className="input"
          />
        </Field>

        <Field label="일지">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="오늘 하루는 어땠나요?"
            rows={4}
            className="input resize-none"
          />
        </Field>

        <Field label="한 줄 문장 (선택)">
          <input
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
            placeholder='예: "황홀경에 물든 노을, 그 이름값을 하다"'
            className="input"
          />
        </Field>

        {error && <p className="text-center text-xs font-medium text-red-500">{error}</p>}

        <button
          onClick={handleSave}
          className="mt-2 rounded-full bg-indigo-600 py-3.5 text-sm font-semibold text-white"
        >
          저장하기
        </button>
      </div>
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
