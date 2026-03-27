import { useEffect, useRef, useState } from "react";
import { useSettings } from "../hooks/useSettings";

interface Props {
  onBack: () => void;
}

export function SettingsPage({ onBack }: Props) {
  const { settings, loading, saveSetting } = useSettings();
  const [webhookUrl, setWebhookUrl] = useState("");
  const [clockInMsg, setClockInMsg] = useState("出勤しました");
  const [clockOutMsg, setClockOutMsg] = useState("退勤しました");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!loading) {
      setWebhookUrl(settings.slack_webhook_url || "");
      setClockInMsg(settings.slack_clock_in_message || "出勤しました");
      setClockOutMsg(settings.slack_clock_out_message || "退勤しました");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        saveSetting("slack_webhook_url", webhookUrl),
        saveSetting("slack_clock_in_message", clockInMsg),
        saveSetting("slack_clock_out_message", clockOutMsg),
      ]);
      setSaved(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const isConnected = webhookUrl.startsWith("https://hooks.slack.com/");

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
      </div>

      {/* Slack設定セクション */}
      <div
        style={{
          backgroundColor: "#f9fafb",
          borderRadius: "12px",
          padding: "20px",
          marginBottom: "24px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
          <h2 style={{ fontSize: "16px", color: "#374151", margin: 0 }}>Slack連携</h2>
          <span
            style={{
              display: "inline-block",
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: isConnected ? "#22c55e" : "#9ca3af",
            }}
          />
          <span style={{ fontSize: "12px", color: isConnected ? "#22c55e" : "#9ca3af" }}>
            {isConnected ? "接続済み" : "未設定"}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={labelStyle}>Webhook URL</label>
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
            <input style={inputStyle} value={clockInMsg} onChange={(e) => setClockInMsg(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>退勤メッセージ</label>
            <input style={inputStyle} value={clockOutMsg} onChange={(e) => setClockOutMsg(e.target.value)} />
          </div>
        </div>
      </div>

      {/* 保存ボタン */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "10px 28px",
            border: "none",
            borderRadius: "8px",
            backgroundColor: saved ? "#22c55e" : "#3b82f6",
            color: "white",
            cursor: saving ? "not-allowed" : "pointer",
            fontSize: "14px",
            fontWeight: "bold",
            opacity: saving ? 0.6 : 1,
            transition: "background-color 0.2s",
          }}
        >
          {saving ? "保存中..." : saved ? "保存しました" : "保存"}
        </button>
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
