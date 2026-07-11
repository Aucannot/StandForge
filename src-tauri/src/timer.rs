use std::process::Command;
use std::sync::{Arc, Mutex};

use chrono::DateTime;
use tauri::{Emitter, Manager};

use crate::db;
use crate::models::PersistedTimerState;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum TimerState {
    Idle,
    Sitting,
    StandPending,
    Standing,
    Snoozed,
    Paused,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum TimerPhase {
    Sit,
    Stand,
}

impl TimerState {
    pub fn as_str(&self) -> &'static str {
        match self {
            TimerState::Idle => "idle",
            TimerState::Sitting => "sitting",
            TimerState::StandPending => "stand_pending",
            TimerState::Standing => "standing",
            TimerState::Snoozed => "snoozed",
            TimerState::Paused => "paused",
        }
    }

    fn from_str(value: &str) -> Option<Self> {
        match value {
            "idle" => Some(Self::Idle),
            "sitting" => Some(Self::Sitting),
            "stand_pending" => Some(Self::StandPending),
            "standing" => Some(Self::Standing),
            "snoozed" => Some(Self::Snoozed),
            "paused" => Some(Self::Paused),
            _ => None,
        }
    }
}

impl TimerPhase {
    pub fn as_str(&self) -> &'static str {
        match self {
            TimerPhase::Sit => "sit",
            TimerPhase::Stand => "stand",
        }
    }

    fn from_str(value: &str) -> Option<Self> {
        match value {
            "sit" => Some(Self::Sit),
            "stand" => Some(Self::Stand),
            _ => None,
        }
    }
}

#[derive(Debug)]
pub struct StandTimer {
    state: Arc<Mutex<TimerState>>,
    current_phase: Arc<Mutex<TimerPhase>>,
    phase_start: Arc<Mutex<DateTime<chrono::Utc>>>,
    phase_duration_sec: Arc<Mutex<i64>>,
    sit_duration_sec: Arc<Mutex<i64>>,
    stand_duration_sec: Arc<Mutex<i64>>,
    current_session_id: Arc<Mutex<Option<String>>>,
    paused_state: Arc<Mutex<Option<TimerState>>>,
    paused_remaining_sec: Arc<Mutex<i64>>,
    phase_complete_emitted: Arc<Mutex<bool>>,
    auto_end_enabled: Arc<Mutex<bool>>,
    auto_end_after_sec: Arc<Mutex<i64>>,
}

impl StandTimer {
    pub fn new(sit_minutes: i64, stand_minutes: i64) -> Self {
        Self {
            state: Arc::new(Mutex::new(TimerState::Idle)),
            current_phase: Arc::new(Mutex::new(TimerPhase::Sit)),
            phase_start: Arc::new(Mutex::new(chrono::Utc::now())),
            phase_duration_sec: Arc::new(Mutex::new(0)),
            sit_duration_sec: Arc::new(Mutex::new(sit_minutes * 60)),
            stand_duration_sec: Arc::new(Mutex::new(stand_minutes * 60)),
            current_session_id: Arc::new(Mutex::new(None)),
            paused_state: Arc::new(Mutex::new(None)),
            paused_remaining_sec: Arc::new(Mutex::new(0)),
            phase_complete_emitted: Arc::new(Mutex::new(false)),
            auto_end_enabled: Arc::new(Mutex::new(false)),
            auto_end_after_sec: Arc::new(Mutex::new(3_600)),
        }
    }

    pub fn get_state(&self) -> TimerState {
        *self.state.lock().unwrap()
    }

    pub fn get_current_phase(&self) -> TimerPhase {
        *self.current_phase.lock().unwrap()
    }

    pub fn get_remaining_seconds(&self) -> i64 {
        if self.get_state() == TimerState::Paused {
            return *self.paused_remaining_sec.lock().unwrap();
        }
        let phase_start = *self.phase_start.lock().unwrap();
        let phase_duration = *self.phase_duration_sec.lock().unwrap();
        let elapsed = (chrono::Utc::now() - phase_start).num_seconds();
        (phase_duration - elapsed).max(0)
    }

    pub fn get_total_phase_seconds(&self) -> i64 {
        *self.phase_duration_sec.lock().unwrap()
    }

    pub fn get_elapsed_seconds(&self) -> i64 {
        (chrono::Utc::now() - *self.phase_start.lock().unwrap())
            .num_seconds()
            .max(0)
    }

