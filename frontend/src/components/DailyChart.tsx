import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { DailyRecord } from "../types";

interface Props {
  records: DailyRecord[];
}

export function DailyChart({ records }: Props) {
  if (records.length === 0) {
    return (
      <div style={{ textAlign: "center", color: "#9ca3af", padding: "32px 0" }}>
        この月の勤務データはありません
      </div>
    );
  }

  const data = records.map((r) => ({
    date: r.date_key.slice(5), // "MM-DD"
    勤務: Math.round((r.work_minutes / 60) * 10) / 10,
    休憩: Math.round((r.break_minutes / 60) * 10) / 10,
  }));

  const totalMinutes = Math.round(records.reduce((sum, r) => sum + r.work_minutes, 0));
  const totalHoursInt = Math.floor(totalMinutes / 60);
  const totalMinsInt = totalMinutes % 60;

  return (
    <div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <XAxis dataKey="date" fontSize={11} tickLine={false} />
          <YAxis fontSize={11} tickLine={false} unit="h" />
          <Tooltip
            formatter={(value, name) => [`${value}h`, String(name)]}
            contentStyle={{ borderRadius: "8px", fontSize: "13px" }}
          />
          <Bar dataKey="勤務" fill="#22c55e" radius={[4, 4, 0, 0]} />
          <Bar dataKey="休憩" fill="#f59e0b" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <div style={{ textAlign: "center", marginTop: "8px", fontSize: "15px", color: "#374151" }}>
        合計: {totalHoursInt}時間{totalMinsInt}分
      </div>
    </div>
  );
}
