import PhotoImg from "./PhotoImg";

/**
 * Lays out photos in the "2 side-by-side, then 1 full-width" pattern
 * repeating every 3 photos, matching the reference journal layout.
 */
export default function PhotoCollage({
  photoIds,
  onPhotoClick,
}: {
  photoIds: string[];
  onPhotoClick?: (photoId: string, index: number) => void;
}) {
  const rows: string[][] = [];
  for (let i = 0; i < photoIds.length; i += 3) {
    rows.push(photoIds.slice(i, i + 3));
  }

  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((row, ri) => (
        <div key={ri} className="flex flex-col gap-1.5">
          {row.length >= 2 ? (
            <div className="flex gap-1.5">
              {row.slice(0, 2).map((id, ci) => (
                <PhotoImg
                  key={id}
                  photoId={id}
                  className="aspect-square w-1/2 rounded-xl"
                  onClick={() => onPhotoClick?.(id, ri * 3 + ci)}
                />
              ))}
            </div>
          ) : (
            row[0] && (
              <PhotoImg
                key={row[0]}
                photoId={row[0]}
                className="aspect-[4/3] w-full rounded-xl"
                onClick={() => onPhotoClick?.(row[0], ri * 3)}
              />
            )
          )}
          {row[2] && (
            <PhotoImg
              photoId={row[2]}
              className="aspect-[4/3] w-full rounded-xl"
              onClick={() => onPhotoClick?.(row[2], ri * 3 + 2)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
