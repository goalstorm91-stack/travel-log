import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router-dom";
import { db } from "../db";
import { getCountryLabel } from "../data/countries";
import { colorForCountry } from "../utils/colors";
import WorldMap from "../components/WorldMap";
import type { Trip } from "../types";

export default function MapPage() {
  const trips = useLiveQuery(() => db.trips.toArray(), []);
  const [hoveredName, setHoveredName] = useState<string | null>(null);

  const visitedCodes = useMemo(
    () => new Set((trips ?? []).map((t) => t.countryCode)),
    [trips],
  );

  const tripsByCountry = useMemo(() => {
    const out: Record<string, Trip[]> = {};
    for (const t of trips ?? []) {
      (out[t.countryCode] ??= []).push(t);
    }
    return out;
  }, [trips]);

  const countryCount = visitedCodes.size;
  const cityCount = new Set((trips ?? []).map((t) => `${t.countryCode}-${t.city}`)).size;

  return (
    <div className="px-4 pt-6 pb-4">
      <h1 className="mb-1 text-xl font-bold text-gray-900">나의 여행 지도</h1>
      <p className="mb-4 text-sm text-gray-400">
        {countryCount}개국 {cityCount}개 도시 여행
      </p>

      <div className="overflow-hidden rounded-2xl bg-gray-50 p-1">
        <WorldMap
          visitedCodes={visitedCodes}
          onHover={(_, name) => setHoveredName(name)}
        />
      </div>
      <p className="mt-2 h-4 text-center text-xs text-gray-500">
        {hoveredName ? getCountryLabel(hoveredName) : ""}
      </p>

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
                <span className="flex items-center gap-2 text-sm font-medium text-gray-800">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: colorForCountry(code) }}
                  />
                  {getCountryLabel(ts![0].countryName)}
                </span>
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
