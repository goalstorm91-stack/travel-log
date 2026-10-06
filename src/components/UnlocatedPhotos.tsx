import { useMemo, useState } from "react";
import PhotoImg from "./PhotoImg";
import { findCityCoords } from "../utils/geocode";
import type { Trip } from "../types";

export interface UnlocatedPhoto {
  id: string;
  dayNumber: number;
}

/**
 * Photos without GPS can't be placed on the route. This lists them and lets the
 * user give a place to a selection — by typing a place name (offline lookup) or
 * by tapping the map.
 */
export default function UnlocatedPhotos({
  photos,
  trip,
  onAssign,
  onPickOnMap,
}: {
  photos: UnlocatedPhoto[];
  trip: Trip;
  onAssign: (ids: string[], lat: number, lng: number, label?: string) => Promise<void>;
  onPickOnMap: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState(false);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);

  const byDay = useMemo(() => {
    const map = new Map<number, UnlocatedPhoto[]>();
    for (const p of photos) {
      const list = map.get(p.dayNumber);
      if (list) list.push(p);
      else map.set(p.dayNumber, [p]);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [photos]);

  // Selection survives list changes only for photos that are still unlocated.
  const ids = photos.filter((p) => selected.has(p.id)).map((p) => p.id);
  const allSelected = ids.length === photos.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleDay(dayPhotos: UnlocatedPhoto[]) {
    setSelected((prev) => {
      const next = new Set(prev);
      const every = dayPhotos.every((p) => next.has(p.id));
      for (const p of dayPhotos) {
        if (every) next.delete(p.id);
        else next.add(p.id);
      }
      return next;
    });
  }

  async function search() {
    if (!query.trim()) return;
    setSearching(true);
    setNotFound(false);
    setResult(null);
    const coords = await findCityCoords(query.trim(), trip.countryName);
    setSearching(false);
    if (coords) setResult({ ...coords, label: query.trim() });
    else setNotFound(true);
  }

  async function apply(lat: number, lng: number, label?: string) {
    setBusy(true);
    await onAssign(ids, lat, lng, label);
    setBusy(false);
    setSheet(false);
    setQuery("");
    setResult(null);
    setSelected(new Set());
  }

  return (
    <div className="mx-4 mt-4 rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-gray-800">📍 위치 없는 사진 {photos.length}장</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-gray-500">
            GPS가 없어 동선에 못 그려요. 사진을 골라 장소를 정해 주세요.
          </p>
        </div>
        <button
          onClick={() => setSelected(allSelected ? new Set() : new Set(photos.map((p) => p.id)))}
          className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-500 shadow-sm"
        >
          {allSelected ? "선택 해제" : "전체 선택"}
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        {byDay.map(([day, dayPhotos]) => (
          <div key={day}>
            <button
              onClick={() => toggleDay(dayPhotos)}
              className="mb-1.5 text-[11px] font-semibold text-gray-500"
            >
              Day {day} · {dayPhotos.length}장 (눌러서 이 날 전체 선택)
            </button>
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
              {dayPhotos.map((p) => {
                const on = selected.has(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => toggle(p.id)}
                    aria-pressed={on}
                    aria-label={on ? "선택됨" : "선택 안 됨"}
                    className="relative h-16 w-16 shrink-0"
                  >
                    <PhotoImg
                      photoId={p.id}
                      className={`h-16 w-16 rounded-xl ${on ? "ring-2 ring-indigo-500 ring-offset-1" : ""}`}
                    />
                    {on && (
                      <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[9px] text-white">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <button
        disabled={ids.length === 0}
        onClick={() => setSheet(true)}
        className="mt-3 w-full rounded-full bg-indigo-600 py-2.5 text-xs font-semibold text-white disabled:bg-gray-200 disabled:text-gray-400"
      >
        {ids.length > 0 ? `선택한 ${ids.length}장에 위치 지정` : "사진을 골라 주세요"}
      </button>

      {sheet && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={() => !busy && setSheet(false)}>
          <div
            className="w-full max-w-[480px] rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-bold text-gray-900">위치 지정 · 사진 {ids.length}장</p>

            <div className="mt-3 flex gap-2">
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setResult(null);
                  setNotFound(false);
                }}
                onKeyDown={(e) => e.key === "Enter" && search()}
                placeholder="장소 이름 (예: 교토, 후쿠오카)"
                className="input flex-1"
              />
              <button
                onClick={search}
                disabled={searching || !query.trim()}
                className="rounded-xl bg-gray-900 px-4 text-xs font-semibold text-white disabled:opacity-40"
              >
                {searching ? "…" : "찾기"}
              </button>
            </div>

            {result && (
              <button
                disabled={busy}
                onClick={() => apply(result.lat, result.lng, result.label)}
                className="mt-2 w-full rounded-xl bg-indigo-50 px-3 py-3 text-left text-sm font-semibold text-indigo-700"
              >
                📍 {result.label}(으)로 지정하기
              </button>
            )}
            {notFound && (
              <p className="mt-2 text-xs text-red-500">
                찾지 못했어요. 도시 이름으로 검색하거나, 지도에서 직접 골라 주세요.
              </p>
            )}

            <div className="mt-3 flex flex-col gap-2">
              {trip.cityLat != null && trip.cityLng != null && (
                <button
                  disabled={busy}
                  onClick={() => apply(trip.cityLat!, trip.cityLng!, trip.city)}
                  className="rounded-xl bg-gray-50 px-3 py-3 text-left text-sm font-medium text-gray-700"
                >
                  🏙 여행 도시({trip.city}) 위치로
                </button>
              )}
              <button
                disabled={busy}
                onClick={() => {
                  setSheet(false);
                  onPickOnMap(ids);
                }}
                className="rounded-xl bg-gray-50 px-3 py-3 text-left text-sm font-medium text-gray-700"
              >
                🗺 지도에서 직접 고르기
              </button>
            </div>

            <button onClick={() => setSheet(false)} className="mt-3 w-full py-2 text-xs font-medium text-gray-400">
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
