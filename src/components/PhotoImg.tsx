import { useEffect, useState } from "react";
import { db } from "../db";

export default function PhotoImg({
  photoId,
  className,
  onClick,
  fit = "cover",
}: {
  photoId: string;
  className?: string;
  onClick?: () => void;
  /** "cover" crops to fill the box (thumbnails); "contain" shows the whole photo. */
  fit?: "cover" | "contain";
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    db.photos.get(photoId).then((photo) => {
      if (cancelled || !photo) return;
      objectUrl = URL.createObjectURL(photo.blob);
      setUrl(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoId]);

  if (!url) {
    return <div className={`animate-pulse bg-gray-100 ${className ?? ""}`} />;
  }

  return (
    <img
      src={url}
      onClick={onClick}
      className={`${fit === "contain" ? "object-contain" : "object-cover"} ${className ?? ""}`}
      loading="lazy"
    />
  );
}
