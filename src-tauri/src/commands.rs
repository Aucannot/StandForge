use tauri::{Manager, State};
use std::sync::{Arc, Mutex};
use crate::timer::StandTimer;
use crate::db;
use crate::models::{CycleConfig, StandSession};

#[derive(Debug)]
pub struct AppState {
    pub timer: Arc<Mutex<StandTimer>>,
}

#[derive(serde::Serialize)]
pub struct TodayStatsResponse {
    pub total_duration_sec: i64,
    pub session_count: usize,
    pub snooze_count: i32,
    pub snooze_total_sec: i32,
    pub completion_rate: i32,
    pub target_stand_sec: i32,
}

// Get current timer state
#[tauri::command]
pub fn get_timer_state(state: State<AppState>) -> Result<TimerStateResponse, String> {
    let timer = state.timer.lock().unwrap();
    Ok(TimerStateResponse {
        status: timer.get_state().as_str().to_string(),
        current_phase: timer.get_current_phase().as_str().to_string(),
        remaining_seconds: timer.get_remaining_seconds(),
        total_phase_seconds: timer.get_total_phase_seconds(),
        current_session_id: timer.get_current_session_id(),
    })
}

#[derive(serde::Serialize)]
pub struct TimerStateResponse {
    pub status: String,
    pub current_phase: String,
    pub remaining_seconds: i64,
    pub total_phase_seconds: i64,
    pub current_session_id: Option<String>,
}

// Start the timer (begin sitting phase)
#[tauri::command]
pub fn start_timer(
    state: State<AppState>,
    user_id: String,
    device_id: String,
) -> Result<String, String> {
    let session_id = db::create_session(&user_id, &device_id)
        .map_err(|e| e.to_string())?;

    let timer = state.timer.lock().unwrap();
    timer.start_sitting(session_id.clone());

    Ok(session_id)
}

// User confirms they have stood up
#[tauri::command]
pub fn confirm_stand(state: State<AppState>) -> Result<(), String> {
    let session_id = {
        let timer = state.timer.lock().unwrap();
        timer.get_current_session_id()
    };
    if let Some(session_id) = session_id {
        db::update_session_stand_start(&session_id)
            .map_err(|e| e.to_string())?;
    }

    let timer = state.timer.lock().unwrap();
    timer.confirm_stand();
    Ok(())
}

// User confirms they have sat down
#[tauri::command]
pub fn confirm_sit(
    state: State<AppState>,
) -> Result<i64, String> {
    let session_id = {
        let timer = state.timer.lock().unwrap();
        timer.get_current_session_id()
    };

    let duration = if let Some(session_id) = session_id {
        db::update_session_end(&session_id, "user_confirm")
            .map_err(|e| e.to_string())?
    } else {
        0
    };

    let next_session_id = db::create_session("default_user", "this_mac")
        .map_err(|e| e.to_string())?;

    let timer = state.timer.lock().unwrap();
    timer.start_next_sitting(next_session_id);
    Ok(duration)
}

// Pause the timer
#[tauri::command]
pub fn pause_timer(state: State<AppState>) -> Result<(), String> {
    let timer = state.timer.lock().unwrap();
    timer.pause();
    Ok(())
}

// Resume the timer
#[tauri::command]
pub fn resume_timer(state: State<AppState>) -> Result<(), String> {
    let timer = state.timer.lock().unwrap();
    timer.resume();
    Ok(())
}

// Stop and reset the timer
#[tauri::command]
pub fn stop_timer(state: State<AppState>) -> Result<(), String> {
    let timer = state.timer.lock().unwrap();
    timer.stop();
    Ok(())
}

// Switch to standing phase
#[tauri::command]
pub fn switch_to_stand(state: State<AppState>) -> Result<(), String> {
    let session_id = {
        let timer = state.timer.lock().unwrap();
        timer.get_current_session_id()
    };
    if let Some(session_id) = session_id {
        db::update_session_stand_start(&session_id)
            .map_err(|e| e.to_string())?;
    }

    let timer = state.timer.lock().unwrap();
    timer.switch_to_stand();
    Ok(())
}

// Switch to sitting phase
#[tauri::command]
pub fn switch_to_sit(state: State<AppState>) -> Result<(), String> {
    let timer = state.timer.lock().unwrap();
    timer.switch_to_sit();
    Ok(())
}

// Snooze the standing reminder
#[tauri::command]
pub fn snooze_stand(state: State<AppState>, snooze_minutes: i32) -> Result<(), String> {
    let session_id = {
        let timer = state.timer.lock().unwrap();
        timer.get_current_session_id()
    };
    if let Some(session_id) = session_id {
        db::add_snooze_to_session(&session_id, snooze_minutes)
            .map_err(|e| e.to_string())?;
    }

    let timer = state.timer.lock().unwrap();
    timer.snooze(snooze_minutes as i64);
    Ok(())
}

#[tauri::command]
pub fn get_config(user_id: String) -> Result<CycleConfig, String> {
    db::get_or_create_config(&user_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_config_command(
    state: State<AppState>,
    config: CycleConfig,
) -> Result<(), String> {
    db::update_config(&config).map_err(|e| e.to_string())?;

    let timer = state.timer.lock().unwrap();
    timer.set_durations(config.sit_minutes as i64, config.stand_minutes as i64);

    Ok(())
}

#[tauri::command]
pub fn get_today_sessions(user_id: String) -> Result<Vec<StandSession>, String> {
    db::get_today_sessions(&user_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_today_stats(user_id: String) -> Result<TodayStatsResponse, String> {
    let config = db::get_or_create_config(&user_id).map_err(|e| e.to_string())?;
    let sessions = db::get_today_sessions(&user_id).map_err(|e| e.to_string())?;
    let total_duration_sec: i64 = sessions
        .iter()
        .map(|session| session.duration_sec.unwrap_or(0))
        .sum();
    let snooze_count: i32 = sessions.iter().map(|session| session.snooze_count).sum();
    let snooze_total_sec: i32 = sessions.iter().map(|session| session.snooze_total_sec).sum();
    let target_stand_sec = (config.stand_minutes * 60).max(1);
    let target_total = target_stand_sec as i64 * sessions.len().max(1) as i64;
    let completion_rate = if sessions.is_empty() {
        0
    } else {
        ((total_duration_sec * 100) / target_total).min(100) as i32
    };

    Ok(TodayStatsResponse {
        total_duration_sec,
        session_count: sessions.len(),
        snooze_count,
        snooze_total_sec,
        completion_rate,
        target_stand_sec,
    })
}

// Show the single floating window
#[tauri::command]
pub fn show_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("floating") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command]
pub fn set_floating_expanded(app: tauri::AppHandle, expanded: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("floating")
        .ok_or_else(|| "floating window not found".to_string())?;
    let (width, height) = if expanded { (340.0, 520.0) } else { (340.0, 80.0) };

    window
        .set_size(tauri::LogicalSize::new(width, height))
        .map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    Ok(())
}

// Quit application
#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}
