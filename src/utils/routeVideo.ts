import { LngLatBounds, Map as MLMap } from "maplibre-gl";
import { dayColor } from "./colors";
import { loadBaseStyle } from "./mapStyle";
import { playbackFrame, segmentMs, type Stop } from "./route";

/**
 * Route video export.
 *
 * Instead of screen-recording the live map (real-time, depends on the tab being
 * visible, and MediaRecorder gives WebM that iPhones can't play), we draw every
 * frame ourselves and encode with WebCodecs into an MP4:
 *   1. render the basemap once on an off-screen map fitted to the route,
 *   2. per frame, composite route/trail/markers/photo card on a 2D canvas,
 *   3. feed frames to a H.264 VideoEncoder and mux them with mp4-muxer.
 */

export interface VideoStopInfo {
  stop: Stop;
  dateLabel: string; // e.g. "2026년 7월 1일"
  place?: string;
  photo?: Blob; // first photo at this stop
}

export interface RouteVideoOptions {
  title: string;
  subtitle: string; // e.g. date range
  infos: VideoStopInfo[];
  onProgress?: (fraction: number, label: string) => void;
  signal?: AbortSignal;
}

const W = 720;
const H = 1280;
const FPS = 30;
const BITRATE = 4_000_000;
const MAP_X = 24;
const MAP_Y = 176;
const MAP_W = 672;
const MAP_H = 672;
const CARD_Y = 876;
const CARD_H = 344;
const THUMB = 296;
const INTRO_MS = 800;
const OUTRO_MS = 1400;
const FONT = '"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';
const CODECS = ["avc1.640028", "avc1.4d0028", "avc1.42e01f"]; // High, Main, Baseline (level 4.0/3.1)

export class VideoUnsupportedError extends Error {}

export function isRouteVideoSupported(): boolean {
  return typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined";
}

async function pickCodec(): Promise<string | null> {
  for (const codec of CODECS) {
    try {
      const r = await VideoEncoder.isConfigSupported({
        codec,
        width: W,
        height: H,
        bitrate: BITRATE,
        framerate: FPS,
      });
      if (r.supported) return codec;
    } catch {
      // try the next one
    }
  }
  return null;
}

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Renders the basemap for the route once, on an off-screen map fitted to the
 * stops, and returns it with each stop's pixel position. The map is torn down
 * before returning, so encoding doesn't hold a WebGL context.
 */
async function renderBasemap(
  stops: Stop[],
  signal?: AbortSignal,
): Promise<{ canvas: HTMLCanvasElement; points: { x: number; y: number }[] }> {
  const { style } = await loadBaseStyle();
  const container = document.createElement("div");
  Object.assign(container.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: `${MAP_W}px`,
    height: `${MAP_H}px`,
  });
  document.body.appendChild(container);

  let map: MLMap | null = null;
  try {
    const m = new MLMap({
      container,
      style,
      center: [stops[0].lng, stops[0].lat],
      zoom: 5,
      interactive: false,
      attributionControl: false,
      pixelRatio: 1,
      fadeDuration: 0,
      canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
    });
    map = m;

    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 20000);
      m.once("load", () => {
        clearTimeout(t);
        resolve();
      });
    });
    checkAbort(signal);

    const bounds = new LngLatBounds();
    stops.forEach((s) => bounds.extend([s.lng, s.lat]));
    m.fitBounds(bounds, { padding: 90, maxZoom: 14, animate: false });

    // 'idle' = every tile and glyph for this view has loaded and rendered.
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 30000);
      m.once("idle", () => {
        clearTimeout(t);
        resolve();
      });
    });
    checkAbort(signal);

    const canvas = document.createElement("canvas");
    canvas.width = MAP_W;
    canvas.height = MAP_H;
    canvas.getContext("2d")!.drawImage(m.getCanvas(), 0, 0, MAP_W, MAP_H);
    const points = stops.map((s) => {
      const p = m.project([s.lng, s.lat]);
      return { x: p.x, y: p.y };
    });
    return { canvas, points };
  } finally {
    map?.remove();
    container.remove();
  }
}

