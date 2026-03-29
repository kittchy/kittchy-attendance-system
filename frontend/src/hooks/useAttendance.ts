import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  getCurrentStatus,
  getTodayEvents,
  stamp,
  updateEvent,
  deleteEvent,
} from "../lib/commands";
import type { CurrentStatus, EventType, StampEvent } from "../types";

export function useAttendance() {
  const [status, setStatus] = useState<CurrentStatus>({
    status: "idle",
    clock_in_time: null,
    date_key: null,
    workspace_id: null,
    workspace_name: null,
  });
  const [events, setEvents] = useState<StampEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, e] = await Promise.all([getCurrentStatus(), getTodayEvents()]);
      setStatus(s);
      setEvents(e);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // トレイから打刻された場合にUIを更新
  useEffect(() => {
    const unlisten = listen("attendance-changed", () => {
      refresh();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refresh]);

  const doStamp = useCallback(
    async (eventType: EventType, workspaceId?: number) => {
      try {
        setError(null);
        await stamp(eventType, workspaceId);
        await refresh();
      } catch (err) {
        setError(String(err));
      }
    },
    [refresh],
  );

  const doUpdateEvent = useCallback(
    async (id: number, newTimestamp: string) => {
      await updateEvent(id, newTimestamp);
      await refresh();
    },
    [refresh],
  );

  const doDeleteEvent = useCallback(
    async (id: number) => {
      await deleteEvent(id);
      await refresh();
    },
    [refresh],
  );

  return { status, events, loading, error, doStamp, doUpdateEvent, doDeleteEvent, refresh };
}
