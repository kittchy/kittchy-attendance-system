import { useEffect, useState } from "react";
import { useSettings } from "../hooks/useSettings";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SettingsDialog({ open, onClose }: Props) {
  const { settings, loading, saveSetting } = useSettings();
  const [webhookUrl, setWebhookUrl] = useState("");
  const [clockInMsg, setClockInMsg] = useState("出勤しました");
  const [clockOutMsg, setClockOutMsg] = useState("退勤しました");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading) {
      setWebhookUrl(settings.slack_webhook_url || "");
      setClockInMsg(settings.slack_clock_in_message || "出勤しました");
      setClockOutMsg(settings.slack_clock_out_message || "退勤しました");
    }
  }, [loading, settings]);

  if (!open) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        saveSetting("slack_webhook_url", webhookUrl),
        saveSetting("slack_clock_in_message", clockInMsg),
        saveSetting("slack_clock_out_message", clockOutMsg),
      ]);
      onClose();
    } finally {
      setSaving(false);
    }
  };

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

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "16px",
          padding: "24px",
          width: "400px",
          maxWidth: "90vw",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: "18px", marginBottom: "20px" }}>設定</h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={labelStyle}>Slack Webhook URL</label>
            <input
              style={inputStyle}
              type="url"
              placeholder="https://hooks.slack.com/services/..."
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle}>出勤メッセージ</label>
            <input
              style={inputStyle}
              value={clockInMsg}
              onChange={(e) => setClockInMsg(e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle}>退勤メッセージ</label>
            <input
              style={inputStyle}
              value={clockOutMsg}
              onChange={(e) => setClockOutMsg(e.target.value)}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "24px" }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 20px",
              border: "1px solid #d1d5db",
              borderRadius: "8px",
              backgroundColor: "white",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "8px 20px",
              border: "none",
              borderRadius: "8px",
              backgroundColor: "#3b82f6",
              color: "white",
              cursor: saving ? "not-allowed" : "pointer",
              fontSize: "14px",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
