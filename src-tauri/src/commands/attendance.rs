use crate::db::models::{EventType, StampEvent, WorkStatus};
use crate::state::AppState;
use chrono::Local;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct CurrentStatus {
    pub status: WorkStatus,
    pub clock_in_time: Option<String>,
    pub date_key: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct StampResult {
    pub success: bool,
    pub timestamp: String,
}

/// 今日の勤務状態を導出する（日跨ぎのアクティブセッションも考慮）
#[tauri::command]
pub fn get_current_status(state: State<AppState>) -> Result<CurrentStatus, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // アクティブなセッションのdate_keyを優先して使用
    let active_date_key = get_active_date_key(&db)?;
    let today = Local::now().format("%Y-%m-%d").to_string();
    let date_key = active_date_key.unwrap_or_else(|| today.clone());

    let events = query_events_by_date(&db, &date_key).map_err(|e| e.to_string())?;
    let (status, clock_in_time) = derive_status(&events);

    Ok(CurrentStatus {
        status,
        clock_in_time,
        date_key: if events.is_empty() { None } else { Some(date_key) },
    })
}

/// 打刻を記録する
#[tauri::command]
pub fn stamp(event_type: String, state: State<AppState>) -> Result<StampResult, String> {
    let event_type_enum =
        EventType::from_str(&event_type).ok_or_else(|| format!("不正なイベント種別: {}", event_type))?;

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let now = Local::now();
    let timestamp = now.to_rfc3339();

    // clock_in時: 既存のアクティブセッションがないか確認
    if event_type_enum == EventType::ClockIn {
        if let Some(active_key) = get_active_date_key(&db)? {
            return Err(format!(
                "既にアクティブなセッションがあります ({})",
                active_key
            ));
        }
    }

    // date_key: clock_inの場合は今日の日付、それ以外は最新のclock_inのdate_keyを使用
    let date_key = if event_type_enum == EventType::ClockIn {
        now.format("%Y-%m-%d").to_string()
    } else {
        get_active_date_key(&db)?.ok_or_else(|| "出勤していません".to_string())?
    };

    // 状態遷移の妥当性チェック
    let events = query_events_by_date(&db, &date_key).map_err(|e| e.to_string())?;
    let (current_status, _) = derive_status(&events);
    validate_transition(&current_status, &event_type_enum)?;

    db.execute(
        "INSERT INTO stamp_events (event_type, timestamp, date_key) VALUES (?1, ?2, ?3)",
        rusqlite::params![event_type_enum.as_str(), timestamp, date_key],
    )
    .map_err(|e| e.to_string())?;

    Ok(StampResult {
        success: true,
        timestamp,
    })
}

/// 本日のイベント一覧を取得
#[tauri::command]
pub fn get_today_events(state: State<AppState>) -> Result<Vec<StampEvent>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let today = Local::now().format("%Y-%m-%d").to_string();

    // 今日のdate_keyまたはアクティブなdate_keyのイベントを取得
    let date_key = get_active_date_key(&db)?.unwrap_or(today);
    query_events_by_date(&db, &date_key).map_err(|e| e.to_string())
}

fn query_events_by_date(
    db: &rusqlite::Connection,
    date_key: &str,
) -> Result<Vec<StampEvent>, rusqlite::Error> {
    let mut stmt = db.prepare(
        "SELECT id, event_type, timestamp, date_key FROM stamp_events WHERE date_key = ?1 ORDER BY timestamp ASC",
    )?;

    let events = stmt
        .query_map(rusqlite::params![date_key], |row| {
            Ok(StampEvent {
                id: row.get(0)?,
                event_type: row.get(1)?,
                timestamp: row.get(2)?,
                date_key: row.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(events)
}

/// アクティブな勤務セッションのdate_keyを取得（退勤していない最新のclock_in）
fn get_active_date_key(db: &rusqlite::Connection) -> Result<Option<String>, String> {
    // 最新のclock_inイベントを探す
    let result: Result<Option<String>, _> = db.query_row(
        "SELECT date_key FROM stamp_events WHERE event_type = 'clock_in' ORDER BY timestamp DESC LIMIT 1",
        [],
        |row| row.get(0),
    ).optional();

    let date_key = result.map_err(|e| e.to_string())?;

    if let Some(ref dk) = date_key {
        // そのdate_keyにclock_outがあるか確認
        let has_clock_out: bool = db
            .query_row(
                "SELECT COUNT(*) > 0 FROM stamp_events WHERE date_key = ?1 AND event_type = 'clock_out'",
                rusqlite::params![dk],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        if has_clock_out {
            return Ok(None); // 退勤済み
        }
    }

    Ok(date_key)
}

/// イベント列から勤務状態を導出する
fn derive_status(events: &[StampEvent]) -> (WorkStatus, Option<String>) {
    if events.is_empty() {
        return (WorkStatus::Idle, None);
    }

    let last_event = events.last().unwrap();
    let clock_in_time = events
        .iter()
        .find(|e| e.event_type == "clock_in")
        .map(|e| e.timestamp.clone());

    let status = match last_event.event_type.as_str() {
        "clock_in" | "break_end" => WorkStatus::Working,
        "break_start" => WorkStatus::OnBreak,
        "clock_out" => WorkStatus::Idle,
        _ => WorkStatus::Idle,
    };

    (status, clock_in_time)
}

/// 状態遷移の妥当性チェック
fn validate_transition(current: &WorkStatus, event: &EventType) -> Result<(), String> {
    let valid = match (current, event) {
        (WorkStatus::Idle, EventType::ClockIn) => true,
        (WorkStatus::Working, EventType::BreakStart) => true,
        (WorkStatus::Working, EventType::ClockOut) => true,
        (WorkStatus::OnBreak, EventType::BreakEnd) => true,
        _ => false,
    };

    if valid {
        Ok(())
    } else {
        Err(format!(
            "現在の状態 {:?} から {:?} への遷移はできません",
            current, event
        ))
    }
}

use rusqlite::OptionalExtension;
