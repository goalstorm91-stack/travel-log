import { Component, type ErrorInfo, type ReactNode } from "react";
import { exportBackup } from "../utils/backup";

interface State {
  error: Error | null;
  backupNote: string;
}

/**
 * Catches a crash in any page so people see what to do instead of a blank screen.
 * Their data lives in IndexedDB, untouched by a rendering error, so the backup
 * button still works. Remounted per route (see App), so leaving the page recovers.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, backupNote: "" };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[app]", error, info.componentStack);
  }

  private backup = async () => {
    this.setState({ backupNote: "백업 파일을 만드는 중…" });
    try {
      const s = await exportBackup();
      this.setState({ backupNote: `백업했어요. (여행 ${s.trips}개, 사진 ${s.photos}장)` });
    } catch {
      this.setState({ backupNote: "백업하지 못했어요. 잠시 후 다시 시도해 주세요." });
    }
  };

  render() {
    const { error, backupNote } = this.state;
    if (!error) return this.props.children;

    return (
      <div role="alert" className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-4xl">🧭</p>
        <h1 className="text-lg font-bold text-gray-900">화면을 불러오지 못했어요</h1>
        <p className="text-xs leading-relaxed text-gray-500">
          앱에 문제가 생겼지만 저장된 기록은 그대로 안전해요.
          <br />
          새로고침해도 계속 그러면 먼저 백업을 받아 두세요.
        </p>
        <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
          <button
            onClick={() => location.reload()}
            className="rounded-full bg-indigo-600 py-3 text-sm font-semibold text-white"
          >
            새로고침
          </button>
          <button
            onClick={() => {
              location.hash = "#/";
              this.setState({ error: null, backupNote: "" });
            }}
            className="rounded-full bg-gray-100 py-3 text-sm font-semibold text-gray-700"
          >
            홈으로 가기
          </button>
          <button
            onClick={() => void this.backup()}
            className="rounded-full border border-gray-200 py-3 text-sm font-semibold text-gray-600"
          >
            ⬇ 백업 파일 받기
          </button>
        </div>
        {backupNote && <p className="text-xs font-medium text-indigo-600">{backupNote}</p>}
        <p className="mt-3 max-w-xs break-words text-[10px] text-gray-300">{error.message}</p>
      </div>
    );
  }
}
