import { useEffect, useRef, useState } from "react";
import { useWorkspaces } from "../hooks/useWorkspaces";
import { createWorkspace, deleteWorkspace, updateWorkspace } from "../lib/commands";
import type { Workspace } from "../types";

interface Props {
  onBack: () => void;
}

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

export function SettingsPage({ onBack }: Props) {
  const { workspaces, loading, refresh } = useWorkspaces();
  const [editingWs, setEditingWs] = useState<Workspace | null>(null);
  const [newWsName, setNewWsName] = useState("");
  const [newWsColor, setNewWsColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const showSavedFeedback = () => {
    setSaved(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
  };

  const handleAddWorkspace = async () => {
    if (!newWsName.trim()) return;
    try {
      setError(null);
      await createWorkspace(newWsName.trim(), newWsColor);
      setNewWsName("");
      setNewWsColor(COLORS[0]);
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleSaveWorkspace = async (ws: Workspace) => {
    setSaving(true);
    try {
      setError(null);
      await updateWorkspace(ws);
      setEditingWs(null);
      await refresh();
      showSavedFeedback();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteWorkspace = async (id: number) => {
    try {
      setError(null);
      await deleteWorkspace(id);
      setEditingWs(null);
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  };

  if (loading) {
    return <div style={{ padding: "32px", textAlign: "center" }}>読み込み中...</div>;
  }

  return (
    <div style={{ padding: "24px", maxWidth: "520px", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: "24px" }}>
        <button
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            fontSize: "16px",
            cursor: "pointer",
            color: "#3b82f6",
            padding: "4px 8px",
          }}
        >
          ← 戻る
        </button>
        <h1 style={{ fontSize: "18px", marginLeft: "8px", color: "#374151" }}>設定</h1>
        {saved && (
          <span style={{ marginLeft: "auto", fontSize: "13px", color: "#22c55e" }}>保存しました</span>
        )}
      </div>

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

      {/* ワークスペース一覧 */}
      <h2 style={{ fontSize: "16px", color: "#374151", marginBottom: "12px" }}>ワークスペース</h2>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "24px" }}>
        {workspaces.map((ws) => (
          <WorkspaceCard
            key={ws.id}
            workspace={ws}
            isEditing={editingWs?.id === ws.id}
            editingWs={editingWs?.id === ws.id ? editingWs : null}
            saving={saving}
            onStartEdit={() => setEditingWs({ ...ws })}
            onCancelEdit={() => setEditingWs(null)}
            onUpdateField={(field, value) => {
              if (editingWs) setEditingWs({ ...editingWs, [field]: value });
            }}
            onSave={() => editingWs && handleSaveWorkspace(editingWs)}
            onDelete={() => handleDeleteWorkspace(ws.id)}
          />
        ))}
      </div>

      {/* ワークスペース追加 */}
      <div
        style={{
          backgroundColor: "#f9fafb",
          borderRadius: "12px",
          padding: "16px",
        }}
      >
        <h3 style={{ fontSize: "14px", color: "#6b7280", marginBottom: "12px", margin: "0 0 12px 0" }}>
          ワークスペースを追加
        </h3>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <input
            style={{ ...inputStyle, flex: 1 }}
            placeholder="ワークスペース名"
            value={newWsName}
            onChange={(e) => setNewWsName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddWorkspace()}
          />
          <div style={{ display: "flex", gap: "4px" }}>
            {COLORS.slice(0, 4).map((c) => (
              <button
                key={c}
                onClick={() => setNewWsColor(c)}
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  backgroundColor: c,
                  border: newWsColor === c ? "2px solid #374151" : "2px solid transparent",
                  cursor: "pointer",
                  padding: 0,
                }}
              />
            ))}
          </div>
          <button
            onClick={handleAddWorkspace}
            disabled={!newWsName.trim()}
            style={{
              padding: "8px 16px",
              border: "none",
              borderRadius: "8px",
              backgroundColor: "#3b82f6",
              color: "white",
              fontSize: "14px",
              cursor: newWsName.trim() ? "pointer" : "not-allowed",
              opacity: newWsName.trim() ? 1 : 0.5,
            }}
          >
            追加
          </button>
        </div>
      </div>
    </div>
  );
}

interface WorkspaceCardProps {
  workspace: Workspace;
  isEditing: boolean;
  editingWs: Workspace | null;
  saving: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onUpdateField: (field: string, value: string) => void;
  onSave: () => void;
  onDelete: () => void;
}

function WorkspaceCard({
  workspace,
  isEditing,
  editingWs,
  saving,
  onStartEdit,
  onCancelEdit,
  onUpdateField,
  onSave,
  onDelete,
}: WorkspaceCardProps) {
  const ws = editingWs ?? workspace;
  const isConnected = ws.slack_webhook_url.startsWith("https://hooks.slack.com/");

  if (!isEditing) {
    return (
      <div
        style={{
          backgroundColor: "#f9fafb",
          borderRadius: "12px",
          padding: "16px",
          borderLeft: `4px solid ${workspace.color}`,
          cursor: "pointer",
        }}
        onClick={onStartEdit}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "15px", fontWeight: "bold", color: "#374151" }}>{workspace.name}</span>
            <span
              style={{
                display: "inline-block",
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                backgroundColor: isConnected ? "#22c55e" : "#9ca3af",
              }}
            />
            <span style={{ fontSize: "11px", color: isConnected ? "#22c55e" : "#9ca3af" }}>
              Slack {isConnected ? "接続済み" : "未設定"}
            </span>
          </div>
          <span style={{ fontSize: "12px", color: "#9ca3af" }}>編集</span>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        backgroundColor: "#f9fafb",
        borderRadius: "12px",
        padding: "16px",
        borderLeft: `4px solid ${ws.color}`,
        border: `1px solid ${ws.color}`,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div>
          <label style={labelStyle}>ワークスペース名</label>
          <input
            style={inputStyle}
            value={ws.name}
            onChange={(e) => onUpdateField("name", e.target.value)}
          />
        </div>

        <div>
          <label style={labelStyle}>カラー</label>
          <div style={{ display: "flex", gap: "6px" }}>
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => onUpdateField("color", c)}
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  backgroundColor: c,
                  border: ws.color === c ? "2px solid #374151" : "2px solid transparent",
                  cursor: "pointer",
                  padding: 0,
                }}
              />
            ))}
          </div>
        </div>

        <div>
          <label style={labelStyle}>Slack Webhook URL</label>
          <input
            style={inputStyle}
            type="url"
            placeholder="https://hooks.slack.com/services/..."
            value={ws.slack_webhook_url}
            onChange={(e) => onUpdateField("slack_webhook_url", e.target.value)}
          />
        </div>

        <div>
          <label style={labelStyle}>出勤メッセージ</label>
          <input
            style={inputStyle}
            value={ws.slack_clock_in_message}
            onChange={(e) => onUpdateField("slack_clock_in_message", e.target.value)}
          />
        </div>

        <div>
          <label style={labelStyle}>退勤メッセージ</label>
          <input
            style={inputStyle}
            value={ws.slack_clock_out_message}
            onChange={(e) => onUpdateField("slack_clock_out_message", e.target.value)}
          />
        </div>

        <div>
          <label style={labelStyle}>休憩開始メッセージ</label>
          <input
            style={inputStyle}
            value={ws.slack_break_start_message}
            onChange={(e) => onUpdateField("slack_break_start_message", e.target.value)}
          />
        </div>

        <div>
          <label style={labelStyle}>休憩終了メッセージ</label>
          <input
            style={inputStyle}
            value={ws.slack_break_end_message}
            onChange={(e) => onUpdateField("slack_break_end_message", e.target.value)}
          />
        </div>

        <div style={{ display: "flex", gap: "8px", justifyContent: "space-between" }}>
          <div>
            {workspace.id !== 1 && (
              <button
                onClick={onDelete}
                style={{
                  padding: "6px 12px",
                  border: "1px solid #fca5a5",
                  borderRadius: "6px",
                  backgroundColor: "white",
                  color: "#ef4444",
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                削除
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={onCancelEdit}
              style={{
                padding: "6px 16px",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                backgroundColor: "white",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              キャンセル
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              style={{
                padding: "6px 16px",
                border: "none",
                borderRadius: "6px",
                backgroundColor: "#3b82f6",
                color: "white",
                fontSize: "13px",
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "13px",
  color: "#6b7280",
  marginBottom: "4px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  fontSize: "14px",
  outline: "none",
  boxSizing: "border-box",
};
