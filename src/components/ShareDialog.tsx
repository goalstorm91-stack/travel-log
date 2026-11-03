import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { db } from "../db";
import type { DayEntry, Trip } from "../types";
import { getCountryLabel } from "../data/countries";
import { formatDateKR } from "../utils/format";
import { generateTripShareCard, shareBlob } from "../utils/shareCard";
import { isKakaoConfigured, sendKakaoCard } from "../utils/kakao";
import { APP_URL } from "../config";

/** Re-encodes the PNG card as JPEG: smaller, and accepted by every chat app. */
async function toJpeg(png: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(png);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("jpeg"))), "image/jpeg", 0.92),
  );
}

function buildShareText(trip: Trip, days: DayEntry[], photoCount: number): string {
  const lines = [
    `${trip.emoji} ${trip.title}`,
    `${getCountryLabel(trip.countryName)} ${trip.city} · ${formatDateKR(trip.startDate)} – ${formatDateKR(trip.endDate)}`,
    `기록 ${days.length}일 · 사진 ${photoCount}장`,
  ];
  const highlights = days.filter((d) => d.title).slice(0, 5);
  if (highlights.length > 0) {
    lines.push("");
    for (const d of highlights) lines.push(`Day ${d.dayNumber}  ${d.title}`);
  }
  lines.push("", `나만의 여행 일지 · ${APP_URL}`);
  return lines.join("\n");
}

type Note = { kind: "ok" | "info"; text: string } | null;

