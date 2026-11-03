import { describe, expect, it } from "vitest";
import jsQR from "jsqr";
import { QR_QUIET_ZONE, qrMatrix, qrText } from "./qr";

/** Rasterises the matrix like drawQr does (white quiet zone + dark modules). */
function rasterise(text: string, cell: number) {
  const m = qrMatrix(text);
  const modules = m.length + QR_QUIET_ZONE * 2;
  const size = modules * cell;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  m.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (!dark) return;
      for (let y = 0; y < cell; y++) {
        for (let x = 0; x < cell; x++) {
          const i = (((r + QR_QUIET_ZONE) * cell + y) * size + (c + QR_QUIET_ZONE) * cell + x) * 4;
          data[i] = 0x1e;
          data[i + 1] = 0x1b;
          data[i + 2] = 0x4b;
        }
      }
    }),
  );
  return { data, size };
}

describe("qrMatrix", () => {
  it("is square and has the three finder patterns", () => {
    const m = qrMatrix("https://travellog2.vercel.app");
    const n = m.length;
    expect(m.every((row) => row.length === n)).toBe(true);
    for (const [r, c] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
      expect(m[r][c]).toBe(true); // outer corner of a finder
      expect(m[r + 3][c + 3]).toBe(true); // its centre
      expect(m[r + 1][c + 1]).toBe(false); // the light ring between them
    }
  });

  it.each(["https://travellog2.vercel.app", "https://example.com/a/long/path?with=query&and=more#hash"])(
    "scans back to exactly %s",
    (url) => {
      const { data, size } = rasterise(url, 8);
      expect(jsQR(data, size, size)?.data).toBe(url);
    },
  );

  it("percent-encodes non-ASCII addresses instead of garbling them, and leaves ASCII ones alone", () => {
    const url = "https://example.com/여행";
    expect(qrText(url)).toBe("https://example.com/%EC%97%AC%ED%96%89");
    const { data, size } = rasterise(url, 8);
    expect(jsQR(data, size, size)?.data).toBe("https://example.com/%EC%97%AC%ED%96%89");
    expect(qrText("https://a.b/c%20d")).toBe("https://a.b/c%20d"); // already encoded: untouched
  });
});
