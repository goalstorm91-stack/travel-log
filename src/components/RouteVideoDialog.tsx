import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { db } from "../db";
import type { DayEntry, Trip } from "../types";
import { getCountryLabel } from "../data/countries";
import { formatDateKR } from "../utils/format";
import type { Stop } from "../utils/route";
import { shareBlob } from "../utils/shareCard";
import {
  exportRouteVideo,
  isRouteVideoSupported,
  VideoUnsupportedError,
  type VideoStopInfo,
} from "../utils/routeVideo";

type Phase =
  | { name: "intro" }
  | { name: "working"; fraction: number; label: string }
  | { name: "done"; blob: Blob; url: string }
  | { name: "error"; message: string };

export default function RouteVideoDialog({
  trip,
  stops,
  days,
  dayFilter,
  onClose,
}: {
  trip: Trip;
  stops: Stop[];
  days: DayEntry[];
  dayFilter: number | null;
  onClose: () => void;
}) {
  const supported = isRouteVideoSupported();
  const [phase, setPhase] = useState<Phase>({ name: "intro" });
  const [shareNote, setShareNote] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const urlRef = useRef<string | null>(null);

  const dayByNumber = useMemo(() => new Map(days.map((d) => [d.dayNumber, d])), [days]);

  // Free the preview URL and stop any running export when the dialog goes away.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  function subtitle(): string {
    if (dayFilter != null) {
      const d = dayByNumber.get(dayFilter);
      return `Day ${dayFilter}${d ? ` · ${formatDateKR(d.date)}` : ""}`;
    }
    return `${getCountryLabel(trip.countryName)} ${trip.city} · ${formatDateKR(trip.startDate)} – ${formatDateKR(trip.endDate)}`;
  }

  async function start() {
    setShareNote("");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setPhase({ name: "working", fraction: 0, label: "준비하는 중" });

    // Best effort: keep the screen on while frames are being generated.
    let wake: { release: () => Promise<void> } | null = null;
    try {
      wake = (await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } })
        .wakeLock?.request("screen")) ?? null;
    } catch {
      wake = null;
    }

    try {
      const infos: VideoStopInfo[] = await Promise.all(
        stops.map(async (stop) => {
          const day = dayByNumber.get(stop.dayNumber);
          return {
            stop,
            dateLabel: day ? formatDateKR(day.date) : "",
            place: day?.locationName,
            photo: (await db.photos.get(stop.photoIds[0]))?.blob,
          };
        }),
      );
      const blob = await exportRouteVideo({
        title: trip.title,
        subtitle: subtitle(),
        infos,
        signal: ctrl.signal,
        onProgress: (fraction, label) => setPhase({ name: "working", fraction, label }),
      });
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setPhase({ name: "done", blob, url });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setPhase({ name: "intro" });
      } else if (err instanceof VideoUnsupportedError) {
        setPhase({
          name: "error",
          message: "이 브라우저는 영상 만들기를 지원하지 않아요. 최신 Chrome, Edge, Safari로 열어 주세요.",
        });
      } else {
        setPhase({ name: "error", message: "영상을 만들지 못했어요. 잠시 후 다시 시도해 주세요." });
      }
    } finally {
      void wake?.release().catch(() => undefined);
    }
  }

  async function save(blob: Blob) {
    const result = await shareBlob(blob, `${trip.title}-동선.mp4`, {
      title: `${trip.title} 동선`,
      text: `${trip.title} · ${getCountryLabel(trip.countryName)} ${trip.city}`,
    });
    setShareNote(result === "shared" ? "공유했어요!" : "영상을 저장했어요. 다운로드 폴더(또는 파일 앱)를 확인해 주세요.");
  }

  const busy = phase.name === "working";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="동선 영상 만들기"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      onClick={() => !busy && onClose()}
    >
      <div
        className="max-h-[92vh] w-full max-w-[480px] overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-base font-bold text-gray-900">🎬 동선 영상 만들기</p>

        {phase.name === "intro" && (
          <>
            <p className="mt-2 text-xs leading-relaxed text-gray-500">
              {dayFilter != null ? `Day ${dayFilter}` : "전체 동선"}의 정차 {stops.length}곳을 따라가는
              세로 영상(MP4)을 만들어요. 지도를 한 번 더 불러오고, 보통 10~30초 걸려요.
              <br />
              만드는 동안에는 이 화면을 켜 둔 채로 기다려 주세요.
            </p>
            {!supported && (
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
                이 브라우저는 영상 만들기를 지원하지 않아요. 최신 Chrome, Edge, Safari에서 열어 주세요.
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                onClick={start}
                disabled={!supported}
                className="flex-1 rounded-full bg-indigo-600 py-3 text-sm font-semibold text-white disabled:bg-gray-200 disabled:text-gray-400"
              >
                영상 만들기 시작
              </button>
              <button onClick={onClose} className="rounded-full border border-gray-200 px-5 text-sm font-semibold text-gray-500">
                닫기
              </button>
            </div>
          </>
        )}

        {phase.name === "working" && (
          <>
            <p className="mt-3 text-sm font-medium text-gray-700">
              {phase.label}... {Math.round(phase.fraction * 100)}%
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-indigo-500 transition-[width]"
                style={{ width: `${Math.round(phase.fraction * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-gray-400">다른 탭으로 이동하면 멈출 수 있어요.</p>
            <button
              onClick={() => abortRef.current?.abort()}
              className="mt-4 w-full rounded-full border border-gray-200 py-2.5 text-xs font-semibold text-gray-500"
            >
              취소
            </button>
          </>
        )}

        {phase.name === "done" && (
          <>
            <video
              src={phase.url}
              controls
              autoPlay
              loop
              muted
              playsInline
              className="mx-auto mt-3 max-h-[55vh] rounded-2xl bg-black"
            />
            <p className="mt-2 text-center text-[11px] text-gray-400">
              {(phase.blob.size / 1024 / 1024).toFixed(1)}MB · MP4 · 지도 저작권 표기가 영상에 들어 있어요
            </p>
            {shareNote && <p className="mt-2 text-center text-xs font-medium text-indigo-600">{shareNote}</p>}
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => void save(phase.blob)}
                className="flex-1 rounded-full bg-indigo-600 py-3 text-sm font-semibold text-white"
              >
                공유 · 저장하기
              </button>
              <button
                onClick={() => setPhase({ name: "intro" })}
                className="rounded-full border border-gray-200 px-4 text-xs font-semibold text-gray-500"
              >
                다시 만들기
              </button>
            </div>
            <button onClick={onClose} className="mt-2 w-full py-2 text-xs font-medium text-gray-400">
              닫기
            </button>
          </>
        )}

        {phase.name === "error" && (
          <>
            <p className="mt-3 rounded-xl bg-red-50 px-3 py-2.5 text-xs text-red-600">{phase.message}</p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setPhase({ name: "intro" })}
                className="flex-1 rounded-full bg-gray-900 py-2.5 text-xs font-semibold text-white"
              >
                처음으로
              </button>
              <button onClick={onClose} className="rounded-full border border-gray-200 px-5 text-xs font-semibold text-gray-500">
                닫기
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
