import { useRef, useState } from "react";
import { eventTypeLabel, extractTimeForInput, replaceTimeInTimestamp } from "../lib/formatters";
import type { StampEvent } from "../types";

interface EventRowProps {
  event: StampEvent;
  onUpdate: (id: number, newTimestamp: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

export function EventRow({ event, onUpdate, onDelete }: EventRowProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setEditValue(extractTimeForInput(event.timestamp));
    setError(null);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const cancelEdit = () => {
    setEditing(false);
    setError(null);
  };

  const confirmEdit = async () => {
    if (saving) return;
    const original = extractTimeForInput(event.timestamp);
    if (editValue === original) {
      cancelEdit();
      return;
    }
    setSaving(true);
    try {
      const newTimestamp = replaceTimeInTimestamp(event.timestamp, editValue);
      await onUpdate(event.id, newTimestamp);
      setEditing(false);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const requestDelete = () => {
    setError(null);
    setConfirmingDelete(true);
  };

  const cancelDelete = () => {
    setConfirmingDelete(false);
  };

  const confirmDelete = async () => {
    try {
      setError(null);
      await onDelete(event.id);
      setConfirmingDelete(false);
    } catch (err) {
      setError(String(err));
      setConfirmingDelete(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      confirmEdit();
    } else if (e.key === "Escape") {
      cancelEdit();
    }
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "8px 12px",
          backgroundColor: "#f9fafb",
          borderRadius: "8px",
          fontSize: "14px",
          position: "relative",
        }}
        className="event-row"
      >
        {editing ? (
          <input
            ref={inputRef}
            type="time"
            step="1"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={cancelEdit}
            onKeyDown={handleKeyDown}
            disabled={saving}
            style={{
              fontFamily: "monospace",
              fontSize: "14px",
              border: "1px solid #3b82f6",
              borderRadius: "4px",
              padding: "2px 4px",
              outline: "none",
            }}
          />
        ) : (
          <span
            onClick={startEdit}
            title="クリックして時刻を修正"
            style={{
              color: "#9ca3af",
              fontFamily: "monospace",
              cursor: "pointer",
              borderBottom: "1px dashed #d1d5db",
            }}
          >
            {new Date(event.timestamp).toLocaleTimeString("ja-JP", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
        )}
        <span style={{ flex: 1 }}>{eventTypeLabel(event.event_type)}</span>
        {confirmingDelete ? (
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "#6b7280" }}>削除？</span>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={confirmDelete}
              style={{
                background: "#ef4444",
                color: "white",
                border: "none",
                borderRadius: "4px",
                padding: "2px 8px",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              削除
            </button>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={cancelDelete}
              style={{
                background: "transparent",
                color: "#6b7280",
                border: "1px solid #d1d5db",
                borderRadius: "4px",
                padding: "2px 8px",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              取消
            </button>
          </div>
        ) : (
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={requestDelete}
            title="削除"
            style={{
              background: "none",
              border: "none",
              color: "#9ca3af",
              cursor: "pointer",
              fontSize: "18px",
              padding: "0 6px",
              lineHeight: 1,
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#9ca3af")}
          >
            ×
          </button>
        )}
      </div>
      {error && (
        <div
          style={{
            fontSize: "12px",
            color: "#dc2626",
            padding: "4px 12px",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
