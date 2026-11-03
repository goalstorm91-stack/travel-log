import InstallCard from "../components/InstallCard";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { importBackup, clearAllData } from "../utils/backup";
import { runBackup } from "../utils/runBackup";
import { describeChanges, getBackupStatus, type BackupStatus } from "../utils/backupStatus";
import { formatDateKR } from "../utils/format";
import { getKeepOriginals, setKeepOriginals } from "../utils/settings";
import { formatBytes, getStorageInfo, requestPersistentStorage, type StorageInfo } from "../utils/storage";

export default function Settings() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [tripPick, setTripPick] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);

  const [keepOriginals, setKeepOriginalsState] = useState(getKeepOriginals);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const refreshStorage = () => void getStorageInfo().then(setStorage);
  useEffect(refreshStorage, []);

  const counts = useLiveQuery(async () => ({
    trips: await db.trips.count(),
    photos: await db.photos.count(),
  }));
  const status = useLiveQuery(() => getBackupStatus(), [refreshTick]);
  const trips = useLiveQuery(() => db.trips.orderBy("createdAt").reverse().toArray(), []);

  async function handleExport(tripId?: string) {
    setBusy(true);
    setMessage(null);
    setProgress({ done: 0, total: 0 });
    try {
      const result = await runBackup({ tripId, onProgress: (done, total) => setProgress({ done, total }) });
      setMessage({ type: result.ok ? "ok" : "error", text: result.text });
    } finally {
      setProgress(null);
      setBusy(false);
      setRefreshTick((t) => t + 1);
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const summary = await importBackup(file, (info) => {
        const when = info.exportedAt ? `${formatDateKR(info.exportedAt.slice(0, 10))}에 만든 ` : "";
        return confirm(
          `${when}백업에 여행 ${info.trips}개, 하루 기록 ${info.days}개, 지출 ${info.expenses}건, 사진 ${info.photos}장이 들어 있어요.\n\n이 기기에 합칠까요? 같은 여행은 백업 내용으로 덮어써요.`,
        );
      });
      if (summary) {
        setMessage({
          type: "ok",
          text:
            `복원 완료! 여행 ${summary.trips}개, 하루 기록 ${summary.days}개, 지출 ${summary.expenses}건, 사진 ${summary.photos}장을 가져왔어요.` +
            (summary.skipped > 0 ? ` (파일에 없던 사진 ${summary.skipped}장은 건너뛰었어요.)` : ""),
        });
      }
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "가져오기에 실패했어요." });
    } finally {
      setBusy(false);
      setRefreshTick((t) => t + 1);
    }
  }

  async function handleClearAll() {
    const unsaved =
      status && (status.level === "never" || status.level === "stale")
        ? "\n\n⚠️ 최근 백업이 없어요. 지금 삭제하면 되돌릴 수 없어요."
        : "";
    if (!confirm(`모든 여행, 기록, 사진, 지출 데이터를 삭제할까요? 이 작업은 되돌릴 수 없어요.${unsaved}`)) return;
    if (!confirm("정말 삭제할까요? 백업 파일을 먼저 받아두는 것을 권장해요.")) return;
    setBusy(true);
    setMessage(null);
    try {
      await clearAllData();
      setMessage({ type: "ok", text: "모든 데이터를 삭제했어요." });
    } finally {
      setBusy(false);
      setRefreshTick((t) => t + 1);
    }
  }

  return (
    <div className="px-4 pt-6 pb-4">
      <div className="mb-5 flex items-center gap-3">
        <Link
          to="/"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-50 text-gray-600"
        >
          ‹
        </Link>
        <h1 className="text-xl font-bold text-gray-900">설정</h1>
      </div>

      <div className="mb-6 flex gap-3">
        <div className="flex-1 rounded-2xl bg-gray-50 px-3 py-3 text-center">
          <p className="text-lg font-bold text-gray-900">{counts?.trips ?? 0}</p>
          <p className="text-[11px] text-gray-500">저장된 여행</p>
        </div>
        <div className="flex-1 rounded-2xl bg-gray-50 px-3 py-3 text-center">
          <p className="text-lg font-bold text-gray-900">{counts?.photos ?? 0}</p>
          <p className="text-[11px] text-gray-500">저장된 사진</p>
        </div>
      </div>

      <section className="mb-6">
        <InstallCard always />
      </section>

      <section className="mb-6">
        <h2 className="mb-1 text-sm font-bold text-gray-800">데이터 백업</h2>
        <BackupStatusLine status={status} />
        <p className="mb-3 text-xs leading-relaxed text-gray-400">
          모든 여행 기록과 사진을 하나의 .zip 파일로 저장해요. 사진은 파일 그대로 들어 있어서 압축을 풀면 꺼내 볼
          수도 있어요. 아이폰에서는 공유 창에서 <b>파일에 저장</b>을 고르면 돼요. 홈 화면에 설치하지 않고 Safari로만
          쓰면 오래 안 쓴 사이트의 데이터가 정리될 수 있으니, 가끔 백업해 두세요.
        </p>
        <button
          onClick={() => void handleExport()}
          disabled={busy}
          className="w-full rounded-full bg-indigo-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {progress
            ? progress.total > 0
              ? `사진 담는 중… ${progress.done}/${progress.total}`
              : "준비 중…"
            : "⬇ 전체 백업하기"}
        </button>

        {trips && trips.length > 0 && (
          <>
            <div className="mt-3 flex gap-2">
              <select
                value={tripPick}
                onChange={(e) => setTripPick(e.target.value)}
                aria-label="내보낼 여행"
                className="input min-w-0 flex-1"
              >
                <option value="">여행 하나만 내보내기…</option>
                {trips.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.emoji} {t.title}
                  </option>
                ))}
              </select>
              <button
                onClick={() => void handleExport(tripPick)}
                disabled={busy || !tripPick}
                className="shrink-0 rounded-full border border-indigo-200 px-4 text-xs font-semibold text-indigo-600 disabled:opacity-40"
              >
                내보내기
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-gray-400">여행 하나만 내보낸 파일은 "전체 백업"으로 치지 않아요.</p>
          </>
        )}
      </section>

      <section className="mb-6">
        <h2 className="mb-1 text-sm font-bold text-gray-800">데이터 복원</h2>
        <p className="mb-3 text-xs text-gray-400">
          이전에 내보낸 백업 파일(.zip, 예전 .json도 가능)을 가져와요. 가져오기 전에 들어 있는 내용을 먼저 보여 드리고,
          같은 여행은 백업 내용으로 덮어써지고 새 데이터는 추가돼요.
        </p>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="w-full rounded-full border border-indigo-200 py-3 text-sm font-semibold text-indigo-600 disabled:opacity-50"
        >
          {busy && !progress ? "처리 중..." : "⬆ 백업 파일 가져오기"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip,.json,application/zip,application/json"
          className="hidden"
          onChange={handleImportFile}
        />
      </section>

      <section className="mb-6">
        <h2 className="mb-1 text-sm font-bold text-gray-800">사진 저장 방식</h2>
        <p className="mb-3 text-xs text-gray-400">
          기본은 긴 변 1600px의 JPEG로 줄여 저장해서 저장 공간과 백업 파일 크기를 아껴요. HEIC 사진은 항상
          JPEG로 변환돼요. 이미 저장된 사진에는 영향이 없어요.
        </p>
        <label className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3">
          <span className="text-sm font-medium text-gray-800">원본 크기로 저장</span>
          <input
            type="checkbox"
            checked={keepOriginals}
            onChange={(e) => {
              setKeepOriginalsState(e.target.checked);
              setKeepOriginals(e.target.checked);
            }}
            className="h-5 w-5 accent-indigo-600"
          />
        </label>

        <div className="mt-3 rounded-2xl bg-gray-50 px-4 py-3 text-xs text-gray-600">
          <p>
            저장 공간:{" "}
            <span className="font-semibold text-gray-800">
              {storage?.usage != null ? formatBytes(storage.usage) : "알 수 없음"}
            </span>
            {storage?.quota != null && <span className="text-gray-400"> / 허용량 {formatBytes(storage.quota)}</span>}
          </p>
          <p className="mt-1">
            데이터 보호:{" "}
            <span className="font-semibold text-gray-800">
              {storage?.persisted == null ? "지원 안 함" : storage.persisted ? "영구 저장됨" : "브라우저가 정리할 수 있음"}
            </span>
          </p>
          {storage?.persisted === false && (
            <button
              onClick={() => void requestPersistentStorage().then(refreshStorage)}
              className="mt-2 rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-indigo-600 shadow-sm"
            >
              영구 저장 요청하기
            </button>
          )}
        </div>
      </section>

      {message && (
        <p
          className={`mb-6 rounded-xl px-3 py-2.5 text-xs font-medium ${
            message.type === "ok" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"
          }`}
        >
          {message.text}
        </p>
      )}

      <Link
        to="/notice"
        className="mb-6 flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3.5 text-sm font-semibold text-gray-800"
      >
        이용 안내 · 고지
        <span className="text-gray-400">›</span>
      </Link>

      <section>
        <h2 className="mb-1 text-sm font-bold text-red-500">위험 구역</h2>
        <p className="mb-3 text-xs text-gray-400">
          이 브라우저에 저장된 모든 여행 데이터를 삭제해요. 백업 파일이 없다면 복구할 수 없어요.
        </p>
        <button
          onClick={handleClearAll}
          disabled={busy}
          className="w-full rounded-full border border-red-200 py-3 text-sm font-semibold text-red-500 disabled:opacity-50"
        >
          모든 데이터 삭제
        </button>
      </section>
    </div>
  );
}

function BackupStatusLine({ status }: { status: BackupStatus | undefined }) {
  if (!status || status.level === "none") return null;
  if (status.level === "never") {
    return (
      <p className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
        ⚠️ 아직 백업한 적이 없어요.
      </p>
    );
  }
  const d = new Date(status.lastAt!);
  const when = formatDateKR(`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`);
  const ago = status.ageDays === 0 ? "오늘" : `${status.ageDays}일 전`;
  const changes = describeChanges(status);
  return (
    <p
      className={`mb-2 rounded-xl px-3 py-2 text-xs font-medium ${
        status.level === "stale" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"
      }`}
    >
      {status.level === "stale" ? "⚠️" : "✅"} 마지막 전체 백업: {when} ({ago})
      {changes ? ` · ${changes}` : " · 백업 뒤 달라진 게 없어요"}
    </p>
  );
}
