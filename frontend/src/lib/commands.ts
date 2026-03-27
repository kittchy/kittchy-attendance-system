import { invoke } from "@tauri-apps/api/core";
import type { CurrentStatus, DailyRecord, EventType, StampEvent, StampResult } from "../types";

export async function getCurrentStatus(): Promise<CurrentStatus> {
  return invoke("get_current_status");
}

export async function stamp(eventType: EventType): Promise<StampResult> {
  return invoke("stamp", { eventType });
}

export async function getTodayEvents(): Promise<StampEvent[]> {
  return invoke("get_today_events");
}

export async function getDailyRecords(year: number, month: number): Promise<DailyRecord[]> {
  return invoke("get_daily_records", { year, month });
}

export async function getSettings(): Promise<Record<string, string>> {
  return invoke("get_settings");
}

export async function updateSetting(key: string, value: string): Promise<void> {
  return invoke("update_setting", { key, value });
}

export async function getMonthlySummary(year: number, month: number): Promise<string> {
  return invoke("get_monthly_summary", { year, month });
}
