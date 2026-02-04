mod db;
mod models;
mod timer;
mod commands;

use std::sync::{Arc, Mutex};
use std::time::Duration;
use std::thread;
use tauri::Manager;
use crate::timer::StandTimer;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let timer = Arc::new(Mutex::new(StandTimer::new(45, 15)));

            // Store empty config - will be lazy-loaded on first access
            app.manage(commands::AppState {
                timer: timer.clone(),
                config: Arc::new(Mutex::new(None)),
            });

            let app_handle = app.handle().clone();
            thread::spawn(move || {
                loop {
                    if let Ok(timer) = timer.lock() {
                        timer.update(&app_handle);
                    }
                    thread::sleep(Duration::from_secs(1));
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_timer_state,
            commands::start_timer,
            commands::pause_timer,
            commands::resume_timer,
            commands::stop_timer,
            commands::switch_to_stand,
            commands::switch_to_sit,
            commands::confirm_stand,
            commands::confirm_sit,
            commands::snooze_stand,
            commands::show_window,
            commands::quit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
