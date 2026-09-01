import type { EventType, WorkStatus } from "../types";

export function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function statusLabel(status: WorkStatus): string {
  switch (status) {
    case "idle":
      return "未出勤";
    case "working":
      return "勤務中";
    case "on_break":
      return "休憩中";
  }
}

export function statusColor(status: WorkStatus): string {
  switch (status) {
    case "idle":
      return "#9ca3af";
    case "working":
      return "#22c55e";
    case "on_break":
      return "#f59e0b";
  }
}

export function eventTypeLabel(eventType: EventType): string {
  switch (eventType) {
    case "clock_in":
      return "出勤";
    case "clock_out":
      return "退勤";
    case "break_start":
      return "休憩開始";
    case "break_end":
      return "休憩終了";
  }
}

/** 時刻入力のフォーマットエラー文言 */
export const TIME_FORMAT_ERROR =
  "時刻は HH:MM または HH:MM:SS で入力してください（24時以降は 25:30 のように指定）";

/** 24 時超え表記として扱う上限（勤務日の 0 時から 48 時間未満） */
const EXTENDED_TIME_LIMIT_SEC = 48 * 3600;

/** 今日の date_key（"YYYY-MM-DD"）を返す */
export function todayKey(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 勤務日（date_key）の0時を基準にした 24 時超え表記の HH:MM:SS を返す。
 * 例: date_key="2026-09-01"、timestamp が 9/2 01:30 → "25:30:00"
 * 勤務日の 0 時より前、または 48 時間以上先の時刻は null を返す。
 * null のときは 24 時超え表記で編集できない（buildExtendedTimestamp で往復できない）
 */
export function formatExtendedTime(dateKey: string, isoString: string): string | null {
  const base = new Date(`${dateKey}T00:00:00`);
  const target = new Date(isoString);
  const diffMs = target.getTime() - base.getTime();
  if (Number.isNaN(diffMs)) return null;

  const totalSec = Math.floor(diffMs / 1000);
  if (totalSec < 0 || totalSec >= EXTENDED_TIME_LIMIT_SEC) return null;

  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** 勤務日をまたぐ時刻を、日付付きで表示する（24 時超え表記で扱えない場合の表示用） */
export function formatDateTimeLabel(isoString: string): string {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString;
  return `${d.getMonth() + 1}/${d.getDate()} ${formatTime(isoString)}`;
}

/** 24 時超え表記（"25:30" / "25:30:00"）を勤務日0時からの経過秒数に変換する。不正なら null */
export function parseExtendedTime(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  const s = match[3] ? Number(match[3]) : 0;
  if (m > 59 || s > 59) return null;
  const total = h * 3600 + m * 60 + s;
  // 勤務日の翌日いっぱい（47:59:59）まで許容する。formatExtendedTime の上限と揃える
  if (total >= EXTENDED_TIME_LIMIT_SEC) return null;
  return total;
}

/** ローカルTZ付き RFC3339 文字列を組み立てる */
function toLocalRfc3339(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const tzOffset = -date.getTimezoneOffset();
  const sign = tzOffset >= 0 ? "+" : "-";
  const tzH = p(Math.floor(Math.abs(tzOffset) / 60));
  const tzM = p(Math.abs(tzOffset) % 60);
  return (
    `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}` +
    `T${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}${sign}${tzH}:${tzM}`
  );
}

/**
 * 勤務日（date_key）＋24 時超え表記から、ローカルTZ付き RFC3339 を組み立てる。
 * 例: ("2026-09-01", "25:30") → "2026-09-02T01:30:00+09:00"
 */
export function buildExtendedTimestamp(dateKey: string, value: string): string | null {
  const secs = parseExtendedTime(value);
  if (secs === null) return null;
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setSeconds(date.getSeconds() + secs);
  return toLocalRfc3339(date);
}
