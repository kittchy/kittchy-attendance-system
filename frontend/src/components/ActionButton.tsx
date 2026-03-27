import type { EventType, WorkStatus } from "../types";

interface Props {
  currentStatus: WorkStatus;
  onStamp: (eventType: EventType) => void;
}

interface ButtonConfig {
  label: string;
  eventType: EventType;
  color: string;
}

function getButtons(status: WorkStatus): ButtonConfig[] {
  switch (status) {
    case "idle":
      return [{ label: "出勤", eventType: "clock_in", color: "#22c55e" }];
    case "working":
      return [
        { label: "休憩", eventType: "break_start", color: "#f59e0b" },
        { label: "退勤", eventType: "clock_out", color: "#ef4444" },
      ];
    case "on_break":
      return [{ label: "休憩終了", eventType: "break_end", color: "#3b82f6" }];
  }
}

export function ActionButton({ currentStatus, onStamp }: Props) {
  const buttons = getButtons(currentStatus);

  return (
    <div style={{ display: "flex", gap: "16px", marginBottom: "32px" }}>
      {buttons.map((btn) => (
        <button
          key={btn.eventType}
          onClick={() => onStamp(btn.eventType)}
          style={{
            padding: "16px 32px",
            fontSize: "18px",
            fontWeight: "bold",
            color: "white",
            backgroundColor: btn.color,
            border: "none",
            borderRadius: "12px",
            cursor: "pointer",
            minWidth: "120px",
            transition: "opacity 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >
          {btn.label}
        </button>
      ))}
    </div>
  );
}
