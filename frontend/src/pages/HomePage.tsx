import { ActionButton } from "../components/ActionButton";
import { StatusBadge } from "../components/StatusBadge";
import { useAttendance } from "../hooks/useAttendance";
import { eventTypeLabel, formatTime } from "../lib/formatters";

interface Props {
  onNavigateHistory: () => void;
  onNavigateSettings: () => void;
}

export function HomePage({ onNavigateHistory, onNavigateSettings }: Props) {
  const { status, events, loading, error, doStamp } = useAttendance();

  if (loading) {
    return <div style={{ padding: "32px", textAlign: "center" }}>読み込み中...</div>;
  }

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

      <ActionButton currentStatus={status.status} onStamp={doStamp} />

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
              <div
                key={event.id}
                style={{
                  display: "flex",
                  gap: "12px",
                  padding: "8px 12px",
                  backgroundColor: "#f9fafb",
                  borderRadius: "8px",
                  fontSize: "14px",
                }}
              >
                <span style={{ color: "#9ca3af", fontFamily: "monospace" }}>
                  {formatTime(event.timestamp)}
                </span>
                <span>{eventTypeLabel(event.event_type)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
