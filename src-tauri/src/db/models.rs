use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum EventType {
    ClockIn,
    ClockOut,
    BreakStart,
    BreakEnd,
}

impl EventType {
    pub fn as_str(&self) -> &'static str {
        match self {
            EventType::ClockIn => "clock_in",
            EventType::ClockOut => "clock_out",
            EventType::BreakStart => "break_start",
            EventType::BreakEnd => "break_end",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "clock_in" => Some(EventType::ClockIn),
            "clock_out" => Some(EventType::ClockOut),
            "break_start" => Some(EventType::BreakStart),
            "break_end" => Some(EventType::BreakEnd),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StampEvent {
    pub id: i64,
    pub event_type: String,
    pub timestamp: String,
    pub date_key: String,
    pub workspace_id: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum WorkStatus {
    Idle,
    Working,
    OnBreak,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub slack_webhook_url: String,
    pub slack_clock_in_message: String,
    pub slack_clock_out_message: String,
    pub slack_break_start_message: String,
    pub slack_break_end_message: String,
    pub sort_order: i64,
}
