import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import PhotoImg from "./PhotoImg";

/**
 * Full-screen photo viewer. Tapping the photo (or the backdrop) closes it, so
 * "tap to enlarge, tap again to go back" works; arrows, swipes and the
 * keyboard move between the photos of the group.
 */
export default function PhotoLightbox({
  photoIds,
  index,
  onClose,
  onIndexChange,
}: {
  photoIds: string[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}) {
  const count = photoIds.length;
  const touchStartX = useRef<number | null>(null);

  const go = (delta: number) => onIndexChange((index + delta + count) % count);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && count > 1) onIndexChange((index + 1) % count);
      else if (e.key === "ArrowLeft" && count > 1) onIndexChange((index - 1 + count) % count);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, count, onClose, onIndexChange]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="사진 크게 보기"
      data-testid="photo-lightbox"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3"
      onClick={onClose}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        const start = touchStartX.current;
        touchStartX.current = null;
        if (start == null || count < 2) return;
        const dx = e.changedTouches[0].clientX - start;
        if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
      }}
    >
      <PhotoImg
        key={photoIds[index]}
        photoId={photoIds[index]}
        fit="contain"
        className="max-h-full max-w-full cursor-zoom-out select-none rounded-lg"
        onClick={onClose}
      />

      <button
        aria-label="닫기"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-lg text-white"
      >
        ✕
      </button>

      {count > 1 && (
        <>
          <button
            aria-label="이전 사진"
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-xl text-white"
          >
            ‹
          </button>
          <button
            aria-label="다음 사진"
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-xl text-white"
          >
            ›
          </button>
          <p className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-white">
            {index + 1} / {count}
          </p>
        </>
      )}
    </div>,
    document.body,
  );
}
