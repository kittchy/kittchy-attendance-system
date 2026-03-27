import { useCallback, useEffect, useState } from "react";
import { DailyChart } from "../components/DailyChart";
import { MonthlySummary } from "../components/MonthlySummary";
import { getDailyRecords } from "../lib/commands";
import type { DailyRecord } from "../types";

interface Props {
  onBack: () => void;
}

export function HistoryPage({ onBack }: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getDailyRecords(year, month);
      setRecords(r);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const prevMonth = () => {
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else {
      setMonth(month - 1);
    }
  };

  const nextMonth = () => {
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else {
      setMonth(month + 1);
    }
  };

  return (
    <div style={{ padding: "24px", maxWidth: "520px", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: "20px" }}>
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
      </div>

      {/* 月選択 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <button onClick={prevMonth} style={navBtnStyle}>
          ◀
        </button>
        <span style={{ fontSize: "18px", fontWeight: "bold", minWidth: "140px", textAlign: "center" }}>
          {year}年{month}月
        </span>
        <button onClick={nextMonth} style={navBtnStyle}>
          ▶
        </button>
      </div>

      {/* グラフ */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "32px", color: "#9ca3af" }}>読み込み中...</div>
      ) : (
        <DailyChart records={records} />
      )}

      {/* サマリー */}
      {!loading && <MonthlySummary year={year} month={month} />}
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  background: "none",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  padding: "6px 12px",
  cursor: "pointer",
  fontSize: "14px",
};
