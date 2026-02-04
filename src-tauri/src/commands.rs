use tauri::{Manager, State};
use std::sync::{Arc, Mutex};
use std::time::UNIX_EPOCH;
use crate::timer::StandTimer;

#[derive(Debug)]
pub struct AppState {
    pub timer: Arc<Mutex<StandTimer>>,
    pub config: Arc<Mutex<Option<()>>>,  // 将 config 替换为占位符
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
) -> Result<String, String> {
    let session_id = "session_".to_string() + &std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
        .to_string();

    let timer = state.timer.lock().unwrap();
    timer.start_sitting(session_id.clone());

    Ok(session_id)
}

// User confirms they have stood up
#[tauri::command]
pub fn confirm_stand(state: State<AppState>) -> Result<(), String> {
    let timer = state.timer.lock().unwrap();
    timer.confirm_stand();
    Ok(())
}

// User confirms they have sat down
#[tauri::command]
pub fn confirm_sit(
    state: State<AppState>,
) -> Result<i64, String> {
    let timer = state.timer.lock().unwrap();

    // Calculate duration from timer state
    let duration = match timer.get_current_session_id() {
        Some(_) => {
            // For now, just return a placeholder duration
            600 // placeholder
        }
        None => {
            600 // placeholder
        }
    };
    timer.confirm_sit();
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
    let timer = state.timer.lock().unwrap();
    timer.snooze(snooze_minutes as i64);
    Ok(())
}

// Show main window
#[tauri::command]
pub fn show_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

// Quit application
#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}
