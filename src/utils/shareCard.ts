import type { Trip } from "../types";
import { getCountryLabel } from "../data/countries";
import { formatDateKR } from "./format";

const W = 1080;
const H = 1350;

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: ImageBitmap,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const srcRatio = img.width / img.height;
  const dstRatio = w / h;
  let sx = 0,
    sy = 0,
    sw = img.width,
    sh = img.height;
  if (srcRatio > dstRatio) {
    sw = img.height * dstRatio;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / dstRatio;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startSize: number,
  minSize: number,
  weight = 800,
): number {
  let size = startSize;
  while (size > minSize) {
    ctx.font = `${weight} ${size}px sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 4;
  }
  return size;
}

export async function generateTripShareCard(
  trip: Trip,
  stats: { dayCount: number; photoCount: number },
  coverBlob?: Blob,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#6366f1");
  bg.addColorStop(1, "#4338ca");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.filter = "blur(90px)";
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.arc(W - 100, 120, 220, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(60, H - 160, 200, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Cover photo card
  const photoX = 60;
  const photoY = 150;
  const photoW = W - 120;
  const photoH = 620;
  if (coverBlob) {
    try {
      const bitmap = await createImageBitmap(coverBlob);
      ctx.save();
      roundRectPath(ctx, photoX, photoY, photoW, photoH, 32);
      ctx.clip();
      drawCoverImage(ctx, bitmap, photoX, photoY, photoW, photoH);
      ctx.restore();
    } catch {
      // fall through to placeholder
    }
  } else {
    ctx.save();
    roundRectPath(ctx, photoX, photoY, photoW, photoH, 32);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fill();
    ctx.font = "220px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(trip.emoji || "✈️", photoX + photoW / 2, photoY + photoH / 2);
    ctx.restore();
  }

  // Eyebrow
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = "700 30px sans-serif";
  ctx.fillText("TRAVEL JOURNAL", 60, 100);

  // Title
  const titleY = photoY + photoH + 100;
  const titleSize = fitFontSize(ctx, trip.title, W - 120, 76, 44);
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${titleSize}px sans-serif`;
  ctx.fillText(trip.title, 60, titleY);

  // Location + dates
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "600 36px sans-serif";
  const locationLine = `${getCountryLabel(trip.countryName)} · ${trip.city}`;
  ctx.fillText(locationLine, 60, titleY + 60);
  ctx.font = "400 32px sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.fillText(`${formatDateKR(trip.startDate)} - ${formatDateKR(trip.endDate)}`, 60, titleY + 110);

  // Stat pills
  const pillY = titleY + 160;
  const pills = [
    { label: "여행 일수", value: `${stats.dayCount}일` },
    { label: "기록한 사진", value: `${stats.photoCount}장` },
  ];
  let px = 60;
  for (const pill of pills) {
    ctx.font = "700 34px sans-serif";
    const valueWidth = ctx.measureText(pill.value).width;
    ctx.font = "500 26px sans-serif";
    const labelWidth = ctx.measureText(pill.label).width;
    const pillWidth = Math.max(valueWidth, labelWidth) + 56;
    roundRectPath(ctx, px, pillY, pillWidth, 110, 20);
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 34px sans-serif";
    ctx.fillText(pill.value, px + 28, pillY + 52);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "500 24px sans-serif";
    ctx.fillText(pill.label, px + 28, pillY + 88);
    px += pillWidth + 20;
  }

  // Footer credit
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = "400 24px sans-serif";
  ctx.fillText("Made by Seo Taeseong, 2026", W - 60, H - 50);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("이미지를 만들지 못했어요."));
    }, "image/png");
  });
}

export async function shareTripCard(trip: Trip, blob: Blob): Promise<"shared" | "downloaded"> {
  const file = new File([blob], `${trip.title}.png`, { type: "image/png" });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: trip.title,
        text: `${trip.title} · ${getCountryLabel(trip.countryName)} ${trip.city}`,
      });
      return "shared";
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return "shared";
      // fall through to download
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${trip.title}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return "downloaded";
}
