use crate::db::models::{EventType, StampEvent, WorkStatus};
use crate::slack;
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

    let events = query_latest_session_events(&db, &date_key).map_err(|e| e.to_string())?;
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

    // 状態遷移の妥当性チェック（最新セッションのイベントのみ）
    let events = query_latest_session_events(&db, &date_key).map_err(|e| e.to_string())?;
    let (current_status, _) = derive_status(&events);
    validate_transition(&current_status, &event_type_enum)?;

    db.execute(
        "INSERT INTO stamp_events (event_type, timestamp, date_key) VALUES (?1, ?2, ?3)",
        rusqlite::params![event_type_enum.as_str(), timestamp, date_key],
    )
    .map_err(|e| e.to_string())?;

    // Slack通知（バックグラウンド、失敗してもブロックしない）
    let slack_url: String = db
        .query_row(
            "SELECT value FROM settings WHERE key = 'slack_webhook_url'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_default();

    if !slack_url.is_empty() {
        let message = build_slack_message(&event_type_enum, &db, &date_key);
        tokio::spawn(async move {
            slack::send_slack_message(&slack_url, &message).await;
        });
    }

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
    query_latest_session_events(&db, &date_key).map_err(|e| e.to_string())
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

/// 最新セッション（最後のclock_in以降）のイベントのみを返す
fn query_latest_session_events(
    db: &rusqlite::Connection,
    date_key: &str,
) -> Result<Vec<StampEvent>, rusqlite::Error> {
    let events = query_events_by_date(db, date_key)?;

    // 最後のclock_inの位置を探す
    let last_clock_in_pos = events
        .iter()
        .rposition(|e| e.event_type == "clock_in");

    match last_clock_in_pos {
        Some(pos) => Ok(events[pos..].to_vec()),
        None => Ok(events),
    }
}

/// アクティブな勤務セッションのdate_keyを取得（退勤していない最新のclock_in）
fn get_active_date_key(db: &rusqlite::Connection) -> Result<Option<String>, String> {
    // 最新のclock_inイベントのidとdate_keyを探す
    let result: Result<Option<(i64, String)>, _> = db
        .query_row(
            "SELECT id, date_key FROM stamp_events WHERE event_type = 'clock_in' ORDER BY timestamp DESC LIMIT 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional();

    let row = result.map_err(|e| e.to_string())?;

    if let Some((clock_in_id, date_key)) = row {
        // その clock_in より後に clock_out があるか確認
        let has_clock_out: bool = db
            .query_row(
                "SELECT COUNT(*) > 0 FROM stamp_events WHERE id > ?1 AND date_key = ?2 AND event_type = 'clock_out'",
                rusqlite::params![clock_in_id, date_key],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        if has_clock_out {
            return Ok(None); // 退勤済み
        }
        return Ok(Some(date_key));
    }

    Ok(None)
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

    // 退勤済みの場合は出勤時刻を表示しない
    let clock_in_time = if status == WorkStatus::Idle {
        None
    } else {
        clock_in_time
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

/// Slack通知メッセージを組み立てる
fn build_slack_message(
    event_type: &EventType,
    db: &rusqlite::Connection,
    date_key: &str,
) -> String {
    match event_type {
        EventType::ClockIn => {
            let msg: String = db
                .query_row(
                    "SELECT value FROM settings WHERE key = 'slack_clock_in_message'",
                    [],
                    |row| row.get(0),
                )
                .unwrap_or_else(|_| "出勤しました".to_string());
            msg
        }
        EventType::ClockOut => {
            let msg: String = db
                .query_row(
                    "SELECT value FROM settings WHERE key = 'slack_clock_out_message'",
                    [],
                    |row| row.get(0),
                )
                .unwrap_or_else(|_| "退勤しました".to_string());

            // 本日の勤務時間を計算
            if let Ok(events) = query_events_by_date(db, date_key) {
                if let Some(work_info) = calc_work_duration(&events) {
                    return format!("{} (本日の勤務時間: {})", msg, work_info);
                }
            }
            msg
        }
        EventType::BreakStart => "休憩に入ります".to_string(),
        EventType::BreakEnd => "休憩から戻りました".to_string(),
    }
}

/// イベント列から勤務時間文字列を計算する
fn calc_work_duration(events: &[StampEvent]) -> Option<String> {
    let clock_in = events.iter().find(|e| e.event_type == "clock_in")?;
    let clock_out = events.iter().rev().find(|e| e.event_type == "clock_out")?;

    let start = chrono::DateTime::parse_from_rfc3339(&clock_in.timestamp).ok()?;
    let end = chrono::DateTime::parse_from_rfc3339(&clock_out.timestamp).ok()?;

    let mut break_secs: i64 = 0;
    let mut break_start: Option<chrono::DateTime<chrono::FixedOffset>> = None;
    for event in events {
        match event.event_type.as_str() {
            "break_start" => {
                break_start = chrono::DateTime::parse_from_rfc3339(&event.timestamp).ok();
            }
            "break_end" => {
                if let (Some(bs), Ok(be)) =
                    (break_start.take(), chrono::DateTime::parse_from_rfc3339(&event.timestamp))
                {
                    break_secs += (be - bs).num_seconds();
                }
            }
            _ => {}
        }
    }

    let total_secs = ((end - start).num_seconds() - break_secs).max(0);
    let hours = total_secs / 3600;
    let minutes = (total_secs % 3600) / 60;

    Some(format!("{}時間{}分", hours, minutes))
}

use rusqlite::OptionalExtension;
