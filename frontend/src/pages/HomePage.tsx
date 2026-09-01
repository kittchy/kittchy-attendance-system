import { useState } from "react";
import { ActionButton } from "../components/ActionButton";
import { EventRow } from "../components/EventRow";
import { StatusBadge } from "../components/StatusBadge";
import { useAttendance } from "../hooks/useAttendance";
import { useWorkspaces } from "../hooks/useWorkspaces";
import { buildExtendedTimestamp } from "../lib/formatters";
import type { EventType } from "../types";

/** 今日の date_key（"YYYY-MM-DD"）を返す */
function todayKey(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 時刻入力のフォーマットエラー文言 */
const TIME_FORMAT_ERROR =
  "時刻は HH:MM または HH:MM:SS で入力してください（24時以降は 25:30 のように指定）";

interface Props {
  onNavigateHistory: () => void;
  onNavigateSettings: () => void;
}

export function HomePage({ onNavigateHistory, onNavigateSettings }: Props) {
  const {
    status,
    events,
    loading,
    error,
    doStamp,
    doUpdateEvent,
    doDeleteEvent,
    doAddMissingClockOut,
  } = useAttendance();
  const { workspaces, loading: wsLoading } = useWorkspaces();
  const [selectedWsId, setSelectedWsId] = useState<number | null>(null);
  const [showFixForm, setShowFixForm] = useState(false);
  const [fixTime, setFixTime] = useState("");
  const [fixBreakEndTime, setFixBreakEndTime] = useState("");
  const [fixError, setFixError] = useState<string | null>(null);
  const [fixSaving, setFixSaving] = useState(false);

  if (loading || wsLoading) {
    return <div style={{ padding: "32px", textAlign: "center" }}>読み込み中...</div>;
  }

  const handleStamp = (eventType: EventType) => {
    if (eventType === "clock_in") {
      // ワークスペースが1つだけなら自動選択、複数なら選択値を使用
      const wsId = workspaces.length === 1 ? workspaces[0].id : (selectedWsId ?? workspaces[0]?.id);
      doStamp(eventType, wsId);
    } else {
      doStamp(eventType);
    }
  };

  const showWorkspaceSelector = status.status === "idle" && workspaces.length > 1;

  const openFixForm = () => {
    setFixBreakEndTime("17:30");
    setFixTime("18:00");
    setFixError(null);
    setShowFixForm(true);
  };

  const submitFix = async () => {
    if (!fixTime || fixSaving) return;
    const needsBreakEnd = status.status === "on_break";
    if (needsBreakEnd && !fixBreakEndTime) return;

    // 勤務日の0時基準で解釈するので、25:30 のような 24 時超えも指定できる
    const dateKey = status.date_key ?? todayKey();
    const clockOutTs = buildExtendedTimestamp(dateKey, fixTime);
    const breakEndTs = needsBreakEnd ? buildExtendedTimestamp(dateKey, fixBreakEndTime) : undefined;
    if (clockOutTs === null || (needsBreakEnd && breakEndTs === null)) {
      setFixError(TIME_FORMAT_ERROR);
      return;
    }

    setFixSaving(true);
    setFixError(null);
    try {
      await doAddMissingClockOut(clockOutTs, breakEndTs ?? undefined);
      setShowFixForm(false);
    } catch (err) {
      setFixError(String(err));
    } finally {
      setFixSaving(false);
    }
  };

  return (
    <div style={{ padding: "32px", maxWidth: "480px", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
        <h1 style={{ fontSize: "20px", color: "#374151", margin: 0 }}>Kittchy 勤怠管理</h1>
        <button
          onClick={onNavigateSettings}
          title="設定"
          style={{
            background: "none",
            border: "none",
            fontSize: "20px",
            cursor: "pointer",
            color: "#6b7280",
            padding: "4px 8px",
            borderRadius: "8px",
            transition: "color 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#374151")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#6b7280")}
        >
          ⚙
        </button>
      </div>

      <StatusBadge status={status} />

      {/* ワークスペース選択（未出勤 かつ 2つ以上のWSがある場合のみ表示） */}
      {showWorkspaceSelector && (
        <div style={{ marginBottom: "16px" }}>
          <label style={{ fontSize: "13px", color: "#6b7280", display: "block", marginBottom: "4px" }}>
            ワークスペース
          </label>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {workspaces.map((ws) => {
              const isSelected = (selectedWsId ?? workspaces[0]?.id) === ws.id;
              return (
                <button
                  key={ws.id}
                  onClick={() => setSelectedWsId(ws.id)}
                  style={{
                    padding: "6px 16px",
                    borderRadius: "8px",
                    border: isSelected ? `2px solid ${ws.color}` : "1px solid #d1d5db",
                    backgroundColor: isSelected ? `${ws.color}15` : "white",
                    color: isSelected ? ws.color : "#6b7280",
                    fontSize: "14px",
                    fontWeight: isSelected ? "bold" : "normal",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {ws.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <ActionButton currentStatus={status.status} onStamp={handleStamp} />

      {(status.status === "working" || status.status === "on_break") && (
        <div style={{ marginBottom: "16px" }}>
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
              退勤漏れを修正...
            </button>
          ) : (
            <div
              style={{
                padding: "12px",
                backgroundColor: "#f9fafb",
                borderRadius: "8px",
                border: "1px solid #e5e7eb",
              }}
            >
              <div
                style={{
                  fontSize: "13px",
                  color: "#6b7280",
                  marginBottom: "8px",
                }}
              >
                退勤時刻を指定（Slack通知は送信されません）
              </div>
              <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "8px" }}>
                深夜まで働いた日は 25:30 のように 24 時以降で入力できます
              </div>
              {status.status === "on_break" && (
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
                    fixSaving || !fixTime || (status.status === "on_break" && !fixBreakEndTime)
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

      {error && (
        <div
          style={{
            padding: "12px",
            backgroundColor: "#fef2f2",
            color: "#dc2626",
            borderRadius: "8px",
            marginBottom: "16px",
            fontSize: "14px",
          }}
        >
          {error}
        </div>
      )}

      <div style={{ marginBottom: "24px" }}>
        <button
          onClick={onNavigateHistory}
          style={{
            background: "none",
            border: "1px solid #d1d5db",
            borderRadius: "8px",
            padding: "8px 20px",
            fontSize: "14px",
            cursor: "pointer",
            color: "#6b7280",
          }}
        >
          履歴・グラフ →
        </button>
      </div>

      {events.length > 0 && (
        <div>
          <h2 style={{ fontSize: "16px", color: "#6b7280", marginBottom: "12px" }}>本日の記録</h2>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            {events.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                onUpdate={doUpdateEvent}
                onDelete={doDeleteEvent}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
