import { useState } from "react";
import PhotoImg from "./PhotoImg";
import PhotoLightbox from "./PhotoLightbox";

/**
 * Lays out photos in the "2 side-by-side, then 1 full-width" pattern
 * repeating every 3 photos, matching the reference journal layout.
 * Tapping a photo opens it full-screen; tapping again closes it.
 */
export default function PhotoCollage({ photoIds }: { photoIds: string[] }) {
  const [open, setOpen] = useState<number | null>(null);

  const rows: string[][] = [];
  for (let i = 0; i < photoIds.length; i += 3) {
    rows.push(photoIds.slice(i, i + 3));
  }

  return (
    <>
      <div className="flex flex-col gap-1.5">
        {rows.map((row, ri) => (
          <div key={ri} className="flex flex-col gap-1.5">
            {row.length >= 2 ? (
              <div className="flex gap-1.5">
                {row.slice(0, 2).map((id, ci) => (
                  <PhotoImg
                    key={id}
                    photoId={id}
                    className="aspect-square w-1/2 cursor-zoom-in rounded-xl"
                    onClick={() => setOpen(ri * 3 + ci)}
                  />
                ))}
              </div>
            ) : (
              row[0] && (
                <PhotoImg
                  key={row[0]}
                  photoId={row[0]}
                  className="aspect-[4/3] w-full cursor-zoom-in rounded-xl"
                  onClick={() => setOpen(ri * 3)}
                />
              )
            )}
            {row[2] && (
              <PhotoImg
                photoId={row[2]}
                className="aspect-[4/3] w-full cursor-zoom-in rounded-xl"
                onClick={() => setOpen(ri * 3 + 2)}
              />
            )}
          </div>
        ))}
      </div>

      {open != null && (
        <PhotoLightbox
          photoIds={photoIds}
          index={open}
          onClose={() => setOpen(null)}
          onIndexChange={setOpen}
        />
      )}
    </>
  );
}
