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
