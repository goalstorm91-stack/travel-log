import qrcode from "qrcode-generator";

/**
 * The library encodes text as single bytes, so non-ASCII characters would be garbled.
 * Addresses are ASCII in practice; if one isn't, use its percent-encoded form, which
 * is how a browser would send it anyway.
 */
export function qrText(text: string): string {
  return /[\u0080-￿]/.test(text) ? encodeURI(text) : text;
}

/** QR modules for `text` (true = dark), medium error correction. Without the quiet zone. */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, "M"); // 0 = smallest version that fits
  qr.addData(qrText(text));
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/** Quiet-zone width (in modules) that scanners need around a QR code. */
export const QR_QUIET_ZONE = 4;

/**
 * Draws a QR code for `text` centred in a white rounded panel of `size` px at (x, y),
 * on a canvas. The panel includes the quiet zone, so it scans on any background.
 */
export function drawQr(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  opts: { dark?: string; radius?: number } = {},
) {
  const m = qrMatrix(text);
  const modules = m.length + QR_QUIET_ZONE * 2;
  const cell = Math.floor(size / modules); // whole pixels keep the edges crisp
  const used = cell * modules;
  const ox = x + Math.floor((size - used) / 2);
  const oy = y + Math.floor((size - used) / 2);

  ctx.save();
  ctx.fillStyle = "#ffffff";
  const r = opts.radius ?? 0;
  if (r > 0) {
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, r);
    ctx.fill();
  } else {
    ctx.fillRect(x, y, size, size);
  }
  ctx.fillStyle = opts.dark ?? "#1e1b4b";
  for (let row = 0; row < m.length; row++) {
    for (let col = 0; col < m.length; col++) {
      if (m[row][col]) ctx.fillRect(ox + (col + QR_QUIET_ZONE) * cell, oy + (row + QR_QUIET_ZONE) * cell, cell, cell);
    }
  }
  ctx.restore();
}
