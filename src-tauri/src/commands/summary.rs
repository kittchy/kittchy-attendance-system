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
    // 勤務中のセッションがある日は、未退勤でも現在時刻までを勤務時間として扱う
    let active_date_key =
        crate::commands::attendance::get_active_session(&db)?.map(|(date_key, _)| date_key);
    let active_date_key = active_date_key.as_deref();

    let mut records: Vec<DailyRecord> = Vec::new();
    let mut current_key = String::new();
    let mut group: Vec<&StampEvent> = Vec::new();

    for event in &events {
        if event.date_key != current_key {
            if !group.is_empty() {
                if let Some(record) = calc_daily_record(&current_key, &group, active_date_key) {
                    records.push(record);
                }
            }
            current_key = event.date_key.clone();
            group.clear();
        }
        group.push(event);
    }
    if !group.is_empty() {
        if let Some(record) = calc_daily_record(&current_key, &group, active_date_key) {
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
            .query_map(
                rusqlite::params![format!("{}%", date_prefix), ws_id],
                map_row,
            )
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

/// 出勤から退勤までの1セッション
struct WorkSession {
    start: DateTime<FixedOffset>,
    /// 退勤済みなら退勤時刻。退勤漏れの場合は None
    end: Option<DateTime<FixedOffset>>,
    break_secs: i64,
    /// break_end が来ていない休憩の開始時刻
    pending_break_start: Option<DateTime<FixedOffset>>,
}

impl WorkSession {
    /// 指定した終端時刻での (実労働秒数, 休憩秒数) を返す
    fn durations(&self, end: DateTime<FixedOffset>) -> (i64, i64) {
        let mut break_secs = self.break_secs;
        if let Some(bs) = self.pending_break_start {
            break_secs += (end - bs).num_seconds().max(0);
        }
        let work_secs = ((end - self.start).num_seconds() - break_secs).max(0);
        (work_secs, break_secs)
    }
}

/// 1日のイベント列を「出勤〜退勤」のセッション単位に分割する。
/// 1日に複数回の出退勤があっても、セッション間の空き時間を勤務時間に含めない
fn split_sessions(events: &[&StampEvent]) -> Vec<WorkSession> {
    let mut sessions: Vec<WorkSession> = Vec::new();
    let mut current: Option<WorkSession> = None;

    for event in events {
        let ts = match parse_timestamp(&event.timestamp) {
            Some(ts) => ts,
            None => continue,
        };
        match event.event_type.as_str() {
            "clock_in" => {
                // 退勤漏れのまま次の出勤が来た場合、前のセッションは未完了のまま残す
                if let Some(prev) = current.take() {
                    sessions.push(prev);
                }
                current = Some(WorkSession {
                    start: ts,
                    end: None,
                    break_secs: 0,
                    pending_break_start: None,
                });
            }
            "clock_out" => {
                if let Some(mut session) = current.take() {
                    if let Some(bs) = session.pending_break_start.take() {
                        session.break_secs += (ts - bs).num_seconds().max(0);
                    }
                    session.end = Some(ts);
                    sessions.push(session);
                }
            }
            "break_start" => {
                if let Some(session) = current.as_mut() {
                    session.pending_break_start = Some(ts);
                }
            }
            "break_end" => {
                if let Some(session) = current.as_mut() {
                    if let Some(bs) = session.pending_break_start.take() {
                        session.break_secs += (ts - bs).num_seconds().max(0);
                    }
                }
            }
            _ => {}
        }
    }
    if let Some(session) = current {
        sessions.push(session);
    }
    sessions
}

/// 勤務中のセッションがある日だけ、未退勤セッションの終端に現在時刻を使う。
/// 深夜勤務で 0 時をまたぐと date_key（勤務日）と今日の日付がずれるため、
/// 日付の一致ではなくアクティブセッションの date_key で判定する
fn now_if_active(date_key: &str, active_date_key: Option<&str>) -> Option<DateTime<FixedOffset>> {
    if active_date_key == Some(date_key) {
        Some(chrono::Local::now().fixed_offset())
    } else {
        None
    }
}

/// 勤務日の 0 時を基準にした 24 時超え表記を返す（翌日 01:30 → "25:30:00"）。
/// 勤務日から 48 時間以上離れた時刻は通常の時刻表記にフォールバックする
fn format_extended_time(date_key: &str, dt: DateTime<FixedOffset>) -> String {
    let base = NaiveDate::parse_from_str(date_key, "%Y-%m-%d")
        .ok()
        .and_then(|d| d.and_hms_opt(0, 0, 0))
        .and_then(|naive| naive.and_local_timezone(dt.timezone()).single());

    let secs = match base {
        Some(base) => (dt - base).num_seconds(),
        None => return dt.format("%H:%M:%S").to_string(),
    };
    if !(0..48 * 3600).contains(&secs) {
        return dt.format("%H:%M:%S").to_string();
    }

    format!(
        "{:02}:{:02}:{:02}",
        secs / 3600,
        (secs % 3600) / 60,
        secs % 60
    )
}

/// 1日のイベント列から勤務時間・休憩時間を計算する（全セッションの合計）
fn calc_daily_record(
    date_key: &str,
    events: &[&StampEvent],
    active_date_key: Option<&str>,
) -> Option<DailyRecord> {
    let sessions = split_sessions(events);
    let fallback_end = now_if_active(date_key, active_date_key);

    let mut work_secs: i64 = 0;
    let mut break_secs: i64 = 0;
    let mut counted = false;

    let last_idx = sessions.len().saturating_sub(1);
    for (i, session) in sessions.iter().enumerate() {
        // 未退勤に「現在」を当てるのは最後のセッションだけ。
        // 退勤漏れのまま再出勤した日で、前のセッションまで現在時刻まで伸びるのを防ぐ
        let fallback = if i == last_idx { fallback_end } else { None };
        let end = match session.end.or(fallback) {
            Some(end) => end,
            None => continue,
        };
        let (w, b) = session.durations(end);
        work_secs += w;
        break_secs += b;
        counted = true;
    }

    if !counted {
        return None;
    }

    let work_minutes = work_secs as f64 / 60.0;
    let break_minutes = break_secs as f64 / 60.0;

    Some(DailyRecord {
        date_key: date_key.to_string(),
        work_minutes: (work_minutes * 10.0).round() / 10.0,
        break_minutes: (break_minutes * 10.0).round() / 10.0,
    })
}

/// 1日分のサマリー行を生成する。(行テキスト, 実労働秒数) を返す。
/// 複数セッションある日は勤務時間を合計し、時刻は全セッションを併記する
fn format_daily_summary(date_key: &str, events: &[&StampEvent]) -> Option<(String, i64)> {
    let sessions = split_sessions(events);

    let mut work_secs: i64 = 0;
    let mut break_secs: i64 = 0;
    let mut ranges: Vec<String> = Vec::new();

    for session in &sessions {
        // 退勤済みのセッションのみ集計する
        let end = match session.end {
            Some(end) => end,
            None => continue,
        };
        let (w, b) = session.durations(end);
        work_secs += w;
        break_secs += b;
        ranges.push(format!(
            "{}-{}",
            format_extended_time(date_key, session.start),
            format_extended_time(date_key, end)
        ));
    }

    if ranges.is_empty() {
        return None;
    }

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
    let range_str = ranges.join(", ");

    let line = if break_secs > 0 {
        let break_hours = break_secs / 3600;
        let break_mins = (break_secs % 3600) / 60;
        format!(
            "- {}: {}時間{}分 ({} ※{}時間{}分の中抜け含む)",
            date_str, work_hours, work_minutes, range_str, break_hours, break_mins
        )
    } else {
        format!(
            "- {}: {}時間{}分 ({})",
            date_str, work_hours, work_minutes, range_str
        )
    };

    Some((line, work_secs))
}

fn parse_timestamp(ts: &str) -> Option<DateTime<FixedOffset>> {
    DateTime::parse_from_rfc3339(ts).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    const DATE_KEY: &str = "2026-09-01";

    fn ev(event_type: &str, timestamp: &str) -> StampEvent {
        ev_on(DATE_KEY, event_type, timestamp)
    }

    fn ev_on(date_key: &str, event_type: &str, timestamp: &str) -> StampEvent {
        StampEvent {
            id: 0,
            event_type: event_type.to_string(),
            timestamp: timestamp.to_string(),
            date_key: date_key.to_string(),
            workspace_id: 1,
        }
    }

    /// 1日に2回出退勤した日は、セッション間の空き時間を含めず合計する
    #[test]
    fn sums_multiple_sessions() {
        let events = vec![
            ev("clock_in", "2026-09-01T07:07:00+09:00"),
            ev("clock_out", "2026-09-01T08:57:00+09:00"),
            ev("clock_in", "2026-09-01T21:58:00+09:00"),
            ev("clock_out", "2026-09-01T23:45:00+09:00"),
        ];
        let refs: Vec<&StampEvent> = events.iter().collect();

        let record = calc_daily_record(DATE_KEY, &refs, None).unwrap();
        // 1時間50分 + 1時間47分 = 3時間37分 = 217分
        assert_eq!(record.work_minutes, 217.0);
        assert_eq!(record.break_minutes, 0.0);

        let (line, secs) = format_daily_summary(DATE_KEY, &refs).unwrap();
        assert_eq!(secs, 217 * 60);
        assert_eq!(
            line,
            "- 9/1(Tue): 3時間37分 (07:07:00-08:57:00, 21:58:00-23:45:00)"
        );
    }

    /// 休憩はそのセッション内だけを差し引く
    #[test]
    fn subtracts_break_within_session() {
        let events = vec![
            ev("clock_in", "2026-09-01T09:00:00+09:00"),
            ev("break_start", "2026-09-01T12:00:00+09:00"),
            ev("break_end", "2026-09-01T13:00:00+09:00"),
            ev("clock_out", "2026-09-01T18:00:00+09:00"),
        ];
        let refs: Vec<&StampEvent> = events.iter().collect();

        let record = calc_daily_record(DATE_KEY, &refs, None).unwrap();
        assert_eq!(record.work_minutes, 480.0);
        assert_eq!(record.break_minutes, 60.0);
    }

    /// 24 時をまたぐ勤務は、勤務日の date_key のまま翌日の timestamp で集計できる
    #[test]
    fn handles_overnight_session() {
        let events = vec![
            ev("clock_in", "2026-09-01T21:00:00+09:00"),
            ev("clock_out", "2026-09-02T01:30:00+09:00"),
        ];
        let refs: Vec<&StampEvent> = events.iter().collect();

        let record = calc_daily_record(DATE_KEY, &refs, None).unwrap();
        assert_eq!(record.work_minutes, 270.0);

        // 退勤は翌日 01:30 だが、勤務日基準で 25:30 と表記する
        let (line, _) = format_daily_summary(DATE_KEY, &refs).unwrap();
        assert_eq!(line, "- 9/1(Tue): 4時間30分 (21:00:00-25:30:00)");
    }

    /// 勤務中のセッションは、0 時をまたいで日付が変わっても集計対象に残る
    #[test]
    fn keeps_active_session_after_midnight() {
        // 昨日 21:00 出勤で今も勤務中。date_key は昨日のまま、現在日付は今日になる
        let yesterday = (chrono::Local::now() - chrono::Duration::days(1))
            .format("%Y-%m-%d")
            .to_string();
        let clock_in = (chrono::Local::now() - chrono::Duration::hours(3)).to_rfc3339();
        let events = vec![ev_on(&yesterday, "clock_in", &clock_in)];
        let refs: Vec<&StampEvent> = events.iter().collect();

        // アクティブセッションの date_key を渡せば、未退勤でも現在時刻まで集計される
        let record = calc_daily_record(&yesterday, &refs, Some(&yesterday)).unwrap();
        assert!((record.work_minutes - 180.0).abs() < 1.0);

        // 勤務中でなければ従来どおり集計対象外
        assert!(calc_daily_record(&yesterday, &refs, None).is_none());
    }

    /// 勤務日から 48 時間以上離れた時刻は通常の時刻表記にフォールバックする
    #[test]
    fn falls_back_beyond_48_hours() {
        let dt = DateTime::parse_from_rfc3339("2026-09-04T10:00:00+09:00").unwrap();
        assert_eq!(format_extended_time(DATE_KEY, dt), "10:00:00");

        let within = DateTime::parse_from_rfc3339("2026-09-02T01:30:00+09:00").unwrap();
        assert_eq!(format_extended_time(DATE_KEY, within), "25:30:00");
    }

    /// 過去日の退勤漏れセッションは集計から外し、退勤済みのセッションだけ数える
    #[test]
    fn skips_unclosed_session_on_past_day() {
        // 「今日」だと未退勤セッションに現在時刻が当たるため、過去日で検証する
        let past = "2020-06-15";
        let events = vec![
            ev_on(past, "clock_in", "2020-06-15T09:00:00+09:00"),
            ev_on(past, "clock_out", "2020-06-15T12:00:00+09:00"),
            ev_on(past, "clock_in", "2020-06-15T14:00:00+09:00"),
        ];
        let refs: Vec<&StampEvent> = events.iter().collect();

        let record = calc_daily_record(past, &refs, None).unwrap();
        assert_eq!(record.work_minutes, 180.0);

        let (_, secs) = format_daily_summary(past, &refs).unwrap();
        assert_eq!(secs, 180 * 60);
    }
}
