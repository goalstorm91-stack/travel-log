import { useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router-dom";
import { db } from "../db";
import { getCountryLabel } from "../data/countries";
import { colorForCountry } from "../utils/colors";
import WorldMap, { type MapPin, type WorldMapHandle } from "../components/WorldMap";
import type { Trip } from "../types";

export default function MapPage() {
  const trips = useLiveQuery(() => db.trips.toArray(), []);
  const [hoveredName, setHoveredName] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [activePinId, setActivePinId] = useState<string | null>(null);
  const mapRef = useRef<WorldMapHandle>(null);

  const visitedCodes = useMemo(
    () => new Set((trips ?? []).map((t) => t.countryCode)),
    [trips],
  );

  const pins: MapPin[] = useMemo(
    () =>
      (trips ?? [])
        .filter((t): t is Trip & { cityLat: number; cityLng: number } =>
          t.cityLat != null && t.cityLng != null,
        )
        .map((t) => ({
          tripId: t.id,
          lat: t.cityLat,
          lng: t.cityLng,
          color: colorForCountry(t.countryCode),
          label: `${t.city} · ${t.title}`,
        })),
    [trips],
  );

  const tripsByCountry = useMemo(() => {
    const out: Record<string, Trip[]> = {};
    for (const t of trips ?? []) {
      (out[t.countryCode] ??= []).push(t);
    }
    return out;
  }, [trips]);

  const activeTrip = (trips ?? []).find((t) => t.id === activePinId);

  const countryCount = visitedCodes.size;
  const cityCount = new Set((trips ?? []).map((t) => `${t.countryCode}-${t.city}`)).size;

  function focusOnCountry(code: string, ts: Trip[]) {
    const withCoords = ts.filter((t) => t.cityLat != null && t.cityLng != null);
    if (withCoords.length === 1) {
      mapRef.current?.focusPoint(withCoords[0].cityLat!, withCoords[0].cityLng!, 11);
      setActivePinId(withCoords[0].id);
    } else {
      mapRef.current?.focusCountry(code);
      setActivePinId(null);
    }
    setFocused(true);
  }

  function handleCountryClick(code: string) {
    setFocused(true);
    const withCoords = (tripsByCountry[code] ?? []).filter(
      (t) => t.cityLat != null && t.cityLng != null,
    );
    setActivePinId(withCoords.length === 1 ? withCoords[0].id : null);
  }

  function handlePinClick(tripId: string) {
    const trip = (trips ?? []).find((t) => t.id === tripId);
    if (!trip || trip.cityLat == null || trip.cityLng == null) return;
    mapRef.current?.focusPoint(trip.cityLat, trip.cityLng, 12);
    setActivePinId(tripId);
    setFocused(true);
  }

  function resetView() {
    mapRef.current?.reset();
    setFocused(false);
    setActivePinId(null);
  }

  return (
    <div className="px-4 pt-6 pb-4">
      <h1 className="mb-1 text-xl font-bold text-gray-900">나의 여행 지도</h1>
      <p className="mb-4 text-sm text-gray-400">
        {countryCount}개국 {cityCount}개 도시 여행
      </p>

      <div className="relative overflow-hidden rounded-3xl shadow-sm ring-1 ring-black/5">
        <WorldMap
          ref={mapRef}
          visitedCodes={visitedCodes}
          pins={pins}
          activePinId={activePinId}
          onHoverCountry={(_, name) => setHoveredName(name)}
          onCountryClick={(code) => handleCountryClick(code)}
          onPinClick={handlePinClick}
        />
        {focused && (
          <button
            onClick={resetView}
            className="absolute right-2 top-2 rounded-full bg-white/90 px-3 py-1.5 text-[11px] font-semibold text-gray-600 shadow"
          >
            전체 지도
          </button>
        )}
      </div>

      <div className="mt-2 flex h-8 items-center justify-center text-center text-xs text-gray-500">
        {activeTrip ? (
          <Link
            to={`/trips/${activeTrip.id}`}
            className="rounded-full bg-indigo-50 px-3 py-1 font-semibold text-indigo-600"
          >
            📍 {getCountryLabel(activeTrip.countryName)} {activeTrip.city} · {activeTrip.title} 보기
          </Link>
        ) : (
          (hoveredName && getCountryLabel(hoveredName)) || (
            <span className="text-gray-400">밀어서 지구본을 돌리고, 나라나 핀을 눌러 보세요</span>
          )
        )}
      </div>

      <div className="mt-4">
        <h2 className="mb-2 text-sm font-bold text-gray-700">
          다녀온 국가 ({countryCount})
        </h2>
        {countryCount === 0 && (
          <p className="text-sm text-gray-400">
            아직 기록된 여행이 없어요. 여행을 추가하면 지도가 채워집니다.
          </p>
        )}
        <div className="flex flex-col gap-2">
          {Object.entries(tripsByCountry)
            .sort((a, b) => (b[1]?.length ?? 0) - (a[1]?.length ?? 0))
            .map(([code, ts]) => (
              <div
                key={code}
                className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2.5"
              >
                <button
                  onClick={() => focusOnCountry(code, ts!)}
                  className="flex items-center gap-2 text-sm font-medium text-gray-800"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: colorForCountry(code) }}
                  />
                  {getCountryLabel(ts![0].countryName)}
                </button>
                <div className="flex gap-1">
                  {ts!.map((t) => (
                    <Link
                      key={t.id}
                      to={`/trips/${t.id}`}
                      className="rounded-full bg-white px-2.5 py-1 text-[11px] text-gray-500 shadow-sm"
                    >
                      {t.city}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
