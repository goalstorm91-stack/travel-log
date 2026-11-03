import { useEffect, useState } from "react";
import { db } from "../db";
import { getThumb } from "../utils/thumbs";

export default function PhotoImg({
  photoId,
  className,
  onClick,
  fit = "cover",
  size = "full",
  alt = "여행 사진",
}: {
  photoId: string;
  className?: string;
  onClick?: () => void;
  /** "cover" crops to fill the box (thumbnails); "contain" shows the whole photo. */
  fit?: "cover" | "contain";
  /** "thumb" uses a small copy: for tiles and cards. Leave "full" for big or zoomed views. */
  size?: "thumb" | "full";
  alt?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    const load = size === "thumb" ? getThumb(photoId) : db.photos.get(photoId).then((p) => p?.blob ?? null);
    load
      .then((blob) => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoId, size]);

  if (!url) {
    return <div className={`animate-pulse bg-gray-100 ${className ?? ""}`} />;
  }

  return (
    <img
      src={url}
      alt={alt}
      onClick={onClick}
      className={`${fit === "contain" ? "object-contain" : "object-cover"} ${className ?? ""}`}
      loading="lazy"
      decoding="async"
    />
  );
}
