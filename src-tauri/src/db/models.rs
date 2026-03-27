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
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum WorkStatus {
    Idle,
    Working,
    OnBreak,
}
