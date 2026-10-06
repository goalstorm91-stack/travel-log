import { useEffect, useState } from "react";

/**
 * The service worker swaps in a new build in the background, but the page that is
 * already open keeps running the old code until it reloads — which is how people
 * end up on a stale version without realising. When a new worker takes over, say
 * so and offer a reload (never reload on our own: it could interrupt a photo
 * import or a video export).
 */
export default function UpdateBanner() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // No controller yet means this is the very first install, not an update.
    let hadController = !!navigator.serviceWorker.controller;
    const onChange = () => {
      if (!hadController) {
        hadController = true;
        return;
      }
      setReady(true);
    };
    navigator.serviceWorker.addEventListener("controllerchange", onChange);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onChange);
  }, []);

  if (!ready) return null;
  return (
    <div
      role="status"
      className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-indigo-600 px-4 py-2.5 text-xs font-medium text-white"
    >
      <span>새 버전이 준비됐어요.</span>
      <button
        onClick={() => location.reload()}
        className="rounded-full bg-white px-3 py-1 font-semibold text-indigo-600"
      >
        지금 새로고침
      </button>
    </div>
  );
}
