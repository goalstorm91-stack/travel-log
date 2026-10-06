import { Link } from "react-router-dom";

interface Lib {
  name: string;
  license: string;
  url: string;
  note?: string;
}

// Runtime dependencies shipped to the browser (versions as installed).
const LIBS: Lib[] = [
  { name: "React / React DOM", license: "MIT", url: "https://react.dev" },
  { name: "React Router", license: "MIT", url: "https://github.com/remix-run/react-router" },
  { name: "Dexie.js", license: "Apache-2.0", url: "https://dexie.org" },
  { name: "MapLibre GL JS", license: "BSD-3-Clause", url: "https://maplibre.org" },
  { name: "exifr", license: "MIT", url: "https://github.com/MikeKovarik/exifr" },
  { name: "heic2any", license: "MIT", url: "https://github.com/alexcorvi/heic2any", note: "내장된 libheif는 LGPL-3.0 (https://github.com/strukturag/libheif)" },
  { name: "mp4-muxer", license: "MIT", url: "https://github.com/Vanilagy/mp4-muxer" },
  { name: "d3-geo", license: "ISC", url: "https://d3js.org/d3-geo/" },
  { name: "topojson-client", license: "ISC", url: "https://github.com/topojson/topojson-client" },
  { name: "uuid", license: "MIT", url: "https://github.com/uuidjs/uuid" },
  { name: "Workbox", license: "MIT", url: "https://github.com/GoogleChrome/workbox", note: "오프라인 지원(서비스 워커)" },
  { name: "Tailwind CSS", license: "MIT", url: "https://tailwindcss.com", note: "스타일 (빌드 시 사용)" },
];

function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-indigo-600 underline underline-offset-2">
      {children}
    </a>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="mb-2 text-sm font-bold text-gray-900">{title}</h2>
      <div className="flex flex-col gap-2 text-[13px] leading-relaxed text-gray-600">{children}</div>
    </section>
  );
}

export default function Notice() {
  return (
    <div className="px-4 pt-6 pb-6">
      <div className="mb-6 flex items-center gap-3">
        <Link
          to="/settings"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-50 text-gray-600"
        >
          ‹
        </Link>
        <h1 className="text-xl font-bold text-gray-900">이용 안내 · 고지</h1>
      </div>

      <Section title="내 기록은 내 기기에만 저장돼요">
        <p>
          여행, 일지, 지출, 사진은 이 브라우저의 저장소(IndexedDB)에만 저장돼요. 서버로 보내지 않고,
          로그인이나 계정도 없어요.
        </p>
        <p>
          사진의 촬영 시각과 위치(GPS)는 장소를 알아내고 동선을 그리는 데만 쓰이며, 모두 기기 안에서
          처리돼요. 도시 찾기도 앱에 들어 있는 데이터로 하기 때문에 사진 위치가 밖으로 나가지 않아요.
        </p>
        <p>
          사진은 저장할 때 긴 변 1600px의 JPEG로 줄여요(설정에서 원본 저장으로 바꿀 수 있어요). HEIC
          사진은 항상 JPEG로 변환해요. 변환하면 사진 파일 안의 위치 정보는 사라지지만, 읽어 둔 촬영
          시각과 위치는 별도로 저장해 둬요.
        </p>
        <p>
          브라우저의 사이트 데이터를 지우면 기록도 함께 지워져요. 설정의 백업 파일은 사진과 위치 정보를
          모두 담고 있으니 다른 사람에게 보낼 때 주의해 주세요.
        </p>
      </Section>

      <Section title="밖으로 나가는 정보">
        <p>
          지도 화면과 동선 화면을 열면 지도 서버(
          <A href="https://openfreemap.org">OpenFreeMap</A>, tiles.openfreemap.org)에서 지도 스타일, 타일,
          글꼴, 아이콘을 받아와요. 이때 보고 있는 지역의 타일 요청과 IP 주소, 브라우저 정보 같은 일반적인
          접속 정보가 그 서버에 전달돼요. 사진, 여행 기록, 지출은 전달되지 않아요.
        </p>
        <p>
          앱 자체는 Vercel(<A href="https://vercel.com">vercel.com</A>)에서 제공돼요. 광고나 사용자 분석
          도구는 쓰지 않아요.
        </p>
        <p>
          공유 카드와 동선 영상은 내가 공유 버튼을 눌러 보낼 때만 선택한 앱으로 전달돼요. 영상에는 지도
          저작권 표기가 함께 들어가요.
        </p>
        <p>
          HEIC 사진을 처음 가져올 때만 변환 도구(약 1.3MB)를 추가로 내려받아요. 사진은 이 도구로 기기
          안에서 변환돼요.
        </p>
      </Section>

      <Section title="지도와 데이터 출처">
        <p>
          지도: © <A href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</A> (ODbL 1.0), ©{" "}
          <A href="https://openmaptiles.org">OpenMapTiles</A>, <A href="https://openfreemap.org">OpenFreeMap</A> 제공.
        </p>
        <p>
          국가 경계: <A href="https://www.naturalearthdata.com">Natural Earth</A>(퍼블릭 도메인), TopoJSON 변환본{" "}
          <A href="https://github.com/topojson/world-atlas">world-atlas</A>(ISC) 사용.
        </p>
        <p>
          도시 좌표: <A href="https://simplemaps.com/data/world-cities">SimpleMaps World Cities Database</A>(
          <A href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</A>). 일부 도시만 추리고 좌표를
          반올림하는 등 수정해서 사용했어요. 한국어 도시 이름 대응표는 직접 만들었어요.
        </p>
      </Section>

      <Section title="오픈소스 라이선스">
        <ul className="flex flex-col divide-y divide-gray-100 rounded-2xl bg-gray-50 px-4">
          {LIBS.map((lib) => (
            <li key={lib.name} className="py-2.5">
              <div className="flex items-center justify-between gap-3">
                <A href={lib.url}>{lib.name}</A>
                <span className="shrink-0 rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-gray-500">
                  {lib.license}
                </span>
              </div>
              {lib.note && <p className="mt-0.5 text-[11px] text-gray-400">{lib.note}</p>}
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-gray-400">
          각 라이선스의 전문은 위 링크의 프로젝트 저장소에서 확인할 수 있어요.
        </p>
      </Section>

      <p className="text-center text-sm font-semibold tracking-wide text-gray-700">
        Made by Seo Taeseong, 2026
      </p>
    </div>
  );
}
