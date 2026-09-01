import { useState } from "react";
import { TIME_FORMAT_ERROR, buildExtendedTimestamp, formatExtendedTime } from "../lib/formatters";
import type { StampEvent, WorkStatus } from "../types";
import { EventRow } from "./EventRow";

/** 退勤時刻の既定値。直前のイベントがこれより後なら、そこから初期値を決める */
const DEFAULT_CLOCK_OUT = "18:00";
const DEFAULT_BREAK_END = "17:30";

/**
 * 退勤追加フォームの初期値を決める。
 * 直前のイベントが 18:00 より後（深夜勤務など）の場合は、その 30 分後を初期値にする
 */
function initialFixTimes(
  dateKey: string,
  sessionEvents: StampEvent[],
): { clockOut: string; breakEnd: string } {
  const last = sessionEvents[sessionEvents.length - 1];
  const lastTime = last ? formatExtendedTime(dateKey, last.timestamp) : null;
  if (lastTime === null || lastTime <= DEFAULT_BREAK_END) {
    return { clockOut: DEFAULT_CLOCK_OUT, breakEnd: DEFAULT_BREAK_END };
  }

  const [h, m] = lastTime.split(":").map(Number);
  const p = (n: number) => String(n).padStart(2, "0");
  const shift = (addMinutes: number) => {
    const total = h * 60 + m + addMinutes;
    return `${p(Math.floor(total / 60))}:${p(total % 60)}`;
  };
  return { clockOut: shift(30), breakEnd: shift(1) };
}

interface Props {
  dateKey: string;
  workspaceId: number;
  events: StampEvent[];
  onUpdate: (id: number, newTimestamp: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onAddMissingClockOut: (
    dateKey: string,
    workspaceId: number,
    newTimestamp: string,
    breakEndTimestamp?: string,
  ) => Promise<void>;
}

/** 最後の clock_in 以降のイベント列から現在の状態を導出する */
function deriveSessionStatus(events: StampEvent[]): WorkStatus {
  if (events.length === 0) return "idle";
  const last = events[events.length - 1];
  switch (last.event_type) {
    case "clock_in":
    case "break_end":
      return "working";
    case "break_start":
      return "on_break";
    case "clock_out":
      return "idle";
  }
}

/** 最後の clock_in 以降のイベントだけを切り出す */
function lastSessionEvents(events: StampEvent[]): StampEvent[] {
  let lastClockInIdx = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].event_type === "clock_in") {
      lastClockInIdx = i;
      break;
    }
  }
  if (lastClockInIdx === -1) return [];
  return events.slice(lastClockInIdx);
}

export function DayEventList({
  dateKey,
  workspaceId,
  events,
  onUpdate,
  onDelete,
  onAddMissingClockOut,
}: Props) {
  const sessionEvents = lastSessionEvents(events);
  const sessionStatus = deriveSessionStatus(sessionEvents);
  const needsClockOut = sessionStatus === "working" || sessionStatus === "on_break";

  const [showFixForm, setShowFixForm] = useState(false);
  const [fixTime, setFixTime] = useState("");
  const [fixBreakEndTime, setFixBreakEndTime] = useState("");
  const [fixError, setFixError] = useState<string | null>(null);
  const [fixSaving, setFixSaving] = useState(false);

  const openFixForm = () => {
    const initial = initialFixTimes(dateKey, sessionEvents);
    setFixBreakEndTime(initial.breakEnd);
    setFixTime(initial.clockOut);
    setFixError(null);
    setShowFixForm(true);
  };

  const submitFix = async () => {
    if (!fixTime || fixSaving) return;
    const needsBreakEnd = sessionStatus === "on_break";
    if (needsBreakEnd && !fixBreakEndTime) return;

    // 勤務日の0時基準で解釈するので、25:30 のような 24 時超えも指定できる
    const clockOutTs = buildExtendedTimestamp(dateKey, fixTime);
    const breakEndTs = needsBreakEnd ? buildExtendedTimestamp(dateKey, fixBreakEndTime) : undefined;
    if (clockOutTs === null || (needsBreakEnd && breakEndTs === null)) {
      setFixError(TIME_FORMAT_ERROR);
      return;
    }

    setFixSaving(true);
    setFixError(null);
    try {
      await onAddMissingClockOut(dateKey, workspaceId, clockOutTs, breakEndTs ?? undefined);
      setShowFixForm(false);
    } catch (err) {
      setFixError(String(err));
    } finally {
      setFixSaving(false);
    }
  };

  if (events.length === 0) {
    return (
      <div style={{ padding: "8px 12px", fontSize: "13px", color: "#9ca3af" }}>
        イベントがありません
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {events.map((event) => (
        <EventRow key={event.id} event={event} onUpdate={onUpdate} onDelete={onDelete} />
      ))}

      {needsClockOut && (
        <div style={{ marginTop: "4px" }}>
          {!showFixForm ? (
            <button
              onClick={openFixForm}
              style={{
                background: "none",
                border: "none",
                color: "#6b7280",
                fontSize: "13px",
                cursor: "pointer",
                textDecoration: "underline",
                padding: "4px 0",
              }}
            >
              退勤を追加...
            </button>
          ) : (
            <div
              style={{
                padding: "12px",
                backgroundColor: "#fffbeb",
                borderRadius: "8px",
                border: "1px solid #fde68a",
              }}
            >
              <div style={{ fontSize: "13px", color: "#92400e", marginBottom: "8px" }}>
                退勤時刻を指定（Slack通知は送信されません）
              </div>
              <div style={{ fontSize: "12px", color: "#b45309", marginBottom: "8px" }}>
                深夜まで働いた日は 25:30 のように 24 時以降で入力できます
              </div>
              {sessionStatus === "on_break" && (
                <div style={{ marginBottom: "8px" }}>
                  <label
                    style={{
                      fontSize: "12px",
                      color: "#6b7280",
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    休憩終了時刻
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="17:30"
                    size={9}
                    value={fixBreakEndTime}
                    onChange={(e) => setFixBreakEndTime(e.target.value)}
                    disabled={fixSaving}
                    style={{
                      fontSize: "14px",
                      fontFamily: "monospace",
                      padding: "4px 8px",
                      border: "1px solid #d1d5db",
                      borderRadius: "6px",
                    }}
                  />
                </div>
              )}
              <div style={{ marginBottom: "10px" }}>
                <label
                  style={{
                    fontSize: "12px",
                    color: "#6b7280",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  退勤時刻
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="25:30"
                  size={9}
                  value={fixTime}
                  onChange={(e) => setFixTime(e.target.value)}
                  disabled={fixSaving}
                  style={{
                    fontSize: "14px",
                    fontFamily: "monospace",
                    padding: "4px 8px",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                  }}
                />
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                <button
                  onClick={submitFix}
                  disabled={
                    fixSaving || !fixTime || (sessionStatus === "on_break" && !fixBreakEndTime)
                  }
                  style={{
                    padding: "6px 14px",
                    fontSize: "13px",
                    backgroundColor: "#3b82f6",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: fixSaving ? "not-allowed" : "pointer",
                    opacity: fixSaving ? 0.6 : 1,
                  }}
                >
                  記録する
                </button>
                <button
                  onClick={() => setShowFixForm(false)}
                  disabled={fixSaving}
                  style={{
                    padding: "6px 14px",
                    fontSize: "13px",
                    backgroundColor: "transparent",
                    color: "#6b7280",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                    cursor: "pointer",
                  }}
                >
                  キャンセル
                </button>
              </div>
              {fixError && (
                <div style={{ marginTop: "8px", fontSize: "12px", color: "#dc2626" }}>
                  {fixError}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
