export type EventType = "clock_in" | "clock_out" | "break_start" | "break_end";

export type WorkStatus = "idle" | "working" | "on_break";

export interface StampEvent {
  id: number;
  event_type: EventType;
  timestamp: string;
  date_key: string;
  workspace_id: number;
}

export interface CurrentStatus {
  status: WorkStatus;
  clock_in_time: string | null;
  date_key: string | null;
  workspace_id: number | null;
  workspace_name: string | null;
}

export interface StampResult {
  success: boolean;
  timestamp: string;
}

export interface DailyRecord {
  date_key: string;
  work_minutes: number;
  break_minutes: number;
}

export interface Settings {
  slack_webhook_url?: string;
  slack_clock_in_message?: string;
  slack_clock_out_message?: string;
}

export interface Workspace {
  id: number;
  name: string;
  color: string;
  slack_webhook_url: string;
  slack_clock_in_message: string;
  slack_clock_out_message: string;
  sort_order: number;
}
