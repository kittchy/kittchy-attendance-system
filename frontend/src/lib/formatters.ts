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

/** RFC3339 タイムスタンプから HH:MM:SS 形式を抽出する（input[type=time] 用） */
export function extractTimeForInput(isoString: string): string {
  const date = new Date(isoString);
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/** datetime-local の値（YYYY-MM-DDTHH:MM）からローカルTZ付きRFC3339を組み立てる */
export function buildLocalTimestamp(dateTimeLocal: string): string {
  const date = new Date(dateTimeLocal);
  const tzOffset = -date.getTimezoneOffset();
  const sign = tzOffset >= 0 ? "+" : "-";
  const tzH = String(Math.floor(Math.abs(tzOffset) / 60)).padStart(2, "0");
  const tzM = String(Math.abs(tzOffset) % 60).padStart(2, "0");
  return `${dateTimeLocal}:00${sign}${tzH}:${tzM}`;
}

/** 元のタイムスタンプの日付・タイムゾーンを保持しつつ、時刻だけを差し替えた RFC3339 を返す */
export function replaceTimeInTimestamp(
  originalTimestamp: string,
  newTime: string,
): string {
  // originalTimestamp: "2026-03-29T09:00:00+09:00"
  // newTime: "10:30:00"
  const match = originalTimestamp.match(
    /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2}|Z)$/,
  );
  if (match) {
    return `${match[1]}T${newTime}${match[2]}`;
  }
  // フォールバック: 元のタイムスタンプから日付部分を取得し、ローカルTZで組み立て
  const dateStr = originalTimestamp.split("T")[0];
  const date = new Date(originalTimestamp);
  const tzOffset = -date.getTimezoneOffset();
  const sign = tzOffset >= 0 ? "+" : "-";
  const tzH = String(Math.floor(Math.abs(tzOffset) / 60)).padStart(2, "0");
  const tzM = String(Math.abs(tzOffset) % 60).padStart(2, "0");
  return `${dateStr}T${newTime}${sign}${tzH}:${tzM}`;
}

/**
 * 勤務日（date_key）の0時を基準にした 24 時超え表記の HH:MM:SS を返す。
 * 例: date_key="2026-09-01"、timestamp が 9/2 01:30 → "25:30:00"
 * 勤務日より前の時刻など基準から外れる場合は通常の時刻表記にフォールバックする
 */
export function formatExtendedTime(dateKey: string, isoString: string): string {
  const base = new Date(`${dateKey}T00:00:00`);
  const target = new Date(isoString);
  const diffMs = target.getTime() - base.getTime();
  if (Number.isNaN(diffMs) || diffMs < 0) {
    return formatTime(isoString);
  }
  const totalSec = Math.floor(diffMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** 24 時超え表記（"25:30" / "25:30:00"）を勤務日0時からの経過秒数に変換する。不正なら null */
export function parseExtendedTime(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  const s = match[3] ? Number(match[3]) : 0;
  // 47:59:59 まで許容する（勤務日の翌日いっぱい）
  if (h > 47 || m > 59 || s > 59) return null;
  return h * 3600 + m * 60 + s;
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
