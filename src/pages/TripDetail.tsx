import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { v4 as uuid } from "uuid";
import { db } from "../db";
import { getCountryLabel } from "../data/countries";
import { formatDateKR } from "../utils/format";
import { analyzePhotos, attachPlaces, savePhotosToTrip } from "../utils/photoImport";
import { prepareImageForStorage } from "../utils/imageStore";
import { generateTripShareCard, shareTripCard } from "../utils/shareCard";
import PhotoImg from "../components/PhotoImg";
import PhotoCollage from "../components/PhotoCollage";
import TripTabs from "../components/TripTabs";

export default function TripDetail() {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const coverInputRef = useRef<HTMLInputElement>(null);
  const autoOrganizeInputRef = useRef<HTMLInputElement>(null);
  const [organizing, setOrganizing] = useState<{ done: number; total: number; label: string } | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const location = useLocation();
  const [organizeMessage, setOrganizeMessage] = useState(
    (location.state as { notice?: string } | null)?.notice ?? "",
  );

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

    setOrganizeMessage("");
    const analyzeLabel = "촬영일·위치 분석 중";
    setOrganizing({ done: 0, total: files.length, label: analyzeLabel });
    try {
      const analyzed = await analyzePhotos(files, (done, total) =>
        setOrganizing({ done, total, label: analyzeLabel }),
      );
      await attachPlaces(analyzed);
      const { saved, failed } = await savePhotosToTrip(tripId!, analyzed, (done, total) =>
        setOrganizing({ done, total, label: "사진 저장 중" }),
      );
      const located = analyzed.filter((p) => p.lat != null).length;
      const parts = [
        `사진 ${saved}장을 정리했어요.`,
        located > 0 ? `위치가 있는 사진은 ${located}장이에요.` : "위치 정보가 담긴 사진은 없었어요.",
      ];
      if (failed > 0) parts.push(`${failed}장은 변환하지 못해 건너뛰었어요.`);
      setOrganizeMessage(parts.join(" "));
    } catch {
      setOrganizeMessage("사진을 읽는 중 문제가 생겼어요. 20~50장씩 나눠서 다시 시도해 주세요.");
    } finally {
      setOrganizing(null);
    }
  }

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    let blob: Blob;
    try {
      blob = await prepareImageForStorage(file);
    } catch {
      setOrganizeMessage("이 사진은 변환하지 못했어요. 다른 사진을 골라 주세요.");
      e.target.value = "";
      return;
    }
    const photoId = uuid();
    await db.photos.add({
      id: photoId,
      tripId: trip!.id,
      dayId: "__cover__",
      blob,
      createdAt: Date.now(),
    });
    await db.trips.update(trip!.id, { coverPhotoId: photoId });
    e.target.value = "";
  }

  async function handleShare() {
    setSharing(true);
    setShareMessage("");
    try {
      const dayCount = days?.length ?? 0;
      const photoCount = (days ?? []).reduce((sum, d) => sum + d.photoIds.length, 0);
      const coverBlob = trip!.coverPhotoId
        ? (await db.photos.get(trip!.coverPhotoId))?.blob
        : undefined;
      const cardBlob = await generateTripShareCard(trip!, { dayCount, photoCount }, coverBlob);
      const result = await shareTripCard(trip!, cardBlob);
      setShareMessage(result === "shared" ? "공유했어요!" : "이미지를 저장했어요.");
    } catch {
      setShareMessage("공유 카드를 만들지 못했어요.");
    } finally {
      setSharing(false);
    }
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
      <div className="relative h-48 w-full bg-gray-100">
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
          aria-label="홈으로"
          className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white"
        >
          ‹
        </Link>
        {/* Changing the cover is an explicit action: making the whole header a file-picker
            trigger fired it for every tap that reached it (including the back link). */}
        <button
          onClick={() => coverInputRef.current?.click()}
          className="absolute bottom-3 right-3 rounded-full bg-black/40 px-3 py-1.5 text-[11px] font-semibold text-white"
        >
          📷 표지 변경
        </button>
        <div className="absolute right-3 top-3 flex gap-2">
          <button
            onClick={handleShare}
            aria-label="공유"
            disabled={sharing}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white disabled:opacity-50"
          >
            {sharing ? "…" : "🔗"}
          </button>
          <button
            onClick={handleDeleteTrip}
            aria-label="여행 삭제"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white"
          >
            🗑
          </button>
        </div>
      </div>

      {shareMessage && (
        <p className="bg-indigo-50 px-4 py-2 text-center text-xs font-medium text-indigo-600">
          {shareMessage}
        </p>
      )}

      <TripTabs tripId={trip.id} active="journal" />

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
            {organizing.label}... {organizing.done}/{organizing.total}
          </p>
        )}
        {organizeMessage && (
          <p className="mt-2 text-center text-xs font-medium text-indigo-600">{organizeMessage}</p>
        )}
        <p className="mt-2 text-center text-[11px] text-gray-400">
          사진의 촬영일과 위치를 읽어 Day별로 정리하고, 동선 탭에 길을 그려줘요.
        </p>
      </div>
    </div>
  );
}
