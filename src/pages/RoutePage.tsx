import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Link, useParams } from "react-router-dom";
import { db } from "../db";
import { readPhotoMeta } from "../utils/exif";
import { formatDateKR } from "../utils/format";
import { dayColor } from "../utils/colors";
import {
  buildStops,
  playbackFrame,
  routeDistanceKm,
  segmentMs,
  type RoutePhoto,
  type Stop,
} from "../utils/route";
import PhotoImg from "../components/PhotoImg";
import PhotoLightbox from "../components/PhotoLightbox";
import RouteVideoDialog from "../components/RouteVideoDialog";
import RouteMap from "../components/RouteMap";
import TripTabs from "../components/TripTabs";
import UnlocatedPhotos from "../components/UnlocatedPhotos";

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

// Keyed by trip so playback/selection state never leaks between trips.
export default function RoutePage() {
  const { tripId } = useParams<{ tripId: string }>();
  return <RouteView key={tripId} tripId={tripId!} />;
}

function RouteView({ tripId }: { tripId: string }) {
  const trip = useLiveQuery(() => db.trips.get(tripId), [tripId]);
  const days = useLiveQuery(() => db.days.where("tripId").equals(tripId).toArray(), [tripId]);
  const photoRows = useLiveQuery(async () => {
    const all = await db.photos.where("tripId").equals(tripId).toArray();
    return all
      .filter((p) => p.dayId !== "__cover__")
      .map((p) => ({
        id: p.id,
        dayId: p.dayId,
        createdAt: p.createdAt,
        takenAt: p.takenAt,
        lat: p.lat,
        lng: p.lng,
      }));
  }, [tripId]);

  const [dayFilter, setDayFilter] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [follow, setFollow] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [pick, setPick] = useState<{ ids: string[] } | null>(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const [scan, setScan] = useState<{ done: number; total: number } | null>(null);
  const scanningRef = useRef(false);
  const elapsedRef = useRef(0);
  elapsedRef.current = elapsed;

  // Photos saved before GPS support have no metadata yet: read it from the
  // stored originals once, so existing trips get a route too.
  useEffect(() => {
    if (!photoRows || scanningRef.current) return;
    const pending = photoRows.filter((p) => p.takenAt === undefined);
    if (pending.length === 0) return;
    scanningRef.current = true;
    (async () => {
      let done = 0;
      setScan({ done, total: pending.length });
      for (const row of pending) {
        const photo = await db.photos.get(row.id);
        if (photo) {
          const lastModified = (photo.blob as File).lastModified ?? photo.createdAt;
          const meta = await readPhotoMeta(photo.blob, lastModified);
          await db.photos.update(row.id, { takenAt: meta.takenAt, lat: meta.lat, lng: meta.lng });
        }
        setScan({ done: ++done, total: pending.length });
      }
      setScan(null);
      scanningRef.current = false;
    })();
  }, [photoRows]);

  const dayByNumber = useMemo(() => new Map((days ?? []).map((d) => [d.dayNumber, d])), [days]);

  const geoPhotos: RoutePhoto[] = useMemo(() => {
    const numberByDayId = new Map((days ?? []).map((d) => [d.id, d.dayNumber]));
    return (photoRows ?? [])
      .filter((p) => p.lat != null && p.lng != null && p.takenAt != null && numberByDayId.has(p.dayId))
      .map((p) => ({
        id: p.id,
        dayNumber: numberByDayId.get(p.dayId)!,
        takenAt: p.takenAt!,
        lat: p.lat!,
        lng: p.lng!,
      }));
  }, [photoRows, days]);

  const allStops = useMemo(() => buildStops(geoPhotos), [geoPhotos]);
  const dayNumbers = useMemo(
    () => [...new Set(allStops.map((s) => s.dayNumber))].sort((a, b) => a - b),
    [allStops],
  );
  const stops: Stop[] = useMemo(
    () =>
      (dayFilter == null ? allStops : allStops.filter((s) => s.dayNumber === dayFilter)).map(
        (s, i) => ({ ...s, index: i }),
      ),
    [allStops, dayFilter],
  );

  const n = stops.length;
  const segMs = segmentMs(n);
  const total = Math.max(0, n - 1) * segMs;

  // Playback clock: wall-clock based so it runs the same regardless of frame rate.
  useEffect(() => {
    if (!playing || total === 0) return;
    const base = performance.now() - elapsedRef.current;
    const id = setInterval(() => {
      const t = performance.now() - base;
      if (t >= total) {
        setElapsed(total);
        setPlaying(false);
      } else {
        setElapsed(t);
      }
    }, 40);
    return () => clearInterval(id);
  }, [playing, total]);

  const frame = useMemo(() => playbackFrame(stops, elapsed, segMs), [stops, elapsed, segMs]);

  const started = playing || elapsed > 0;
  const mover = started && frame ? frame.pos : null;
  const trail = useMemo(() => {
    if (!started || !frame) return null;
    const pts: [number, number][] = stops.slice(0, frame.idx + 1).map((s) => [s.lat, s.lng]);
    pts.push([frame.pos.lat, frame.pos.lng]);
    return pts;
  }, [started, frame, stops]);

  const selectedIdx = started && frame ? frame.selectedIdx : selected;
  const selectedStop = selectedIdx != null ? stops[selectedIdx] : undefined;

  function resetPlayback() {
    setPlaying(false);
    setElapsed(0);
  }

  function chooseDay(day: number | null) {
    resetPlayback();
    setSelected(null);
    setDayFilter(day);
  }

  function togglePlay() {
    if (playing) {
      setSelected(selectedIdx ?? null);
      setPlaying(false);
      return;
    }
    if (elapsed >= total) setElapsed(0);
    setPlaying(true);
  }

  function selectStop(i: number) {
    setPlaying(false);
    setElapsed(i * segMs);
    // elapsed > 0 means "started", which would override the selection; park at the stop.
    setSelected(i);
    if (i === 0) setElapsed(0);
  }

  // Photos we've already read metadata for that have no GPS.
  const unlocated = useMemo(() => {
    const numberByDayId = new Map((days ?? []).map((d) => [d.id, d.dayNumber]));
    return (photoRows ?? [])
      .filter((p) => p.takenAt !== undefined && (p.lat == null || p.lng == null) && numberByDayId.has(p.dayId))
      .map((p) => ({ id: p.id, dayNumber: numberByDayId.get(p.dayId)! }));
  }, [photoRows, days]);

  async function assignLocation(ids: string[], lat: number, lng: number, label?: string) {
    const dayIds = new Set((photoRows ?? []).filter((p) => ids.includes(p.id)).map((p) => p.dayId));
    await db.transaction("rw", db.photos, db.days, async () => {
      for (const id of ids) await db.photos.update(id, { lat, lng });
      if (label) {
        for (const dayId of dayIds) {
          const day = await db.days.get(dayId);
          if (day && !day.locationName) await db.days.update(dayId, { locationName: label });
        }
      }
    });
  }

  if (!trip) return null;

  const totalPhotos = photoRows?.length ?? 0;
  const distance = routeDistanceKm(stops);
  const selectedDay = selectedStop ? dayByNumber.get(selectedStop.dayNumber) : undefined;

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
          <h1 className="text-base font-bold text-gray-900">동선</h1>
        </div>
      </div>

      <TripTabs tripId={trip.id} active="route" />

      {scan && (
        <p className="bg-indigo-50 px-4 py-2 text-center text-xs font-medium text-indigo-600">
          사진에서 위치를 읽는 중... {scan.done}/{scan.total}
        </p>
      )}

      {allStops.length === 0 && !scan && !pick ? (
        <div className="mx-4 mt-10 rounded-3xl bg-gray-50 p-6 text-center">
          <p className="text-3xl">🧭</p>
          <p className="mt-2 text-sm font-semibold text-gray-800">그려질 동선이 아직 없어요</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            {totalPhotos === 0
              ? "사진을 추가하면 촬영 위치를 따라 동선이 그려져요."
              : `사진 ${totalPhotos}장 중 위치 정보(GPS)가 담긴 사진이 없어요. 카메라의 위치 서비스를 켠 원본 사진이 필요해요. 메신저로 받은 사진은 위치가 지워져 있을 수 있어요.`}
          </p>
          <Link
            to={`/trips/${trip.id}`}
            className="mt-4 inline-block rounded-full bg-indigo-600 px-5 py-2.5 text-xs font-semibold text-white"
          >
            📷 사진 추가하러 가기
          </Link>
        </div>
      ) : (
        <>
          {pick && (
            <div className="mx-4 mt-4 flex items-center justify-between rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white">
              <span>지도를 눌러 사진 {pick.ids.length}장의 위치를 정하세요</span>
              <button onClick={() => setPick(null)} className="rounded-full bg-white/20 px-3 py-1">
                취소
              </button>
            </div>
          )}
          <div className="relative mt-4 overflow-hidden ring-1 ring-black/5">
            <RouteMap
              stops={stops}
              selectedIdx={selectedIdx}
              onSelect={selectStop}
              mover={mover}
              trail={trail}
              follow={follow}
              pickMode={pick != null}
              fallbackCenter={
                trip.cityLat != null && trip.cityLng != null
                  ? { lat: trip.cityLat, lng: trip.cityLng }
                  : undefined
              }
              onPick={(lat, lng) => {
                if (!pick) return;
                const ids = pick.ids;
                setPick(null);
                void assignLocation(ids, lat, lng);
              }}
            />
          </div>

          <div className="flex items-center gap-2 px-4 pt-3">
            <button
              onClick={togglePlay}
              disabled={n < 2}
              className="flex-1 rounded-full bg-indigo-600 py-2.5 text-sm font-semibold text-white disabled:bg-gray-200 disabled:text-gray-400"
            >
              {playing ? "❚❚ 일시정지" : elapsed > 0 && elapsed < total ? "▶ 이어서 재생" : "▶ 동선 재생"}
            </button>
            {elapsed > 0 && (
              <button
                onClick={resetPlayback}
                className="rounded-full border border-gray-200 px-4 py-2.5 text-xs font-semibold text-gray-500"
              >
                처음으로
              </button>
            )}
            <button
              onClick={() => setFollow((v) => !v)}
              className={`rounded-full px-4 py-2.5 text-xs font-semibold ${
                follow ? "bg-indigo-100 text-indigo-600" : "border border-gray-200 text-gray-500"
              }`}
            >
              따라가기
            </button>
          </div>

          {dayNumbers.length > 1 && (
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 pt-3">
              <DayChip active={dayFilter == null} onClick={() => chooseDay(null)}>
                전체
              </DayChip>
              {dayNumbers.map((d) => (
                <DayChip key={d} active={dayFilter === d} color={dayColor(d)} onClick={() => chooseDay(d)}>
                  Day {d}
                </DayChip>
              ))}
            </div>
          )}

          <div className="px-4 pt-3">
            <button
              onClick={() => setVideoOpen(true)}
              disabled={n < 2}
              className="w-full rounded-full border border-indigo-200 py-2.5 text-sm font-semibold text-indigo-600 disabled:border-gray-200 disabled:text-gray-300"
            >
              🎬 동선 영상 만들기
            </button>
          </div>

          <div className="flex gap-3 px-4 pt-3">
            <Stat label="위치 있는 사진" value={`${geoPhotos.length}/${totalPhotos}`} />
            <Stat label="정차 지점" value={`${n}곳`} />
            <Stat label="직선 이동 거리" value={distance >= 10 ? `${Math.round(distance)}km` : `${distance.toFixed(1)}km`} />
          </div>

          <div className="mx-4 mt-3 rounded-2xl bg-gray-50 p-4">
            {selectedStop ? (
              <>
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                    <span
                      className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                      style={{ background: dayColor(selectedStop.dayNumber) }}
                    >
                      {(selectedIdx ?? 0) + 1}
                    </span>
                    Day {selectedStop.dayNumber} · {formatTime(selectedStop.takenAt)}
                  </p>
                  <p className="text-[11px] text-gray-400">📷 {selectedStop.photoIds.length}장</p>
                </div>
                {selectedDay && (
                  <p className="mt-0.5 text-xs text-gray-500">
                    {formatDateKR(selectedDay.date)}
                    {selectedDay.locationName ? ` · 📍 ${selectedDay.locationName}` : ""}
                  </p>
                )}
                <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
                  {selectedStop.photoIds.slice(0, 8).map((id, i) => (
                    <PhotoImg
                      key={id}
                      photoId={id}
                      className="h-20 w-20 shrink-0 cursor-zoom-in rounded-xl"
                      onClick={() => setLightbox(i)}
                    />
                  ))}
                  {selectedStop.photoIds.length > 8 && (
                    <button
                      onClick={() => setLightbox(8)}
                      className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-white text-xs font-semibold text-gray-400"
                    >
                      +{selectedStop.photoIds.length - 8}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <p className="text-center text-xs text-gray-400">
                지도의 번호를 누르거나 재생을 눌러 사진을 따라가 보세요.
              </p>
            )}
          </div>
        </>
      )}

      {unlocated.length > 0 && !pick && (
        <UnlocatedPhotos
          photos={unlocated}
          trip={trip}
          onAssign={assignLocation}
          onPickOnMap={(ids) => setPick({ ids })}
        />
      )}

      {videoOpen && (
        <RouteVideoDialog
          trip={trip}
          stops={stops}
          days={days ?? []}
          dayFilter={dayFilter}
          onClose={() => setVideoOpen(false)}
        />
      )}

      {lightbox != null && selectedStop && (
        <PhotoLightbox
          photoIds={selectedStop.photoIds}
          index={lightbox}
          onClose={() => setLightbox(null)}
          onIndexChange={setLightbox}
        />
      )}
    </div>
  );
}

function DayChip({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold ${
        active ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"
      }`}
    >
      {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 rounded-2xl bg-gray-50 px-2 py-2.5 text-center">
      <p className="text-sm font-bold text-gray-900">{value}</p>
      <p className="text-[10px] text-gray-500">{label}</p>
    </div>
  );
}
