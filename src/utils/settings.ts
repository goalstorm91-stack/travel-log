// Small per-device preferences, kept in localStorage (they don't belong in a backup).
const KEEP_ORIGINALS_KEY = "keep-original-photos";

export function getKeepOriginals(): boolean {
  try {
    return localStorage.getItem(KEEP_ORIGINALS_KEY) === "1";
  } catch {
    return false;
  }
}

export function setKeepOriginals(value: boolean): void {
  try {
    localStorage.setItem(KEEP_ORIGINALS_KEY, value ? "1" : "0");
  } catch {
    // storage unavailable (private mode) — the default (downscale) applies
  }
}

const VIDEO_END_CARD_KEY = "video-end-card";

/** Whether exported route videos end with the app card (name, address, QR). On unless switched off. */
export function getVideoEndCard(): boolean {
  try {
    return localStorage.getItem(VIDEO_END_CARD_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setVideoEndCard(value: boolean): void {
  try {
    localStorage.setItem(VIDEO_END_CARD_KEY, value ? "1" : "0");
  } catch {
    // storage unavailable: the default (on) applies next time
  }
}
