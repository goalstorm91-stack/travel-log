// Install helpers. Chrome/Edge/Samsung Internet on Android fire `beforeinstallprompt`
// once and only if someone is listening, so it's captured at startup (imported from
// main.tsx); iOS has no such event — it only offers Share → Add to Home Screen.

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export type InstallKind =
  | "installed" // already running as an installed app
  | "prompt" // one-tap install is available
  | "ios-safari" // manual: Share → Add to Home Screen
  | "in-app-browser" // KakaoTalk, Instagram… cannot install; open in a real browser first
  | "other";

export function getInstallKind(): InstallKind {
  if (isStandalone()) return "installed";
  if (deferred) return "prompt";
  const ua = navigator.userAgent;
  if (/KAKAOTALK|Instagram|FBAN|FBAV|NAVER\(inapp|Line\//i.test(ua)) return "in-app-browser";
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  // Only Safari can add to the Home Screen reliably; Chrome/Firefox on iOS say CriOS/FxiOS.
  if (ios && !/CriOS|FxiOS|EdgiOS/.test(ua)) return "ios-safari";
  return "other";
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferred) return "unavailable";
  const ev = deferred;
  deferred = null; // a prompt event can only be used once
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  notify();
  return outcome;
}
