import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DailyChart } from "../components/DailyChart";
import { DayAccordion } from "../components/DayAccordion";
import { MonthlySummary } from "../components/MonthlySummary";
import { useWorkspaces } from "../hooks/useWorkspaces";
import {
  addMissingClockOutForDate,
  deleteEvent,
  getDailyRecords,
  getEventsByMonth,
  updateEvent,
} from "../lib/commands";
import type { DailyRecord, StampEvent } from "../types";

interface Props {
  onBack: () => void;
}

interface DayGroup {
  dateKey: string;
  workspaceId: number;
  events: StampEvent[];
}

/** events を (date_key, workspace_id) ごとにグループ化し、新しい日付が上に来るように並べる */
function groupByDayAndWorkspace(events: StampEvent[]): DayGroup[] {
  const map = new Map<string, DayGroup>();
  for (const ev of events) {
    const key = `${ev.date_key}:${ev.workspace_id}`;
    let group = map.get(key);
    if (!group) {
      group = { dateKey: ev.date_key, workspaceId: ev.workspace_id, events: [] };
      map.set(key, group);
    }
    group.events.push(ev);
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.dateKey !== b.dateKey) return a.dateKey < b.dateKey ? 1 : -1;
    return a.workspaceId - b.workspaceId;
  });
}

export function HistoryPage({ onBack }: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [events, setEvents] = useState<StampEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [summaryRefreshKey, setSummaryRefreshKey] = useState(0);
  const { workspaces } = useWorkspaces();
  const [filterWsId, setFilterWsId] = useState<number | undefined>(undefined);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [r, e] = await Promise.all([
        getDailyRecords(year, month, filterWsId),
        getEventsByMonth(year, month, filterWsId),
      ]);
      setRecords(r);
      setEvents(e);
    } finally {
      setLoading(false);
    }
  }, [year, month, filterWsId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // トレイ打刻や HomePage 側の操作にも追従する
  useEffect(() => {
    const unlisten = listen("attendance-changed", async () => {
      await fetchAll();
      setSummaryRefreshKey((k) => k + 1);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [fetchAll]);

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

  const handleUpdate = useCallback(
    async (id: number, newTimestamp: string) => {
      await updateEvent(id, newTimestamp);
      await fetchAll();
      setSummaryRefreshKey((k) => k + 1);
    },
    [fetchAll],
  );

  const handleDelete = useCallback(
    async (id: number) => {
      await deleteEvent(id);
      await fetchAll();
      setSummaryRefreshKey((k) => k + 1);
    },
    [fetchAll],
  );

  const handleAddClockOut = useCallback(
    async (
      dateKey: string,
      wsId: number,
      newTimestamp: string,
      breakEndTimestamp?: string,
    ) => {
      await addMissingClockOutForDate(dateKey, wsId, newTimestamp, breakEndTimestamp);
      await fetchAll();
      setSummaryRefreshKey((k) => k + 1);
    },
    [fetchAll],
  );

  const dayGroups = useMemo(() => groupByDayAndWorkspace(events), [events]);
  const showWorkspaceLabel = workspaces.length > 1 && filterWsId === undefined;
  const workspaceById = useMemo(() => {
    const m = new Map<number, (typeof workspaces)[number]>();
    for (const ws of workspaces) m.set(ws.id, ws);
    return m;
  }, [workspaces]);

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

      {/* ワークスペースフィルタ（2つ以上ある場合のみ表示） */}
      {workspaces.length > 1 && (
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
          <button
            onClick={() => setFilterWsId(undefined)}
            style={{
              padding: "4px 12px",
              borderRadius: "6px",
              border: filterWsId === undefined ? "2px solid #3b82f6" : "1px solid #d1d5db",
              backgroundColor: filterWsId === undefined ? "#eff6ff" : "white",
              color: filterWsId === undefined ? "#3b82f6" : "#6b7280",
              fontSize: "13px",
              fontWeight: filterWsId === undefined ? "bold" : "normal",
              cursor: "pointer",
            }}
          >
            すべて
          </button>
          {workspaces.map((ws) => {
            const isActive = filterWsId === ws.id;
            return (
              <button
                key={ws.id}
                onClick={() => setFilterWsId(ws.id)}
                style={{
                  padding: "4px 12px",
                  borderRadius: "6px",
                  border: isActive ? `2px solid ${ws.color}` : "1px solid #d1d5db",
                  backgroundColor: isActive ? `${ws.color}15` : "white",
                  color: isActive ? ws.color : "#6b7280",
                  fontSize: "13px",
                  fontWeight: isActive ? "bold" : "normal",
                  cursor: "pointer",
                }}
              >
                {ws.name}
              </button>
            );
          })}
        </div>
      )}

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

      {/* 日別記録（クリックで展開して編集） */}
      {!loading && dayGroups.length > 0 && (
        <div style={{ marginTop: "24px" }}>
          <h3 style={{ fontSize: "15px", color: "#374151", margin: "0 0 8px 0" }}>日別記録</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {dayGroups.map((g) => {
              const key = `${g.dateKey}:${g.workspaceId}`;
              return (
                <DayAccordion
                  key={key}
                  dateKey={g.dateKey}
                  workspaceId={g.workspaceId}
                  workspace={workspaceById.get(g.workspaceId)}
                  events={g.events}
                  expanded={expandedKey === key}
                  onToggle={() => setExpandedKey(expandedKey === key ? null : key)}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  onAddMissingClockOut={handleAddClockOut}
                  showWorkspaceLabel={showWorkspaceLabel}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* サマリー（編集後は key 変更で再マウントして再フェッチ） */}
      {!loading && (
        <MonthlySummary
          key={summaryRefreshKey}
          year={year}
          month={month}
          workspaceId={filterWsId}
        />
      )}
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
