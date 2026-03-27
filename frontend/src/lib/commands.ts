import { invoke } from "@tauri-apps/api/core";
import type { CurrentStatus, EventType, StampEvent, StampResult } from "../types";

export async function getCurrentStatus(): Promise<CurrentStatus> {
  return invoke("get_current_status");
}

export async function stamp(eventType: EventType): Promise<StampResult> {
  return invoke("stamp", { eventType });
}

export async function getTodayEvents(): Promise<StampEvent[]> {
  return invoke("get_today_events");
}