    pub fn get_current_session_id(&self) -> Option<String> {
        self.current_session_id.lock().unwrap().clone()
    }

    pub fn set_durations(&self, sit_minutes: i64, stand_minutes: i64) {
        *self.sit_duration_sec.lock().unwrap() = sit_minutes.max(1) * 60;
        *self.stand_duration_sec.lock().unwrap() = stand_minutes.max(1) * 60;
    }

    pub fn set_auto_end(&self, enabled: bool, after_seconds: i64) {
        *self.auto_end_enabled.lock().unwrap() = enabled;
        *self.auto_end_after_sec.lock().unwrap() = after_seconds.max(60);
    }

    pub fn snapshot(&self) -> PersistedTimerState {
        PersistedTimerState {
            status: self.get_state().as_str().to_string(),
            current_session_id: self.get_current_session_id(),
            current_phase: self.get_current_phase().as_str().to_string(),
            phase_remaining_sec: self.get_remaining_seconds(),
            phase_start_sec: chrono::Utc::now().timestamp(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        }
    }

    pub fn restore(&self, persisted: &PersistedTimerState) -> bool {
        let Some(state) = TimerState::from_str(&persisted.status) else {
            return false;
        };
        let Some(phase) = TimerPhase::from_str(&persisted.current_phase) else {
            return false;
        };
        if state == TimerState::Idle || persisted.current_session_id.is_none() {
            return false;
        }

        let elapsed = if state == TimerState::Paused {
            0
        } else {
            (chrono::Utc::now().timestamp() - persisted.phase_start_sec).max(0)
        };
        let remaining = (persisted.phase_remaining_sec - elapsed).max(0);

        *self.state.lock().unwrap() = state;
        *self.current_phase.lock().unwrap() = phase;
        *self.phase_start.lock().unwrap() =
            chrono::Utc::now() - chrono::Duration::seconds(elapsed);
        *self.phase_duration_sec.lock().unwrap() = persisted.phase_remaining_sec.max(0);
        *self.current_session_id.lock().unwrap() = persisted.current_session_id.clone();
        *self.paused_state.lock().unwrap() = if state == TimerState::Paused {
            Some(match phase {
                TimerPhase::Sit => TimerState::Sitting,
                TimerPhase::Stand => TimerState::Standing,
            })
        } else {
            None
        };
        *self.paused_remaining_sec.lock().unwrap() = if state == TimerState::Paused {
            remaining
        } else {
            0
        };
        *self.phase_complete_emitted.lock().unwrap() = false;
        true
    }

    pub fn start_sitting(&self, session_id: String) {
        *self.state.lock().unwrap() = TimerState::Sitting;
        *self.current_phase.lock().unwrap() = TimerPhase::Sit;
        *self.phase_start.lock().unwrap() = chrono::Utc::now();
        *self.phase_duration_sec.lock().unwrap() = *self.sit_duration_sec.lock().unwrap();
        *self.current_session_id.lock().unwrap() = Some(session_id);
        *self.paused_state.lock().unwrap() = None;
        *self.paused_remaining_sec.lock().unwrap() = 0;
        *self.phase_complete_emitted.lock().unwrap() = false;
    }

    pub fn start_next_sitting(&self, session_id: String) {
        self.start_sitting(session_id);
    }

    pub fn transition_to_stand_pending(&self) {
        *self.state.lock().unwrap() = TimerState::StandPending;
    }

    pub fn confirm_stand(&self) {
        *self.state.lock().unwrap() = TimerState::Standing;
        *self.current_phase.lock().unwrap() = TimerPhase::Stand;
        *self.phase_start.lock().unwrap() = chrono::Utc::now();
        *self.phase_duration_sec.lock().unwrap() = *self.stand_duration_sec.lock().unwrap();
        *self.paused_state.lock().unwrap() = None;
        *self.paused_remaining_sec.lock().unwrap() = 0;
        *self.phase_complete_emitted.lock().unwrap() = false;
    }

    pub fn snooze(&self, snooze_minutes: i64) {
        let snooze_sec = snooze_minutes * 60;
        let new_duration = *self.phase_duration_sec.lock().unwrap() + snooze_sec;
        *self.phase_duration_sec.lock().unwrap() = new_duration;
        *self.state.lock().unwrap() = TimerState::Snoozed;
        *self.paused_state.lock().unwrap() = None;
        *self.paused_remaining_sec.lock().unwrap() = 0;
        *self.phase_complete_emitted.lock().unwrap() = false;
    }

    pub fn pause(&self) {
        let state = self.get_state();
        if state == TimerState::Idle || state == TimerState::Paused {
            return;
        }
        let remaining = self.get_remaining_seconds();
        *self.paused_state.lock().unwrap() = Some(state);
        *self.paused_remaining_sec.lock().unwrap() = remaining;
        *self.state.lock().unwrap() = TimerState::Paused;
    }

    pub fn resume(&self) {
        let prev_state = self.paused_state.lock().unwrap().take();
        if let Some(state) = prev_state {
            let remaining = *self.paused_remaining_sec.lock().unwrap();
            *self.state.lock().unwrap() = state;
            *self.phase_start.lock().unwrap() = chrono::Utc::now();
            *self.phase_duration_sec.lock().unwrap() = remaining;
            *self.paused_remaining_sec.lock().unwrap() = 0;
            *self.phase_complete_emitted.lock().unwrap() = false;
        }
    }

    pub fn stop(&self) {
        *self.state.lock().unwrap() = TimerState::Idle;
        *self.current_phase.lock().unwrap() = TimerPhase::Sit;
        *self.phase_duration_sec.lock().unwrap() = 0;
        *self.current_session_id.lock().unwrap() = None;
        *self.paused_state.lock().unwrap() = None;
        *self.paused_remaining_sec.lock().unwrap() = 0;
        *self.phase_complete_emitted.lock().unwrap() = false;
    }

    pub fn switch_to_stand(&self) {
        *self.state.lock().unwrap() = TimerState::Standing;
        *self.current_phase.lock().unwrap() = TimerPhase::Stand;
        *self.phase_start.lock().unwrap() = chrono::Utc::now();
        *self.phase_duration_sec.lock().unwrap() = *self.stand_duration_sec.lock().unwrap();
        *self.paused_state.lock().unwrap() = None;
        *self.paused_remaining_sec.lock().unwrap() = 0;
        *self.phase_complete_emitted.lock().unwrap() = false;
    }

    pub fn update(&self, app: &tauri::AppHandle) -> bool {
        let state = self.get_state();
        if state == TimerState::Idle {
            return false;
        }

        let remaining = self.get_remaining_seconds();

        let timer_state = serde_json::json!({
            "status": state.as_str(),
            "current_phase": self.get_current_phase().as_str(),
            "remaining_seconds": remaining,
            "total_phase_seconds": self.get_total_phase_seconds(),
            "current_session_id": self.get_current_session_id(),
        });
        app.emit_to("floating", "timer-tick", timer_state).ok();

        if state == TimerState::Paused {
            return true;
        }

        if state == TimerState::Standing {
            let auto_end_enabled = *self.auto_end_enabled.lock().unwrap();
            let auto_end_after_sec = *self.auto_end_after_sec.lock().unwrap();
            if auto_end_enabled && self.get_elapsed_seconds() >= auto_end_after_sec {
                if let Some(session_id) = self.get_current_session_id() {
                    let _ = db::update_session_end(&session_id, "auto_end");
                }
                if let Ok(next_session_id) = db::create_session("default_user", "this_mac") {
                    self.start_next_sitting(next_session_id);
                    let _ = db::save_timer_state(&self.snapshot());
                } else {
                    self.stop();
                    let _ = db::clear_timer_state();
                }
                show_timer_notification(
                    "站立已自动结束",
                    "已达到自动结束时长",
                    "下一轮屏幕使用计时已开始。",
                );
                app.emit_to("floating", "phase-complete", serde_json::json!({
                    "phase": "stand",
                    "next_phase": "sit",
                    "auto_ended": true
                })).ok();
                return true;
            }
        }

        // Check if phase is complete
        if remaining <= 0 {
            let mut emitted = self.phase_complete_emitted.lock().unwrap();
            if *emitted {
                return true;
            }
            *emitted = true;
            drop(emitted);

            match state {
                TimerState::Sitting => {
                    self.transition_to_stand_pending();
                    let _ = db::save_timer_state(&self.snapshot());
                    show_timer_notification(
                        "站立提醒",
                        "屏幕使用时间已到",
                        "起来活动一下。",
                    );
                    app.emit_to("floating", "phase-complete", serde_json::json!({
                        "phase": "sit",
                        "next_phase": "stand"
                    })).ok();
                    show_floating_window(app);
                }
                TimerState::Standing => {
                    show_timer_notification(
                        "坐下提醒",
                        "本轮站立完成",
                        "可以回到屏幕前。",
                    );
                    app.emit_to("floating", "phase-complete", serde_json::json!({
                        "phase": "stand",
                        "next_phase": "sit"
                    })).ok();
                    show_floating_window(app);
                }
                TimerState::Snoozed => {
                    // Return to pending state after snooze
                    self.transition_to_stand_pending();
                    let _ = db::save_timer_state(&self.snapshot());
                    show_timer_notification(
                        "站立提醒",
                        "延后时间到了",
                        "现在起来活动一下。",
                    );
                    app.emit_to("floating", "phase-complete", serde_json::json!({
                        "phase": "snooze",
                        "next_phase": "stand"
                    })).ok();
                    show_floating_window(app);
                }
                _ => {}
            }
        }

        true
    }
}

fn show_timer_notification(title: &str, subtitle: &str, body: &str) {
    let Ok(config) = db::get_or_create_config("default_user") else {
        return;
    };
    if !config.notifications_enabled {
        return;
    }

    show_macos_notification(title, subtitle, body, config.sound_enabled);
}

#[cfg(target_os = "macos")]
fn show_macos_notification(title: &str, subtitle: &str, body: &str, sound_enabled: bool) {
    let sound_clause = if sound_enabled { " sound name \"Glass\"" } else { "" };
    let script = format!(
        "display notification \"{}\" with title \"{}\" subtitle \"{}\"{}",
        escape_applescript_text(body),
        escape_applescript_text(title),
        escape_applescript_text(subtitle),
        sound_clause,
    );

    let _ = Command::new("/usr/bin/osascript")
        .arg("-e")
        .arg(script)
        .spawn();
}

#[cfg(not(target_os = "macos"))]
fn show_macos_notification(_title: &str, _subtitle: &str, _body: &str, _sound_enabled: bool) {}

fn escape_applescript_text(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn show_floating_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("floating") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn start_pause_resume_and_stop_preserve_expected_state() {
        let timer = StandTimer::new(45, 15);
        timer.start_sitting("session-1".to_string());
        assert_eq!(timer.get_state(), TimerState::Sitting);
        assert_eq!(timer.get_current_phase(), TimerPhase::Sit);
        assert_eq!(timer.get_current_session_id().as_deref(), Some("session-1"));

        timer.pause();
        let paused_remaining = timer.get_remaining_seconds();
        assert_eq!(timer.get_state(), TimerState::Paused);

        timer.resume();
        assert_eq!(timer.get_state(), TimerState::Sitting);
        assert!(timer.get_remaining_seconds() <= paused_remaining);

        timer.stop();
        assert_eq!(timer.get_state(), TimerState::Idle);
        assert_eq!(timer.get_current_session_id(), None);
    }

    #[test]
    fn restore_uses_wall_clock_elapsed_time() {
        let timer = StandTimer::new(45, 15);
        let persisted = PersistedTimerState {
            status: "sitting".to_string(),
            current_session_id: Some("session-2".to_string()),
            current_phase: "sit".to_string(),
            phase_remaining_sec: 10,
            phase_start_sec: chrono::Utc::now().timestamp() - 5,
            updated_at: chrono::Utc::now().to_rfc3339(),
        };

        assert!(timer.restore(&persisted));
        assert_eq!(timer.get_state(), TimerState::Sitting);
        assert!((4..=5).contains(&timer.get_remaining_seconds()));
    }

    #[test]
    fn paused_restore_does_not_consume_elapsed_time() {
        let timer = StandTimer::new(45, 15);
        let persisted = PersistedTimerState {
            status: "paused".to_string(),
            current_session_id: Some("session-3".to_string()),
            current_phase: "stand".to_string(),
            phase_remaining_sec: 120,
            phase_start_sec: chrono::Utc::now().timestamp() - 300,
            updated_at: chrono::Utc::now().to_rfc3339(),
        };

        assert!(timer.restore(&persisted));
        assert_eq!(timer.get_state(), TimerState::Paused);
        assert_eq!(timer.get_remaining_seconds(), 120);
        timer.resume();
        assert_eq!(timer.get_state(), TimerState::Standing);
    }
}
