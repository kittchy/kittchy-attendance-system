use crate::db::models::StampEvent;
use crate::state::AppState;
use chrono::{DateTime, Datelike, FixedOffset, NaiveDate};
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct DailyRecord {
    pub date_key: String,
    pub work_minutes: f64,
    pub break_minutes: f64,
}

/// 月の日別勤務時間を取得（グラフ用）
#[tauri::command]
pub fn get_daily_records(
    year: i32,
    month: u32,
    workspace_id: Option<i64>,
    state: State<AppState>,
) -> Result<Vec<DailyRecord>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let events = query_month_events(&db, year, month, workspace_id)?;

    let mut records: Vec<DailyRecord> = Vec::new();
    let mut current_key = String::new();
    let mut group: Vec<&StampEvent> = Vec::new();

    for event in &events {
        if event.date_key != current_key {
            if !group.is_empty() {
                if let Some(record) = calc_daily_record(&current_key, &group) {
                    records.push(record);
                }
            }
            current_key = event.date_key.clone();
            group.clear();
        }
        group.push(event);
    }
    if !group.is_empty() {
        if let Some(record) = calc_daily_record(&current_key, &group) {
            records.push(record);
        }
    }

    Ok(records)
}

/// 月次サマリーテキストを生成する
#[tauri::command]
pub fn get_monthly_summary(
    year: i32,
    month: u32,
    workspace_id: Option<i64>,
    state: State<AppState>,
) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let events = query_month_events(&db, year, month, workspace_id)?;

    let mut lines: Vec<String> = Vec::new();
    let mut total_work_secs: i64 = 0;
    let mut current_key = String::new();
    let mut group: Vec<&StampEvent> = Vec::new();

    for event in &events {
        if event.date_key != current_key {
            if !group.is_empty() {
                if let Some((line, secs)) = format_daily_summary(&current_key, &group) {
                    lines.push(line);
                    total_work_secs += secs;
                }
            }
            current_key = event.date_key.clone();
            group.clear();
        }
        group.push(event);
    }
    if !group.is_empty() {
        if let Some((line, secs)) = format_daily_summary(&current_key, &group) {
            lines.push(line);
            total_work_secs += secs;
        }
    }

    if lines.is_empty() {
        return Ok(format!("{}年{}月の勤務データはありません", year, month));
    }

    let total_hours = total_work_secs / 3600;
    let total_minutes = (total_work_secs % 3600) / 60;

    lines.push(String::new());
    lines.push(format!("{}時間{}分", total_hours, total_minutes));

    Ok(lines.join("\n"))
}

/// 月のイベントをクエリ（workspace_id でフィルタ可能）
fn query_month_events(
    db: &rusqlite::Connection,
    year: i32,
    month: u32,
    workspace_id: Option<i64>,
) -> Result<Vec<StampEvent>, String> {
    let date_prefix = format!("{:04}-{:02}", year, month);

    let map_row = |row: &rusqlite::Row| -> rusqlite::Result<StampEvent> {
        Ok(StampEvent {
            id: row.get(0)?,
            event_type: row.get(1)?,
            timestamp: row.get(2)?,
            date_key: row.get(3)?,
            workspace_id: row.get(4)?,
        })
    };

    if let Some(ws_id) = workspace_id {
        let mut stmt = db
            .prepare(
                "SELECT id, event_type, timestamp, date_key, workspace_id FROM stamp_events \
                 WHERE date_key LIKE ?1 AND workspace_id = ?2 ORDER BY date_key, timestamp ASC",
            )
            .map_err(|e| e.to_string())?;

        let events = stmt
            .query_map(rusqlite::params![format!("{}%", date_prefix), ws_id], map_row)
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        Ok(events)
    } else {
        let mut stmt = db
            .prepare(
                "SELECT id, event_type, timestamp, date_key, workspace_id FROM stamp_events \
                 WHERE date_key LIKE ?1 ORDER BY date_key, timestamp ASC",
            )
            .map_err(|e| e.to_string())?;

        let events = stmt
            .query_map(rusqlite::params![format!("{}%", date_prefix)], map_row)
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        Ok(events)
    }
}

