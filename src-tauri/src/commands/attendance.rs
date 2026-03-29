use crate::db::models::{EventType, StampEvent, WorkStatus};
use crate::slack;
use crate::state::AppState;
use chrono::Local;
use rusqlite::OptionalExtension;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct CurrentStatus {
    pub status: WorkStatus,
    pub clock_in_time: Option<String>,
    pub date_key: Option<String>,
    pub workspace_id: Option<i64>,
    pub workspace_name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct StampResult {
    pub success: bool,
    pub timestamp: String,
}

/// DB接続から直接ステータスを取得する（トレイメニュー構築用）
pub fn get_current_status_from_db(db: &rusqlite::Connection) -> Result<CurrentStatus, String> {
    let active = get_active_session(db)?;
    let today = Local::now().format("%Y-%m-%d").to_string();

    match active {
        Some((date_key, workspace_id)) => {
            let events = query_latest_session_events(db, &date_key, workspace_id)
                .map_err(|e| e.to_string())?;
            let (status, clock_in_time) = derive_status(&events);

            let ws_name: Option<String> = db
                .query_row(
                    "SELECT name FROM workspaces WHERE id = ?1",
                    rusqlite::params![workspace_id],
                    |row| row.get(0),
                )
                .ok();

            Ok(CurrentStatus {
                status,
                clock_in_time,
                date_key: Some(date_key),
                workspace_id: Some(workspace_id),
                workspace_name: ws_name,
            })
        }
        None => Ok(CurrentStatus {
            status: WorkStatus::Idle,
            clock_in_time: None,
            date_key: Some(today),
            workspace_id: None,
            workspace_name: None,
        }),
    }
}

/// DB接続から直接打刻する（トレイメニュー用）
pub fn stamp_from_db(
    db: &rusqlite::Connection,
    event_type_str: &str,
    workspace_id: Option<i64>,
) -> Result<StampResult, String> {
    let event_type_enum =
        EventType::from_str(event_type_str).ok_or_else(|| format!("不正なイベント種別: {}", event_type_str))?;

    let now = Local::now();
    let timestamp = now.to_rfc3339();

    let active = get_active_session(db)?;

    let (ws_id, date_key) = if event_type_enum == EventType::ClockIn {
        if active.is_some() {
            return Err("既にアクティブなセッションがあります".to_string());
        }
        let ws_id = workspace_id.unwrap_or(1);
        let exists: bool = db
            .query_row(
                "SELECT COUNT(*) > 0 FROM workspaces WHERE id = ?1",
                rusqlite::params![ws_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if !exists {
            return Err("ワークスペースが見つかりません".to_string());
        }
        (ws_id, now.format("%Y-%m-%d").to_string())
    } else {
        let (active_key, active_ws_id) =
            active.ok_or_else(|| "出勤していません".to_string())?;
        (active_ws_id, active_key)
    };

    let events = query_latest_session_events(db, &date_key, ws_id).map_err(|e| e.to_string())?;
    let (current_status, _) = derive_status(&events);
    validate_transition(&current_status, &event_type_enum)?;

    db.execute(
        "INSERT INTO stamp_events (event_type, timestamp, date_key, workspace_id) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![event_type_enum.as_str(), timestamp, date_key, ws_id],
    )
    .map_err(|e| e.to_string())?;

    // Slack通知
    let slack_url: String = db
        .query_row(
            "SELECT slack_webhook_url FROM workspaces WHERE id = ?1",
            rusqlite::params![ws_id],
            |row| row.get(0),
        )
        .unwrap_or_default();

    if !slack_url.is_empty() {
        let message = build_slack_message(&event_type_enum, db, &date_key, ws_id);
        tokio::spawn(async move {
            slack::send_slack_message(&slack_url, &message).await;
        });
    }

    Ok(StampResult {
        success: true,
        timestamp,
    })
}

/// 現在の勤務状態を取得する（全ワークスペースを横断してアクティブセッションを探す）
#[tauri::command]
pub fn get_current_status(state: State<AppState>) -> Result<CurrentStatus, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let active = get_active_session(&db)?;
    let today = Local::now().format("%Y-%m-%d").to_string();

    match active {
        Some((date_key, workspace_id)) => {
            let events = query_latest_session_events(&db, &date_key, workspace_id)
                .map_err(|e| e.to_string())?;
            let (status, clock_in_time) = derive_status(&events);

            let ws_name: Option<String> = db
                .query_row(
                    "SELECT name FROM workspaces WHERE id = ?1",
                    rusqlite::params![workspace_id],
                    |row| row.get(0),
                )
                .ok();

            Ok(CurrentStatus {
                status,
                clock_in_time,
                date_key: Some(date_key),
                workspace_id: Some(workspace_id),
                workspace_name: ws_name,
            })
        }
        None => Ok(CurrentStatus {
            status: WorkStatus::Idle,
            clock_in_time: None,
            date_key: Some(today),
            workspace_id: None,
            workspace_name: None,
        }),
    }
}

/// 打刻を記録する
#[tauri::command]
pub fn stamp(
    event_type: String,
    workspace_id: Option<i64>,
    state: State<AppState>,
) -> Result<StampResult, String> {
    let event_type_enum =
        EventType::from_str(&event_type).ok_or_else(|| format!("不正なイベント種別: {}", event_type))?;

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let now = Local::now();
    let timestamp = now.to_rfc3339();

    // アクティブセッションを1回だけ取得
    let active = get_active_session(&db)?;

    let (ws_id, date_key) = if event_type_enum == EventType::ClockIn {
        if active.is_some() {
            return Err("既にアクティブなセッションがあります".to_string());
        }
        let ws_id = workspace_id.unwrap_or(1);
        // ワークスペースの存在確認
        let exists: bool = db
            .query_row(
                "SELECT COUNT(*) > 0 FROM workspaces WHERE id = ?1",
                rusqlite::params![ws_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if !exists {
            return Err("ワークスペースが見つかりません".to_string());
        }
        (ws_id, now.format("%Y-%m-%d").to_string())
    } else {
        let (active_key, active_ws_id) =
            active.ok_or_else(|| "出勤していません".to_string())?;
        (active_ws_id, active_key)
    };

    // 状態遷移の妥当性チェック
    let events = query_latest_session_events(&db, &date_key, ws_id).map_err(|e| e.to_string())?;
    let (current_status, _) = derive_status(&events);
    validate_transition(&current_status, &event_type_enum)?;

    db.execute(
        "INSERT INTO stamp_events (event_type, timestamp, date_key, workspace_id) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![event_type_enum.as_str(), timestamp, date_key, ws_id],
    )
    .map_err(|e| e.to_string())?;

    // Slack通知（ワークスペースのwebhook URLを使用）
    let slack_url: String = db
        .query_row(
            "SELECT slack_webhook_url FROM workspaces WHERE id = ?1",
            rusqlite::params![ws_id],
            |row| row.get(0),
        )
        .unwrap_or_default();

    if !slack_url.is_empty() {
        let message = build_slack_message(&event_type_enum, &db, &date_key, ws_id);
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

    match get_active_session(&db)? {
        Some((date_key, ws_id)) => {
            query_latest_session_events(&db, &date_key, ws_id).map_err(|e| e.to_string())
        }
        None => {
            // アクティブセッションがない場合は今日のイベントを返す
            query_events_by_date(&db, &today, None).map_err(|e| e.to_string())
        }
    }
}

fn query_events_by_date(
    db: &rusqlite::Connection,
    date_key: &str,
    workspace_id: Option<i64>,
) -> Result<Vec<StampEvent>, rusqlite::Error> {
    if let Some(ws_id) = workspace_id {
        let mut stmt = db.prepare(
            "SELECT id, event_type, timestamp, date_key, workspace_id FROM stamp_events \
             WHERE date_key = ?1 AND workspace_id = ?2 ORDER BY timestamp ASC",
        )?;
        let events = stmt
            .query_map(rusqlite::params![date_key, ws_id], map_stamp_event)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(events)
    } else {
        let mut stmt = db.prepare(
            "SELECT id, event_type, timestamp, date_key, workspace_id FROM stamp_events \
             WHERE date_key = ?1 ORDER BY timestamp ASC",
        )?;
        let events = stmt
            .query_map(rusqlite::params![date_key], map_stamp_event)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(events)
    }
}

fn map_stamp_event(row: &rusqlite::Row) -> rusqlite::Result<StampEvent> {
    Ok(StampEvent {
        id: row.get(0)?,
        event_type: row.get(1)?,
        timestamp: row.get(2)?,
        date_key: row.get(3)?,
        workspace_id: row.get(4)?,
    })
}

/// 最新セッション（最後のclock_in以降）のイベントのみを返す
fn query_latest_session_events(
    db: &rusqlite::Connection,
    date_key: &str,
    workspace_id: i64,
) -> Result<Vec<StampEvent>, rusqlite::Error> {
    let events = query_events_by_date(db, date_key, Some(workspace_id))?;

    let last_clock_in_pos = events.iter().rposition(|e| e.event_type == "clock_in");

    match last_clock_in_pos {
        Some(pos) => Ok(events[pos..].to_vec()),
        None => Ok(events),
    }
}

/// アクティブな勤務セッション（退勤していない最新のclock_in）を探す
/// 返り値: (date_key, workspace_id)
fn get_active_session(db: &rusqlite::Connection) -> Result<Option<(String, i64)>, String> {
    let result: Result<Option<(i64, String, i64)>, _> = db
        .query_row(
            "SELECT id, date_key, workspace_id FROM stamp_events \
             WHERE event_type = 'clock_in' ORDER BY timestamp DESC LIMIT 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional();

    let row = result.map_err(|e| e.to_string())?;

    if let Some((clock_in_id, date_key, workspace_id)) = row {
        let has_clock_out: bool = db
            .query_row(
                "SELECT COUNT(*) > 0 FROM stamp_events \
                 WHERE id > ?1 AND date_key = ?2 AND workspace_id = ?3 AND event_type = 'clock_out'",
                rusqlite::params![clock_in_id, date_key, workspace_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        if has_clock_out {
            return Ok(None);
        }
        return Ok(Some((date_key, workspace_id)));
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

/// Slack通知メッセージを組み立てる（ワークスペースの設定を使用）
fn build_slack_message(
    event_type: &EventType,
    db: &rusqlite::Connection,
    date_key: &str,
    workspace_id: i64,
) -> String {
    // ワークスペース名を取得
    let ws_name: String = db
        .query_row(
            "SELECT name FROM workspaces WHERE id = ?1",
            rusqlite::params![workspace_id],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "不明".to_string());

    match event_type {
        EventType::ClockIn => {
            let msg: String = db
                .query_row(
                    "SELECT slack_clock_in_message FROM workspaces WHERE id = ?1",
                    rusqlite::params![workspace_id],
                    |row| row.get(0),
                )
                .unwrap_or_else(|_| "出勤しました".to_string());
            format!("[{}] {}", ws_name, msg)
        }
        EventType::ClockOut => {
            let msg: String = db
                .query_row(
                    "SELECT slack_clock_out_message FROM workspaces WHERE id = ?1",
                    rusqlite::params![workspace_id],
                    |row| row.get(0),
                )
                .unwrap_or_else(|_| "退勤しました".to_string());

            if let Ok(events) = query_events_by_date(db, date_key, Some(workspace_id)) {
                if let Some(work_info) = calc_work_duration(&events) {
                    return format!("[{}] {} (本日の勤務時間: {})", ws_name, msg, work_info);
                }
            }
            format!("[{}] {}", ws_name, msg)
        }
        EventType::BreakStart => format!("[{}] 休憩に入ります", ws_name),
        EventType::BreakEnd => format!("[{}] 休憩から戻りました", ws_name),
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
