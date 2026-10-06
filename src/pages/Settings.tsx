import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { exportBackup, importBackup, clearAllData, type BackupSummary } from "../utils/backup";
import { getKeepOriginals, setKeepOriginals } from "../utils/settings";
import { formatBytes, getStorageInfo, requestPersistentStorage, type StorageInfo } from "../utils/storage";

export default function Settings() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const [keepOriginals, setKeepOriginalsState] = useState(getKeepOriginals);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const refreshStorage = () => void getStorageInfo().then(setStorage);
  useEffect(refreshStorage, []);

  const counts = useLiveQuery(async () => ({
    trips: await db.trips.count(),
    photos: await db.photos.count(),
  }));

  async function handleExport() {
    setBusy(true);
    setMessage(null);
    try {
      const summary: BackupSummary = await exportBackup();
      setMessage({
        type: "ok",
        text: `백업 파일을 내려받았어요. (여행 ${summary.trips}개, 사진 ${summary.photos}장)`,
      });
    } catch {
      setMessage({ type: "error", text: "내보내기에 실패했어요." });
    } finally {
      setBusy(false);
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const summary = await importBackup(file);
      setMessage({
        type: "ok",
        text: `복원 완료! 여행 ${summary.trips}개, 하루 기록 ${summary.days}개, 지출 ${summary.expenses}건, 사진 ${summary.photos}장을 가져왔어요.`,
      });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "가져오기에 실패했어요." });
    } finally {
      setBusy(false);
    }
  }

  async function handleClearAll() {
    if (!confirm("모든 여행, 기록, 사진, 지출 데이터를 삭제할까요? 이 작업은 되돌릴 수 없어요.")) return;
    if (!confirm("정말 삭제할까요? 백업 파일을 먼저 받아두는 것을 권장해요.")) return;
    setBusy(true);
    setMessage(null);
    try {
      await clearAllData();
      setMessage({ type: "ok", text: "모든 데이터를 삭제했어요." });
    } finally {
      setBusy(false);
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
        <h2 className="mb-1 text-sm font-bold text-gray-800">데이터 백업</h2>
        <p className="mb-3 text-xs text-gray-400">
          모든 여행 기록과 사진을 하나의 파일로 내려받아요. 기기를 바꾸거나 브라우저 데이터를
          지우기 전에 백업해두면 안전해요.
        </p>
        <button
          onClick={handleExport}
          disabled={busy}
          className="w-full rounded-full bg-indigo-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "처리 중..." : "⬇ 백업 파일 내보내기"}
        </button>
      </section>

      <section className="mb-6">
        <h2 className="mb-1 text-sm font-bold text-gray-800">데이터 복원</h2>
        <p className="mb-3 text-xs text-gray-400">
          이전에 내보낸 백업 파일을 가져와 복원해요. 같은 ID의 기존 데이터는 백업 내용으로
          덮어써지고, 새 데이터는 추가돼요.
        </p>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="w-full rounded-full border border-indigo-200 py-3 text-sm font-semibold text-indigo-600 disabled:opacity-50"
        >
          {busy ? "처리 중..." : "⬆ 백업 파일 가져오기"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
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