export default function ShareDialog({
  trip,
  days,
  onClose,
}: {
  trip: Trip;
  days: DayEntry[];
  onClose: () => void;
}) {
  const [card, setCard] = useState<{ jpeg: Blob; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const [kakaoBusy, setKakaoBusy] = useState(false);
  const urlRef = useRef<string | null>(null);

  const photoCount = useMemo(() => days.reduce((sum, d) => sum + d.photoIds.length, 0), [days]);
  const text = useMemo(() => buildShareText(trip, days, photoCount), [trip, days, photoCount]);
  const canShare = typeof navigator.share === "function";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const coverBlob = trip.coverPhotoId ? (await db.photos.get(trip.coverPhotoId))?.blob : undefined;
        const png = await generateTripShareCard(trip, { dayCount: days.length, photoCount }, coverBlob);
        const jpeg = await toJpeg(png);
        if (cancelled) return;
        const url = URL.createObjectURL(jpeg);
        urlRef.current = url;
        setCard({ jpeg, url });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
    // The card is built once per open; later edits show up the next time it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function shareKakao() {
    if (!card) return;
    setKakaoBusy(true);
    setNote(null);
    try {
      await sendKakaoCard({
        title: `${trip.emoji} ${trip.title}`,
        description: `${getCountryLabel(trip.countryName)} ${trip.city} · ${formatDateKR(trip.startDate)} – ${formatDateKR(trip.endDate)}\n기록 ${days.length}일 · 사진 ${photoCount}장`,
        image: card.jpeg,
      });
    } catch (err) {
      const msg = String((err as { msg?: string; message?: string })?.msg ?? (err as Error)?.message ?? "");
      setNote({
        kind: "info",
        text: /domain mismatched/i.test(msg)
          ? `이 주소(${location.origin})가 카카오 개발자 사이트의 Web 도메인에 등록돼 있지 않아요. 등록 후 다시 시도해 주세요.`
          : "카카오톡 카드를 보내지 못했어요. 인터넷 연결을 확인하거나, 아래 '카카오톡 · 다른 앱으로 보내기'를 써 주세요.",
      });
    } finally {
      setKakaoBusy(false);
    }
  }

  async function shareImage() {
    if (!card) return;
    // No text alongside the file: chat apps like KakaoTalk keep only one of the two on iOS.
    const result = await shareBlob(card.jpeg, `${trip.title}.jpg`, { title: trip.title });
    setNote(
      result === "shared"
        ? { kind: "ok", text: "공유 창을 열었어요." }
        : { kind: "info", text: "이미지를 저장했어요. 카카오톡에서 사진으로 보내면 돼요." },
    );
  }

  async function shareText() {
    if (canShare) {
      try {
        await navigator.share({ title: trip.title, text });
        setNote({ kind: "ok", text: "공유 창을 열었어요." });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }
    await copyText();
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      setNote({ kind: "ok", text: "글을 복사했어요. 카카오톡 대화창에 붙여넣기 하세요." });
    } catch {
      setNote({ kind: "info", text: "복사하지 못했어요. 아래 글을 길게 눌러 직접 복사해 주세요." });
    }
  }

  function saveImage() {
    if (!card) return;
    const a = document.createElement("a");
    a.href = card.url;
    a.download = `${trip.title}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setNote({ kind: "info", text: "이미지를 저장했어요." });
  }

  const btn =
    "flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-sm font-semibold disabled:opacity-40";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="여행 공유"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-[480px] overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-base font-bold text-gray-900">🔗 여행 공유하기</p>
          <button onClick={onClose} aria-label="닫기" className="h-11 w-11 rounded-full bg-gray-100 text-gray-500">
            ✕
          </button>
        </div>

        <div className="mx-auto mt-3 flex aspect-[4/5] max-h-52 items-center justify-center overflow-hidden rounded-2xl bg-gray-100">
          {card ? (
            <img src={card.url} alt="공유 카드 미리보기" className="h-full w-full object-contain" />
          ) : (
            <p className="text-xs text-gray-400">{failed ? "카드를 만들지 못했어요." : "카드 만드는 중…"}</p>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {isKakaoConfigured && (
            <button
              onClick={() => void shareKakao()}
              disabled={!card || kakaoBusy}
              className={`${btn} bg-yellow-300 text-gray-900`}
            >
              <span className="text-lg">💛</span>
              <span className="flex-1">
                {kakaoBusy ? "카카오톡 여는 중…" : "카카오톡으로 카드 보내기"}
                <span className="block text-[11px] font-normal text-gray-700/70">제목·날짜·사진이 담긴 카드 메시지로 보내요</span>
              </span>
            </button>
          )}
          <button
            onClick={() => void shareImage()}
            disabled={!card}
            className={`${btn} bg-amber-50 text-gray-800`}
          >
            <span className="text-lg">💬</span>
            <span className="flex-1">
              카카오톡 · 다른 앱으로 보내기
              <span className="block text-[11px] font-normal text-gray-700/70">카드 이미지(JPG)를 공유 창으로 보내요</span>
            </span>
          </button>
          <button onClick={() => void shareText()} className={`${btn} bg-indigo-50 text-indigo-700`}>
            <span className="text-lg">📝</span>
            <span className="flex-1">
              글로 보내기
              <span className="block text-[11px] font-normal text-indigo-600/70">
                {canShare ? "제목·날짜·Day 요약을 글로 보내요" : "글을 복사해서 붙여넣어요"}
              </span>
            </span>
          </button>
          <button onClick={saveImage} disabled={!card} className={`${btn} bg-gray-100 text-gray-700`}>
            <span className="text-lg">💾</span>
            <span className="flex-1">이미지 저장</span>
          </button>
        </div>

        {note && (
          <p
            className={`mt-3 text-center text-xs font-medium ${note.kind === "ok" ? "text-indigo-600" : "text-gray-500"}`}
          >
            {note.text}
          </p>
        )}

        <textarea
          readOnly
          value={text}
          rows={6}
          className="mt-3 w-full resize-none rounded-xl bg-gray-50 p-3 text-[11px] leading-relaxed text-gray-500"
          onFocus={(e) => e.currentTarget.select()}
        />
        <button onClick={() => void copyText()} className="mt-1 w-full py-2 text-xs font-medium text-gray-400">
          글 복사하기
        </button>
        <p className="mt-1 text-center text-[11px] text-gray-400">
          여행 기록은 이 기기에만 저장돼서, 링크로는 사진·글이 보이지 않고 이미지와 글로만 공유돼요.
        </p>
      </div>
    </div>,
    document.body,
  );
}
