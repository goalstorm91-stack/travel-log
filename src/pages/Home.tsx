import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router-dom";
import { db } from "../db";
import { getCountryLabel } from "../data/countries";
import PhotoImg from "../components/PhotoImg";

export default function Home() {
  const trips = useLiveQuery(
    () => db.trips.orderBy("createdAt").reverse().toArray(),
    [],
  );

  const stats = useLiveQuery(async () => {
    const all = await db.trips.toArray();
    const countries = new Set(all.map((t) => t.countryCode));
    const cities = new Set(all.map((t) => `${t.countryCode}-${t.city}`));
    return { countryCount: countries.size, cityCount: cities.size };
  }, []);

  const grouped = groupByYear(trips ?? []);

  return (
    <div className="px-4 pt-6 pb-4">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold tracking-widest text-indigo-500">
            TRAVEL JOURNAL
          </p>
          <h1 className="text-2xl font-bold text-gray-900">여행 기록</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/map"
            className="rounded-full bg-gray-900 px-4 py-2 text-xs font-semibold text-white"
          >
            내 지도 보기
          </Link>
          <Link
            to="/settings"
            aria-label="설정"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-50 text-gray-500"
          >
            ⚙
          </Link>
        </div>
      </div>

      <div className="mb-6 flex gap-3">
        <StatCard label="방문 국가" value={stats?.countryCount ?? 0} />
        <StatCard label="방문 도시" value={stats?.cityCount ?? 0} />
        <StatCard label="여행 기록" value={trips?.length ?? 0} />
      </div>

      {trips && trips.length === 0 && (
        <div className="mt-16 flex flex-col items-center gap-3 text-center">
          <div className="text-4xl">✈️</div>
          <p className="text-sm text-gray-500">
            아직 기록된 여행이 없어요.
            <br />첫 여행을 남겨보세요.
          </p>
          <Link
            to="/trips/new"
            className="mt-2 rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white"
          >
            + 새 여행 만들기
          </Link>
        </div>
      )}

      {Object.entries(grouped)
        .sort((a, b) => Number(b[0]) - Number(a[0]))
        .map(([year, yearTrips]) => (
          <div key={year} className="mb-5">
            <h2 className="mb-2 text-sm font-bold text-gray-400">{year}</h2>
            <div className="grid grid-cols-2 gap-3">
              {yearTrips.map((trip) => (
                <Link
                  key={trip.id}
                  to={`/trips/${trip.id}`}
                  className="group relative aspect-square overflow-hidden rounded-2xl bg-gray-100"
                >
                  {trip.coverPhotoId ? (
                    <PhotoImg
                      photoId={trip.coverPhotoId}
                      className="h-full w-full"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-4xl">
                      {trip.emoji || "🧳"}
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-8">
                    <p className="truncate text-[11px] text-white/80">
                      {getCountryLabel(trip.countryName)} · {trip.city}
                    </p>
                    <p className="truncate text-sm font-semibold text-white">
                      {trip.title}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex-1 rounded-2xl bg-gray-50 px-3 py-3 text-center">
      <p className="text-lg font-bold text-gray-900">{value}</p>
      <p className="text-[11px] text-gray-500">{label}</p>
    </div>
  );
}

function groupByYear<T extends { startDate: string }>(trips: T[]) {
  const out: Record<string, T[]> = {};
  for (const t of trips) {
    const year = t.startDate?.slice(0, 4) || "기타";
    (out[year] ??= []).push(t);
  }
  return out;
}