async function makeThumb(blob: Blob | undefined): Promise<HTMLCanvasElement | null> {
  if (!blob) return null;
  try {
    const bmp = await createImageBitmap(blob);
    const c = document.createElement("canvas");
    c.width = THUMB;
    c.height = THUMB;
    const side = Math.min(bmp.width, bmp.height);
    c.getContext("2d")!.drawImage(
      bmp,
      (bmp.width - side) / 2,
      (bmp.height - side) / 2,
      side,
      side,
      0,
      0,
      THUMB,
      THUMB,
    );
    bmp.close();
    return c;
  } catch {
    return null;
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, maxW: number, start: number, min: number, weight = 800) {
  let size = start;
  while (size > min) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    if (ctx.measureText(text).width <= maxW) break;
    size -= 2;
  }
  return size;
}

export async function exportRouteVideo(opts: RouteVideoOptions): Promise<Blob> {
  const { infos, signal, onProgress } = opts;
  if (!isRouteVideoSupported()) throw new VideoUnsupportedError("VideoEncoder unavailable");
  const stops = infos.map((i) => i.stop);
  if (stops.length < 2) throw new Error("need at least two stops");

  const codec = await pickCodec();
  if (!codec) throw new VideoUnsupportedError("no supported H.264 encoder");

  // ---- 1. basemap + photo thumbnails
  onProgress?.(0.02, "지도를 불러오는 중");
  const base = await renderBasemap(stops, signal);
  const pts = base.points;
  const lerp = (a: { x: number; y: number }, b: { x: number; y: number }, u: number) => ({
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
  });
  // Positions between stops are interpolated in screen space, which matches the
  // straight route lines.

  onProgress?.(0.2, "사진을 준비하는 중");
  const thumbs = await Promise.all(infos.map((i) => makeThumb(i.photo)));
  checkAbort(signal);

  // ---- 2. timeline
  const n = stops.length;
  const segMs = segmentMs(n, 12000);
  const playMs = (n - 1) * segMs;
  const totalMs = INTRO_MS + playMs + OUTRO_MS;
  const frameCount = Math.ceil((totalMs / 1000) * FPS);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { alpha: false })!;

  let lastSel = -1;
  let lastChange = -1e9;

  function drawFrame(ms: number) {
    const elapsed = Math.min(Math.max(ms - INTRO_MS, 0), playMs);
    const frame = playbackFrame(stops, elapsed, segMs)!;
    const moving = ms >= INTRO_MS;
    const sel = frame.selectedIdx;
    if (sel !== lastSel) {
      lastSel = sel;
      lastChange = ms;
    }
    const cardAlpha = Math.min(1, Math.max(0, (ms - lastChange) / 220));

    // background
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#4338ca");
    bg.addColorStop(1, "#1e1b4b");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // header
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = `700 22px ${FONT}`;
    ctx.fillText("TRAVEL JOURNAL", 40, 66);
    const titleSize = fitFont(ctx, opts.title, W - 80, 50, 30);
    ctx.fillStyle = "#fff";
    ctx.font = `800 ${titleSize}px ${FONT}`;
    ctx.fillText(opts.title, 40, 126);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = `500 24px ${FONT}`;
    ctx.fillText(opts.subtitle, 40, 162);

    // ---- map panel
    ctx.save();
    roundRect(ctx, MAP_X, MAP_Y, MAP_W, MAP_H, 30);
    ctx.clip();
    ctx.drawImage(base.canvas, MAP_X, MAP_Y);
    ctx.translate(MAP_X, MAP_Y);

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 1; i < n; i++) {
      const same = stops[i - 1].dayNumber === stops[i].dayNumber;
      ctx.beginPath();
      ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
      ctx.lineTo(pts[i].x, pts[i].y);
      if (same) {
        ctx.setLineDash([]);
        ctx.strokeStyle = dayColor(stops[i].dayNumber);
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 7;
      } else {
        ctx.setLineDash([12, 12]);
        ctx.strokeStyle = "#94a3b8";
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 5;
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    const cur = lerp(pts[frame.idx], pts[frame.idx + 1], frame.u);
    if (moving) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i <= frame.idx; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.lineTo(cur.x, cur.y);
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = 13;
      ctx.stroke();
      ctx.strokeStyle = "#312e81";
      ctx.lineWidth = 8;
      ctx.stroke();
    }

    // stop markers
    for (let i = 0; i < n; i++) {
      const selected = i === sel;
      const r = selected ? 23 : 17;
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, r, 0, Math.PI * 2);
      ctx.fillStyle = dayColor(stops[i].dayNumber);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#fff";
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `800 ${selected ? 22 : 17}px ${FONT}`;
      ctx.fillText(String(i + 1), pts[i].x, pts[i].y + 1);
    }

    // moving dot with a pulse
    if (moving) {
      const phase = (ms % 1400) / 1400;
      ctx.beginPath();
      ctx.arc(cur.x, cur.y, 13 + 16 * phase, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(49,46,129,${0.35 * (1 - phase)})`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cur.x, cur.y, 13, 0, Math.PI * 2);
      ctx.fillStyle = "#312e81";
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = "#fff";
      ctx.stroke();
    }

    // progress bar along the bottom of the map
    const progress = playMs > 0 ? elapsed / playMs : 1;
    ctx.fillStyle = "rgba(15,23,42,0.18)";
    ctx.fillRect(0, MAP_H - 8, MAP_W, 8);
    ctx.fillStyle = dayColor(stops[Math.min(n - 1, frame.idx + (frame.u >= 0.5 ? 1 : 0))].dayNumber);
    ctx.fillRect(0, MAP_H - 8, MAP_W * progress, 8);

    // required map attribution
    const attr = "© OpenStreetMap contributors · OpenMapTiles · OpenFreeMap";
    ctx.font = `500 14px ${FONT}`;
    const aw = ctx.measureText(attr).width + 20;
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    roundRect(ctx, MAP_W - aw - 12, MAP_H - 40, aw, 24, 8);
    ctx.fill();
    ctx.fillStyle = "#334155";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(attr, MAP_W - aw - 2, MAP_H - 28);
    ctx.restore();

    // ---- info card
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    roundRect(ctx, MAP_X, CARD_Y, MAP_W, CARD_H, 30);
    ctx.fill();

    const info = infos[sel];
    ctx.save();
    ctx.globalAlpha = cardAlpha;
    const tx = MAP_X + 24;
    const ty = CARD_Y + (CARD_H - THUMB) / 2;
    ctx.save();
    roundRect(ctx, tx, ty, THUMB, THUMB, 22);
    ctx.clip();
    const thumb = thumbs[sel];
    if (thumb) {
      ctx.drawImage(thumb, tx, ty);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(tx, ty, THUMB, THUMB);
    }
    ctx.restore();

    const x = tx + THUMB + 28;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = dayColor(info.stop.dayNumber);
    ctx.font = `800 24px ${FONT}`;
    ctx.fillText(`● STOP ${sel + 1} / ${n}`, x, ty + 36);
    ctx.fillStyle = "#fff";
    ctx.font = `800 54px ${FONT}`;
    ctx.fillText(`Day ${info.stop.dayNumber}`, x, ty + 100);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = `500 25px ${FONT}`;
    ctx.fillText(info.dateLabel, x, ty + 140);
    const time = new Date(info.stop.takenAt).toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    ctx.fillStyle = "#fff";
    ctx.font = `700 40px ${FONT}`;
    ctx.fillText(time, x, ty + 196);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = `500 25px ${FONT}`;
    const placeText = info.place ? `📍 ${info.place}` : "";
    if (placeText) {
      fitFont(ctx, placeText, MAP_X + MAP_W - 24 - x, 25, 16, 500);
      ctx.fillText(placeText, x, ty + 240);
    }
    ctx.font = `500 23px ${FONT}`;
    ctx.fillText(`📷 ${info.stop.photoIds.length}장`, x, ty + 282);
    ctx.restore();

    // footer
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = `400 19px ${FONT}`;
    ctx.fillText("Made by Seo Taeseong, 2026", W / 2, H - 30);
  }

  // ---- 3. encode
  const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({ target, video: { codec: "avc", width: W, height: H }, fastStart: "in-memory" });
  let encoderError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encoderError = e;
    },
  });
  encoder.configure({ codec, width: W, height: H, bitrate: BITRATE, framerate: FPS });

  try {
    for (let i = 0; i < frameCount; i++) {
      checkAbort(signal);
      if (encoderError) throw encoderError;
      drawFrame((i / FPS) * 1000);
      const frame = new VideoFrame(canvas, {
        timestamp: Math.round((i * 1e6) / FPS),
        duration: Math.round(1e6 / FPS),
      });
      encoder.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
      frame.close();

      while (encoder.encodeQueueSize > 10) await sleep(4);
      if (i % 5 === 0) {
        onProgress?.(0.25 + 0.72 * (i / frameCount), "영상을 만드는 중");
        await sleep(0); // let the UI paint and the cancel button respond
      }
    }
    await encoder.flush();
    if (encoderError) throw encoderError;
  } finally {
    if (encoder.state !== "closed") encoder.close();
  }

  muxer.finalize();
  onProgress?.(1, "완성");
  return new Blob([target.buffer], { type: "video/mp4" });
}
