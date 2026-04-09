import { invoke } from "@tauri-apps/api/core";
import type { CurrentStatus, DailyRecord, EventType, StampEvent, StampResult, Workspace } from "../types";

export async function getCurrentStatus(): Promise<CurrentStatus> {
  return invoke("get_current_status");
}

export async function stamp(eventType: EventType, workspaceId?: number): Promise<StampResult> {
  return invoke("stamp", { eventType, workspaceId: workspaceId ?? null });
}

export async function getTodayEvents(): Promise<StampEvent[]> {
  return invoke("get_today_events");
}

export async function getDailyRecords(
  year: number,
  month: number,
  workspaceId?: number,
): Promise<DailyRecord[]> {
  return invoke("get_daily_records", { year, month, workspaceId: workspaceId ?? null });
}

export async function getSettings(): Promise<Record<string, string>> {
  return invoke("get_settings");
}

export async function updateSetting(key: string, value: string): Promise<void> {
  return invoke("update_setting", { key, value });
}

export async function getMonthlySummary(
  year: number,
  month: number,
  workspaceId?: number,
): Promise<string> {
  return invoke("get_monthly_summary", { year, month, workspaceId: workspaceId ?? null });
}

// ワークスペース系
export async function listWorkspaces(): Promise<Workspace[]> {
  return invoke("list_workspaces");
}

export async function createWorkspace(name: string, color: string): Promise<Workspace> {
  return invoke("create_workspace", { name, color });
}

export async function updateWorkspace(workspace: Workspace): Promise<void> {
  return invoke("update_workspace", {
    id: workspace.id,
    name: workspace.name,
    color: workspace.color,
    slackWebhookUrl: workspace.slack_webhook_url,
    slackClockInMessage: workspace.slack_clock_in_message,
    slackClockOutMessage: workspace.slack_clock_out_message,
    slackBreakStartMessage: workspace.slack_break_start_message,
    slackBreakEndMessage: workspace.slack_break_end_message,
  });
}

export async function deleteWorkspace(id: number): Promise<void> {
  return invoke("delete_workspace", { id });
}

// イベント修正・削除
export async function updateEvent(id: number, newTimestamp: string): Promise<void> {
  return invoke("update_event", { id, newTimestamp });
}

export async function deleteEvent(id: number): Promise<void> {
  return invoke("delete_event", { id });
}
