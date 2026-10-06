import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router-dom";
import { db } from "../db";
import { getCountryLabel } from "../data/countries";
import { toISODate } from "../utils/exif";
import type { Trip } from "../types";
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

  // Photo stats in one pass (covers excluded).
  const photoStats = useLiveQuery(async () => {
    let total = 0;
    let located = 0;
    let first = Infinity;
    let last = -Infinity;
    await db.photos.each((p) => {
      if (p.dayId === "__cover__") return;
      total++;
      if (p.lat != null && p.lng != null) located++;
      if (p.takenAt != null) {
        first = Math.min(first, p.takenAt);
        last = Math.max(last, p.takenAt);
      }
    });
    return { total, located, first: Number.isFinite(first) ? first : null, last: Number.isFinite(last) ? last : null };
  }, []);

  const grouped = groupByYear(trips ?? []);

  return (
    <div className="px-4 pt-6 pb-4">
      <div className="mb-5 flex items-center justify-between">
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

      {trips && <HeroCard trips={trips} />}

      {trips && trips.length === 0 && <StartSteps />}

      <div className="mt-5 flex gap-3">
        <StatCard label="방문 국가" value={stats?.countryCount ?? 0} />
        <StatCard label="방문 도시" value={stats?.cityCount ?? 0} />
        <StatCard label="여행 기록" value={trips?.length ?? 0} />
      </div>
      {photoStats && photoStats.total > 0 && (
        <div className="mt-2 flex gap-3">
          <StatCard label="사진" value={`${photoStats.total}장`} small />
          <StatCard label="위치 있음" value={`${photoStats.located}장`} small />
          <StatCard label="촬영 기간" value={formatSpan(photoStats.first, photoStats.last)} small />
        </div>
      )}
      <div className="mb-6" />

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

      <footer className="mt-10 flex flex-col items-center gap-1.5 pb-2 text-center">
        <p className="text-sm font-semibold tracking-wide text-gray-700">
          Made by Seo Taeseong, 2026
        </p>
        <Link to="/notice" className="text-xs text-gray-400 underline underline-offset-2">
          이용 안내 · 고지
        </Link>
      </footer>
    </div>
  );
}

function HeroCard({ trips }: { trips: Trip[] }) {
  const today = toISODate(new Date());
  const activeTrip = trips.find((t) => t.startDate <= today && today <= t.endDate);

  if (activeTrip) {
    const dayNum =
      Math.floor(
        (new Date(today).getTime() - new Date(activeTrip.startDate).getTime()) /
          86_400_000,
      ) + 1;
    return (
      <HeroShell
        to={`/trips/${activeTrip.id}/days/new`}
        eyebrow="여행 중"
        title={`${activeTrip.title}, 잘 즐기고 계신가요?`}
        subtitle={`${dayNum}일째 · ${getCountryLabel(activeTrip.countryName)} ${activeTrip.city}`}
        cta="+ 오늘 기록하기"
        photoId={activeTrip.coverPhotoId}
        emoji={activeTrip.emoji}
      />
    );
  }

  if (trips.length > 0) {
    return (
      <HeroShell
        to="/trips/new"
        eyebrow="다음 이야기"
        title="또 어디로 떠나볼까요?"
        subtitle={`지금까지 ${trips.length}번의 여행을 기록했어요`}
        cta="+ 새 여행 만들기"
        photoId={trips[0].coverPhotoId}
        emoji={trips[0].emoji}
      />
    );
  }

  return (
    <HeroShell
      to="/trips/from-photos"
      eyebrow="TRAVEL JOURNAL"
      title="여행은 끝나도, 기억은 남아요"
      subtitle="사진과 글, 그날의 지출까지. 흩어지는 순간을 하나씩 모아보세요."
      cta="📷 사진으로 시작하기"
      emoji="🧳"
    />
  );
}

function HeroShell({
  to,
  eyebrow,
  title,
  subtitle,
  cta,
  photoId,
  emoji,
}: {
  to: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  cta: string;
  photoId?: string;
  emoji?: string;
}) {
  return (
    <Link
      to={to}
      className="relative flex items-center gap-4 overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-700 p-5 text-white shadow-lg shadow-indigo-200"
    >
      <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-10 left-10 h-28 w-28 rounded-full bg-white/10 blur-2xl" />

      <div className="relative flex-1">
        <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-indigo-100">
          {eyebrow}
        </p>
        <h2 className="text-lg font-bold leading-snug">{title}</h2>
        <p className="mt-1 text-xs text-indigo-100">{subtitle}</p>
        <span className="mt-3 inline-block rounded-full bg-white px-4 py-2 text-xs font-bold text-indigo-600">
          {cta}
        </span>
      </div>

      <div className="relative shrink-0 rotate-3 rounded-md bg-white p-1.5 shadow-xl">
        {photoId ? (
          <PhotoImg photoId={photoId} className="h-20 w-16 rounded-sm" />
        ) : (
          <div className="flex h-20 w-16 items-center justify-center rounded-sm bg-indigo-50 text-3xl">
            {emoji ?? "✈️"}
          </div>
        )}
      </div>
    </Link>
  );
}

function StatCard({
  label,
  value,
  small,
}: {
  label: string;
  value: number | string;
  small?: boolean;
}) {
  return (
    <div className={`flex-1 rounded-2xl bg-gray-50 px-3 text-center ${small ? "py-2.5" : "py-3"}`}>
      <p className={`font-bold text-gray-900 ${small ? "text-sm" : "text-lg"}`}>{value}</p>
      <p className="text-[11px] text-gray-500">{label}</p>
    </div>
  );
}

/** "2026.07 – 2026.09" style range; one month collapses to a single value. */
function formatSpan(first: number | null, last: number | null): string {
  if (first == null || last == null) return "—";
  const fmt = (ms: number) => {
    const d = new Date(ms);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const a = fmt(first);
  const b = fmt(last);
  return a === b ? a : `${a} – ${b}`;
}

/** First-run guide: the three steps from photos to a shareable trip. */
function StartSteps() {
  const steps = [
    { n: "01", title: "사진 고르기", desc: "여행 사진을 한꺼번에 골라요" },
    { n: "02", title: "자동 정리", desc: "촬영일·장소로 Day가 만들어져요" },
    { n: "03", title: "동선 보기", desc: "지도에서 재생하고 영상으로 남겨요" },
  ];
  return (
    <div className="mt-5 rounded-3xl bg-gray-50 p-4">
      <ol className="flex flex-col gap-3">
        {steps.map((step) => (
          <li key={step.n} className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-xs font-black tracking-wider text-indigo-600 shadow-sm">
              {step.n}
            </span>
            <span>
              <span className="block text-sm font-bold text-gray-800">{step.title}</span>
              <span className="block text-xs text-gray-500">{step.desc}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-center text-[11px] text-gray-400">
        사진은 내 기기에서만 처리돼요 ·{" "}
        <Link to="/trips/new" className="font-medium text-indigo-500 underline underline-offset-2">
          직접 입력해서 만들기
        </Link>
      </p>
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
