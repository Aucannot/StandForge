use std::sync::{Arc, Mutex};
use std::process::Command;
use tauri::{Emitter, Manager};
use chrono::DateTime;
use crate::db;

#[derive(Debug, Clone, serde::Serialize)]
pub enum TimerEvent {
    TimerTick {
        status: String,
        current_phase: String,
        remaining_seconds: i64,
        total_phase_seconds: i64,
    },
    PhaseComplete {
        phase: String,
        next_phase: String,
    },
}

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
}

impl TimerPhase {
    pub fn as_str(&self) -> &'static str {
        match self {
            TimerPhase::Sit => "sit",
            TimerPhase::Stand => "stand",
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

    pub fn get_current_session_id(&self) -> Option<String> {
        self.current_session_id.lock().unwrap().clone()
    }

    pub fn set_durations(&self, sit_minutes: i64, stand_minutes: i64) {
        *self.sit_duration_sec.lock().unwrap() = sit_minutes.max(1) * 60;
        *self.stand_duration_sec.lock().unwrap() = stand_minutes.max(1) * 60;
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

    pub fn confirm_sit(&self) {
        *self.state.lock().unwrap() = TimerState::Idle;
        *self.current_session_id.lock().unwrap() = None;
        *self.current_phase.lock().unwrap() = TimerPhase::Sit;
        *self.phase_duration_sec.lock().unwrap() = 0;
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

    pub fn switch_to_sit(&self) {
        *self.state.lock().unwrap() = TimerState::Sitting;
        *self.current_phase.lock().unwrap() = TimerPhase::Sit;
        *self.phase_start.lock().unwrap() = chrono::Utc::now();
        *self.phase_duration_sec.lock().unwrap() = *self.sit_duration_sec.lock().unwrap();
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
