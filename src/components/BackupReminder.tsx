import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router-dom";
import { describeChanges, getBackupStatus, snoozeReminder } from "../utils/backupStatus";
import { runBackup } from "../utils/runBackup";

/**
 * Home-screen nudge to back up: shown when nothing has been backed up yet, or when
 * records changed and the last backup is a week old or more. "나중에" mutes it for 3 days.
 */
export default function BackupReminder() {
  const [tick, setTick] = useState(0); // re-evaluate after a backup or a snooze
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [note, setNote] = useState("");
  const status = useLiveQuery(() => getBackupStatus(), [tick]);

  if (!status || status.snoozed) return null;
  if (status.level !== "never" && status.level !== "stale") {
    // keep a just-finished confirmation on screen instead of vanishing instantly
    return note ? <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-700">✅ {note}</p> : null;
  }

  async function backupNow() {
    setNote("");
    setProgress({ done: 0, total: 0 });
    const result = await runBackup({ onProgress: (done, total) => setProgress({ done, total }) });
    setProgress(null);
    if (result.ok) setNote(result.text);
    else if (result.text !== "백업을 취소했어요.") setNote(result.text);
    setTick((t) => t + 1);
  }

  const changes = describeChanges(status);
  const busy = progress !== null;

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5">
      <p className="text-sm font-bold text-amber-800">💾 백업해 두면 안심이에요</p>
      <p className="mt-1 text-xs leading-relaxed text-amber-800/80">
        {status.level === "never"
          ? "아직 백업한 적이 없어요. 기록과 사진은 이 폰에만 있어서, 폰을 바꾸거나 브라우저 데이터가 지워지면 사라질 수 있어요."
          : `마지막 백업은 ${status.ageDays}일 전이에요.${changes ? ` ${changes}.` : ""}`}
      </p>
      <div className="mt-2.5 flex items-center gap-2">
        <button
          onClick={() => void backupNow()}
          disabled={busy}
          className="h-11 rounded-full bg-amber-500 px-5 text-xs font-bold text-white disabled:opacity-60"
        >
          {busy ? (progress!.total > 0 ? `사진 담는 중 ${progress!.done}/${progress!.total}` : "준비 중…") : "지금 백업하기"}
        </button>
        {!busy && (
          <button
            onClick={() => {
              snoozeReminder();
              setTick((t) => t + 1);
            }}
            className="h-11 px-3 text-xs font-medium text-amber-700/70"
          >
            나중에
          </button>
        )}
        <Link to="/settings" className="ml-auto inline-flex h-11 items-center text-[11px] text-amber-700/70 underline underline-offset-2">
          설정에서 보기
        </Link>
      </div>
    </div>
  );
}
