use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StandSession {
    pub id: String,
    pub user_id: String,
    pub device_id: String,
    pub scheduled_start_at: String,
    pub actual_stand_start_at: Option<String>,
    pub start_source: String,
    pub end_at: Option<String>,
    pub end_source: Option<String>,
    pub duration_sec: Option<i64>,
    pub snooze_count: i32,
    pub snooze_total_sec: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CycleConfig {
    pub user_id: String,
    pub sit_minutes: i32,
    pub stand_minutes: i32,
    pub notifications_enabled: bool,
    pub sound_enabled: bool,
    pub auto_end_enabled: bool,
    pub auto_end_after_sec: i32,
    pub ui_skin: String,
    pub last_updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PersistedTimerState {
    pub status: String,
    pub current_session_id: Option<String>,
    pub current_phase: String,
    pub phase_remaining_sec: i64,
    pub phase_start_sec: i64,
    pub updated_at: String,
}
