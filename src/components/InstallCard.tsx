import { useEffect, useState } from "react";
import { APP_URL } from "../config";
import { getInstallKind, promptInstall, subscribeInstall, type InstallKind } from "../utils/pwa";

const DISMISS_KEY = "install-card-dismissed";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Invites people to install the app. On Home it can be dismissed for good;
 * in Settings (`always`) it stays so the instructions are never lost.
 */
export default function InstallCard({ always = false }: { always?: boolean }) {
  const [kind, setKind] = useState<InstallKind>(getInstallKind);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [copied, setCopied] = useState(false);

  useEffect(() => subscribeInstall(() => setKind(getInstallKind())), []);

  if (kind === "installed") {
    return always ? (
      <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-700">
        ✅ 앱으로 설치돼 있어요. 홈 화면 아이콘으로 바로 열 수 있어요.
      </p>
    ) : null;
  }
  if (!always && (dismissed || kind === "other")) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // private mode: it just comes back next time
    }
  }

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(APP_URL);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="relative rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3.5">
      {!always && (
        <button
          onClick={dismiss}
          aria-label="안내 닫기"
          className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-full text-xs text-indigo-300"
        >
          ✕
        </button>
      )}
      <p className="text-sm font-bold text-indigo-700">📲 앱처럼 설치해서 쓰기</p>

      {kind === "prompt" && (
        <>
          <p className="mt-1 text-xs leading-relaxed text-indigo-600/80">
            홈 화면에 추가하면 주소창 없이 앱처럼 열리고, 인터넷이 없어도 기록을 볼 수 있어요.
          </p>
          <button
            onClick={() => void promptInstall()}
            className="mt-2.5 rounded-full bg-indigo-600 px-4 py-2 text-xs font-semibold text-white"
          >
            앱 설치하기
          </button>
        </>
      )}

      {kind === "ios-safari" && (
        <ol className="mt-1.5 list-inside list-decimal space-y-0.5 text-xs leading-relaxed text-indigo-700/80">
          <li>
            Safari 아래쪽의 <b>공유 버튼(⬆︎)</b>을 눌러요.
          </li>
          <li>
            메뉴에서 <b>홈 화면에 추가</b>를 골라요. (안 보이면 아래로 스크롤)
          </li>
          <li>
            오른쪽 위 <b>추가</b>를 누르면 끝이에요.
          </li>
        </ol>
      )}

      {kind === "in-app-browser" && (
        <>
          <p className="mt-1 text-xs leading-relaxed text-indigo-700/80">
            카카오톡 등 앱 안의 브라우저에서는 설치할 수 없어요. 오른쪽 아래 <b>⋯ / 다른 브라우저로 열기</b>로
            Safari나 Chrome에서 연 뒤 설치해 주세요.
          </p>
          <button
            onClick={() => void copyAddress()}
            className="mt-2.5 rounded-full bg-white px-4 py-2 text-xs font-semibold text-indigo-600"
          >
            {copied ? "주소를 복사했어요" : "앱 주소 복사하기"}
          </button>
        </>
      )}

      {kind === "other" && (
        <p className="mt-1 text-xs leading-relaxed text-indigo-700/80">
          Chrome·Edge라면 주소창 오른쪽의 설치 아이콘(⊕), Android라면 메뉴의 <b>앱 설치 / 홈 화면에 추가</b>를
          눌러 주세요.
        </p>
      )}
    </div>
  );
}
