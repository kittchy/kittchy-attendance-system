use crate::db::models::StampEvent;
use crate::state::AppState;
use chrono::{DateTime, FixedOffset};
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
    state: State<AppState>,
) -> Result<Vec<DailyRecord>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let date_prefix = format!("{:04}-{:02}", year, month);
    let mut stmt = db
        .prepare(
            "SELECT id, event_type, timestamp, date_key FROM stamp_events \
             WHERE date_key LIKE ?1 ORDER BY date_key, timestamp ASC",
        )
        .map_err(|e| e.to_string())?;

    let events: Vec<StampEvent> = stmt
        .query_map(rusqlite::params![format!("{}%", date_prefix)], |row| {
            Ok(StampEvent {
                id: row.get(0)?,
                event_type: row.get(1)?,
                timestamp: row.get(2)?,
                date_key: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // date_keyでグループ化
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

/// 1日のイベント列から勤務時間・休憩時間を計算する
fn calc_daily_record(date_key: &str, events: &[&StampEvent]) -> Option<DailyRecord> {
    let clock_in = events.iter().find(|e| e.event_type == "clock_in")?;
    let clock_out = events.iter().rev().find(|e| e.event_type == "clock_out");

    let start = parse_timestamp(&clock_in.timestamp)?;
    // clock_outがない場合: 当日のみ現在時刻で代替、過去日はスキップ
    let end = clock_out.and_then(|e| parse_timestamp(&e.timestamp)).or_else(|| {
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        if date_key == today {
            Some(chrono::Local::now().fixed_offset())
        } else {
            None
        }
    })?;

    let total_minutes = (end - start).num_seconds() as f64 / 60.0;

    // 休憩時間の計算
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

    let work_minutes = (total_minutes - break_minutes).max(0.0);

    Some(DailyRecord {
        date_key: date_key.to_string(),
        work_minutes: (work_minutes * 10.0).round() / 10.0,
        break_minutes: (break_minutes * 10.0).round() / 10.0,
    })
}

fn parse_timestamp(ts: &str) -> Option<DateTime<FixedOffset>> {
    DateTime::parse_from_rfc3339(ts).ok()
}
