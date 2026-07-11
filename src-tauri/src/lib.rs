mod db;
mod models;
mod timer;
mod commands;

use std::sync::{Arc, Mutex};
use std::time::Duration;
use std::thread;
use tauri::{Manager, WindowEvent};
use crate::timer::StandTimer;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            db::init_db().expect("failed to initialize StandForge database");
            let config = db::get_or_create_config("default_user")
                .expect("failed to load StandForge config");
            let timer = Arc::new(Mutex::new(StandTimer::new(
                config.sit_minutes as i64,
                config.stand_minutes as i64,
            )));
            let persisted = db::load_timer_state()
                .expect("failed to load StandForge timer state");
            if let Ok(timer_ref) = timer.lock() {
                timer_ref.set_auto_end(
                    config.auto_end_enabled,
                    config.auto_end_after_sec as i64,
                );
                let restored = persisted
                    .as_ref()
                    .filter(|state| {
                        state.current_session_id.as_deref().is_some_and(|session_id| {
                            db::get_session(session_id).ok().flatten().is_some()
                        })
                    })
                    .is_some_and(|state| timer_ref.restore(state));

                if !restored {
                    let session_id = db::create_session("default_user", "this_mac")
                        .expect("failed to start StandForge background session");
                    timer_ref.start_sitting(session_id);
                    db::save_timer_state(&timer_ref.snapshot())
                        .expect("failed to persist StandForge background session");
                }
            }

            app.manage(commands::AppState {
                timer: timer.clone(),
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
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "floating" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
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
            commands::get_config,
            commands::update_config_command,
            commands::get_today_sessions,
            commands::get_today_stats,
            commands::show_window,
            commands::set_floating_expanded,
            commands::quit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
