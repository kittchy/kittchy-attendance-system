import type { CurrentStatus } from "../types";
import { formatTime, statusColor, statusLabel } from "../lib/formatters";

interface Props {
  status: CurrentStatus;
}

export function StatusBadge({ status }: Props) {
  const color = statusColor(status.status);
  const label = statusLabel(status.status);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
      <div
        style={{
          width: "16px",
          height: "16px",
          borderRadius: "50%",
          backgroundColor: color,
          boxShadow: `0 0 8px ${color}`,
        }}
      />
      <span style={{ fontSize: "24px", fontWeight: "bold" }}>{label}</span>
      {status.workspace_name && status.status !== "idle" && (
        <span style={{ fontSize: "14px", color: "#6b7280", backgroundColor: "#f3f4f6", padding: "2px 8px", borderRadius: "4px" }}>
          {status.workspace_name}
        </span>
      )}
      {status.clock_in_time && (
        <span style={{ fontSize: "16px", color: "#6b7280" }}>
          {formatTime(status.clock_in_time)} から
        </span>
      )}
    </div>
  );
}
