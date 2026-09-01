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
  /** 勤務中セッションの date_key。この日だけ未退勤でも現在時刻まで集計する */
  activeDateKey: string | null;
}

const WEEKDAY_JP = ["日", "月", "火", "水", "木", "金", "土"];

/** "YYYY-MM-DD" → "M/D(曜)" */
function formatDateLabel(dateKey: string): string {
  const [, mStr, dStr] = dateKey.split("-");
  const date = new Date(`${dateKey}T00:00:00`);
  const w = WEEKDAY_JP[date.getDay()];
  return `${Number(mStr)}/${Number(dStr)}(${w})`;
}

interface WorkSession {
  startMs: number;
  /** 退勤済みなら退勤時刻。退勤漏れの場合は null */
  endMs: number | null;
  breakMs: number;
  /** break_end が来ていない休憩の開始時刻 */
  pendingBreakStartMs: number | null;
}

/**
 * イベント列を「出勤〜退勤」のセッション単位に分割する。
 * 1日に複数回の出退勤があっても、セッション間の空き時間を勤務時間に含めない
 */
function splitSessions(events: StampEvent[]): WorkSession[] {
  const sessions: WorkSession[] = [];
  let current: WorkSession | null = null;

  for (const ev of events) {
    const ms = new Date(ev.timestamp).getTime();
    if (Number.isNaN(ms)) continue;

    switch (ev.event_type) {
      case "clock_in":
        // 退勤漏れのまま次の出勤が来た場合、前のセッションは未完了のまま残す
        if (current) sessions.push(current);
        current = { startMs: ms, endMs: null, breakMs: 0, pendingBreakStartMs: null };
        break;
      case "clock_out":
        if (current) {
          if (current.pendingBreakStartMs !== null) {
            current.breakMs += Math.max(0, ms - current.pendingBreakStartMs);
            current.pendingBreakStartMs = null;
          }
          current.endMs = ms;
          sessions.push(current);
          current = null;
        }
        break;
      case "break_start":
        if (current) current.pendingBreakStartMs = ms;
        break;
      case "break_end":
        if (current && current.pendingBreakStartMs !== null) {
          current.breakMs += Math.max(0, ms - current.pendingBreakStartMs);
          current.pendingBreakStartMs = null;
        }
        break;
    }
  }
  if (current) sessions.push(current);

  return sessions;
}

/**
 * 当該イベント列の勤務分数を計算する（全セッションの合計）。
 * clock_out が無いセッションは、勤務中の日の最終セッションのときだけ「現在」を終端とする。
 * 深夜勤務で 0 時をまたぐと date_key と今日の日付がずれるため、
 * 日付の一致ではなく勤務中セッションの date_key で判定する
 */
function calcWorkMinutes(
  dateKey: string,
  events: StampEvent[],
  activeDateKey: string | null,
): number | null {
  const sessions = splitSessions(events);
  if (sessions.length === 0) return null;

  const fallbackEndMs = activeDateKey === dateKey ? Date.now() : null;

  let workMs = 0;
  let counted = false;

  sessions.forEach((session, i) => {
    const endMs = session.endMs ?? (i === sessions.length - 1 ? fallbackEndMs : null);
    if (endMs === null) return;

    let breakMs = session.breakMs;
    if (session.pendingBreakStartMs !== null) {
      breakMs += Math.max(0, endMs - session.pendingBreakStartMs);
    }
    workMs += Math.max(0, endMs - session.startMs - breakMs);
    counted = true;
  });

  if (!counted) return null;
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
  activeDateKey,
}: Props) {
  const workMinutes = calcWorkMinutes(dateKey, events, activeDateKey);
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
