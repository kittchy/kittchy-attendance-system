import type { StampEvent, Workspace } from "../types";
import { DayEventList } from "./DayEventList";

interface Props {
  dateKey: string;
  workspaceId: number;
  workspace?: Workspace;
  events: StampEvent[];
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (id: number, newTimestamp: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onAddMissingClockOut: (
    dateKey: string,
    workspaceId: number,
    newTimestamp: string,
    breakEndTimestamp?: string,
  ) => Promise<void>;
  showWorkspaceLabel: boolean;
}

const WEEKDAY_JP = ["日", "月", "火", "水", "木", "金", "土"];

/** "YYYY-MM-DD" → "M/D(曜)" */
function formatDateLabel(dateKey: string): string {
  const [, mStr, dStr] = dateKey.split("-");
  const date = new Date(`${dateKey}T00:00:00`);
  const w = WEEKDAY_JP[date.getDay()];
  return `${Number(mStr)}/${Number(dStr)}(${w})`;
}

/** 当該イベント列の勤務分数を計算する。clock_out が無い場合は今日のみ「現在」を終端とする */
function calcWorkMinutes(dateKey: string, events: StampEvent[]): number | null {
  const clockIn = events.find((e) => e.event_type === "clock_in");
  if (!clockIn) return null;
  const lastClockOut = [...events].reverse().find((e) => e.event_type === "clock_out");

  const startMs = new Date(clockIn.timestamp).getTime();
  let endMs: number | null = null;
  if (lastClockOut) {
    endMs = new Date(lastClockOut.timestamp).getTime();
  } else {
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    if (dateKey === todayKey) {
      endMs = Date.now();
    } else {
      return null;
    }
  }

  let breakMs = 0;
  let breakStart: number | null = null;
  for (const ev of events) {
    if (ev.event_type === "break_start") {
      breakStart = new Date(ev.timestamp).getTime();
    } else if (ev.event_type === "break_end" && breakStart !== null) {
      breakMs += new Date(ev.timestamp).getTime() - breakStart;
      breakStart = null;
    }
  }
  if (breakStart !== null) {
    breakMs += Math.max(0, endMs - breakStart);
  }

  const workMs = Math.max(0, endMs - startMs - breakMs);
  return Math.round(workMs / 60000);
}

function formatHM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}時間${m}分`;
}

/** 退勤漏れ判定: 最後のイベントが clock_in / break_start / break_end ならまだ退勤していない */
function hasMissingClockOut(events: StampEvent[]): boolean {
  if (events.length === 0) return false;
  const last = events[events.length - 1];
  return last.event_type !== "clock_out";
}

export function DayAccordion({
  dateKey,
  workspaceId,
  workspace,
  events,
  expanded,
  onToggle,
  onUpdate,
  onDelete,
  onAddMissingClockOut,
  showWorkspaceLabel,
}: Props) {
  const workMinutes = calcWorkMinutes(dateKey, events);
  const missing = hasMissingClockOut(events);

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        overflow: "hidden",
        backgroundColor: "white",
      }}
    >
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "10px 12px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          fontSize: "14px",
          color: "#374151",
        }}
      >
        <span style={{ color: "#9ca3af", fontSize: "12px", width: "10px" }}>
          {expanded ? "▼" : "▶"}
        </span>
        <span style={{ fontWeight: "bold", minWidth: "70px" }}>{formatDateLabel(dateKey)}</span>
        {showWorkspaceLabel && workspace && (
          <span
            style={{
              fontSize: "12px",
              padding: "2px 8px",
              borderRadius: "4px",
              backgroundColor: `${workspace.color}15`,
              color: workspace.color,
              border: `1px solid ${workspace.color}40`,
            }}
          >
            {workspace.name}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {workMinutes !== null && (
          <span style={{ fontSize: "13px", color: "#6b7280" }}>{formatHM(workMinutes)}</span>
        )}
        {missing && (
          <span
            style={{
              fontSize: "11px",
              padding: "2px 6px",
              borderRadius: "4px",
              backgroundColor: "#fef3c7",
              color: "#92400e",
            }}
          >
            ⚠退勤漏れ
          </span>
        )}
      </button>
      {expanded && (
        <div style={{ padding: "8px 12px 12px 12px", borderTop: "1px solid #f3f4f6" }}>
          <DayEventList
            dateKey={dateKey}
            workspaceId={workspaceId}
            events={events}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onAddMissingClockOut={onAddMissingClockOut}
          />
        </div>
      )}
    </div>
  );
}
