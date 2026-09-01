import { useRef, useState } from "react";
import {
  TIME_FORMAT_ERROR,
  buildExtendedTimestamp,
  eventTypeLabel,
  formatDateTimeLabel,
  formatExtendedTime,
} from "../lib/formatters";
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

  // 勤務日の0時基準で表示・編集する（深夜勤務は 25:30:00 のような 24 時超え表記）。
  // 勤務日より前や 48 時間以上先の時刻は 24 時超え表記で往復できないため、編集させない
  const extendedTime = formatExtendedTime(event.date_key, event.timestamp);
  const editable = extendedTime !== null;
  const displayTime = extendedTime ?? formatDateTimeLabel(event.timestamp);

  const startEdit = () => {
    if (!editable) return;
    setEditValue(extendedTime);
    setError(null);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const cancelEdit = () => {
    setEditing(false);
    setError(null);
  };

  // 入力エラーを表示している間は、フォーカスが外れても入力内容を捨てない
  const handleBlur = () => {
    if (error !== null) return;
    cancelEdit();
  };

  const confirmEdit = async () => {
    if (saving) return;
    if (editValue === extendedTime) {
      cancelEdit();
      return;
    }
    const newTimestamp = buildExtendedTimestamp(event.date_key, editValue);
    if (newTimestamp === null) {
      setError(TIME_FORMAT_ERROR);
      return;
    }
    setSaving(true);
    try {
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
            type="text"
            inputMode="numeric"
            placeholder="25:30:00"
            title="24時以降は 25:30 のように入力できます"
            size={9}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleBlur}
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
            title={editable ? "クリックして時刻を修正" : "勤務日から離れた時刻のため編集できません"}
            style={{
              color: "#9ca3af",
              fontFamily: "monospace",
              cursor: editable ? "pointer" : "default",
              borderBottom: editable ? "1px dashed #d1d5db" : "none",
            }}
          >
            {displayTime}
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
