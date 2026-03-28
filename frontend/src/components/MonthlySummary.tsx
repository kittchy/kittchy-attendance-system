import { useCallback, useEffect, useRef, useState } from "react";
import { getMonthlySummary } from "../lib/commands";

interface Props {
  year: number;
  month: number;
  workspaceId?: number;
}

export function MonthlySummary({ year, month, workspaceId }: Props) {
  const [summary, setSummary] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getMonthlySummary(year, month, workspaceId);
      setSummary(s);
    } finally {
      setLoading(false);
    }
  }, [year, month, workspaceId]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    try {
      await navigator.clipboard.writeText(summary);
    } catch {
      // フォールバック
      const textarea = document.createElement("textarea");
      textarea.value = summary;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return <div style={{ textAlign: "center", color: "#9ca3af", padding: "16px 0" }}>読み込み中...</div>;
  }

  return (
    <div style={{ marginTop: "24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
        <h3 style={{ fontSize: "15px", color: "#374151", margin: 0 }}>月次サマリー</h3>
        <button
          onClick={handleCopy}
          style={{
            padding: "6px 16px",
            border: "1px solid #d1d5db",
            borderRadius: "8px",
            backgroundColor: copied ? "#22c55e" : "white",
            color: copied ? "white" : "#374151",
            fontSize: "13px",
            cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          {copied ? "コピー済み" : "サマリーをコピー"}
        </button>
      </div>
      <pre
        style={{
          backgroundColor: "#f9fafb",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          padding: "16px",
          fontSize: "13px",
          lineHeight: "1.6",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          color: "#374151",
          maxHeight: "300px",
          overflow: "auto",
        }}
      >
        {summary}
      </pre>
    </div>
  );
}
