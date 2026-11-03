// Per-deployment settings, read from `.env` (or the host's environment variables) at build
// time. See README.md for what to change when the app's address moves.

const clean = (v: string | undefined) => (v ?? "").trim().replace(/\/+$/, "");

/**
 * Canonical address of the app. Links inside shared messages use this rather than the
 * address the app happens to be open on (a preview build, localhost…). Falls back to the
 * current origin when it isn't configured.
 */
export const APP_URL = clean(import.meta.env.VITE_APP_URL) || location.origin;

/** Kakao JavaScript key. Empty means Kakao card sharing is switched off. */
export const KAKAO_JS_KEY = (import.meta.env.VITE_KAKAO_JS_KEY ?? "").trim();

/** The name shown on the end card of exported videos. */
export const APP_NAME = "여행 기록";