/// 1日のイベント列から勤務時間・休憩時間を計算する
fn calc_daily_record(date_key: &str, events: &[&StampEvent]) -> Option<DailyRecord> {
    let clock_in = events.iter().find(|e| e.event_type == "clock_in")?;
    let clock_out = events.iter().rev().find(|e| e.event_type == "clock_out");

    let start = parse_timestamp(&clock_in.timestamp)?;
    let end = clock_out.and_then(|e| parse_timestamp(&e.timestamp)).or_else(|| {
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        if date_key == today {
            Some(chrono::Local::now().fixed_offset())
        } else {
            None
        }
    })?;

    let total_minutes = (end - start).num_seconds() as f64 / 60.0;

    let mut break_minutes = 0.0;
    let mut break_start: Option<DateTime<FixedOffset>> = None;

    for event in events {
        match event.event_type.as_str() {
            "break_start" => {
                break_start = parse_timestamp(&event.timestamp);
            }
            "break_end" => {
                if let (Some(bs), Some(be)) = (break_start.take(), parse_timestamp(&event.timestamp))
                {
                    break_minutes += (be - bs).num_seconds() as f64 / 60.0;
                }
            }
            _ => {}
        }
    }
    if let Some(bs) = break_start {
        break_minutes += (end - bs).num_seconds().max(0) as f64 / 60.0;
    }

    let work_minutes = (total_minutes - break_minutes).max(0.0);

    Some(DailyRecord {
        date_key: date_key.to_string(),
        work_minutes: (work_minutes * 10.0).round() / 10.0,
        break_minutes: (break_minutes * 10.0).round() / 10.0,
    })
}

/// 1日分のサマリー行を生成する。(行テキスト, 実労働秒数) を返す
fn format_daily_summary(date_key: &str, events: &[&StampEvent]) -> Option<(String, i64)> {
    let clock_in = events.iter().find(|e| e.event_type == "clock_in")?;
    let clock_out = events.iter().rev().find(|e| e.event_type == "clock_out")?;

    let start = parse_timestamp(&clock_in.timestamp)?;
    let end = parse_timestamp(&clock_out.timestamp)?;

    let mut break_secs: i64 = 0;
    let mut break_start: Option<DateTime<FixedOffset>> = None;
    for event in events {
        match event.event_type.as_str() {
            "break_start" => {
                break_start = parse_timestamp(&event.timestamp);
            }
            "break_end" => {
                if let (Some(bs), Some(be)) =
                    (break_start.take(), parse_timestamp(&event.timestamp))
                {
                    break_secs += (be - bs).num_seconds();
                }
            }
            _ => {}
        }
    }
    if let Some(bs) = break_start {
        break_secs += (end - bs).num_seconds().max(0);
    }

    let work_secs = ((end - start).num_seconds() - break_secs).max(0);
    let work_hours = work_secs / 3600;
    let work_minutes = (work_secs % 3600) / 60;

    let date = NaiveDate::parse_from_str(date_key, "%Y-%m-%d").ok()?;
    let weekday = match date.weekday() {
        chrono::Weekday::Mon => "Mon",
        chrono::Weekday::Tue => "Tue",
        chrono::Weekday::Wed => "Wed",
        chrono::Weekday::Thu => "Thu",
        chrono::Weekday::Fri => "Fri",
        chrono::Weekday::Sat => "Sat",
        chrono::Weekday::Sun => "Sun",
    };
    let date_str = format!("{}/{}({})", date.month(), date.day(), weekday);

    let start_time = start.format("%H:%M:%S");
    let end_time = end.format("%H:%M:%S");

    let line = if break_secs > 0 {
        let break_hours = break_secs / 3600;
        let break_mins = (break_secs % 3600) / 60;
        format!(
            "- {}: {}時間{}分 ({}-{} ※{}時間{}分の中抜け含む)",
            date_str, work_hours, work_minutes, start_time, end_time, break_hours, break_mins
        )
    } else {
        format!(
            "- {}: {}時間{}分 ({}-{})",
            date_str, work_hours, work_minutes, start_time, end_time
        )
    };

    Some((line, work_secs))
}

fn parse_timestamp(ts: &str) -> Option<DateTime<FixedOffset>> {
    DateTime::parse_from_rfc3339(ts).ok()
}
