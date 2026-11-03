import { buildBackup, deliverBackup } from "./backup";
import { formatBytes } from "./storage";

export interface BackupOutcome {
  ok: boolean;
  text: string;
}

/** Build + hand over a backup and describe what happened, for any screen that offers one. */
export async function runBackup(opts: {
  tripId?: string;
  onProgress?: (done: number, total: number) => void;
} = {}): Promise<BackupOutcome> {
  try {
    const built = await buildBackup(opts);
    const size = formatBytes(built.blob.size);
    const what = `여행 ${built.summary.trips}개, 사진 ${built.summary.photos}장`;
    const result = await deliverBackup(built);
    if (result === "cancelled") return { ok: false, text: "백업을 취소했어요." };
    return {
      ok: true,
      text:
        result === "shared"
          ? `백업 파일(${size}, ${what})을 만들었어요. 파일 앱·드라이브 같은 곳에 저장했는지 꼭 확인해 주세요.`
          : `백업 파일(${size}, ${what})을 내려받았어요. 다운로드 폴더(또는 파일 앱)를 확인해 주세요.`,
    };
  } catch (err) {
    return { ok: false, text: err instanceof Error && err.message ? err.message : "백업하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
}
