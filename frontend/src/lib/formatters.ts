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
