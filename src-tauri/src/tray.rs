use crate::timer::{StandTimer, TimerState};
use std::sync::{Arc, Mutex};
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

const TRAY_ID: &str = "standforge-main";
const MENU_SHOW: &str = "standforge-show";
const MENU_HIDE: &str = "standforge-hide";
const MENU_TOGGLE_PAUSE: &str = "standforge-toggle-pause";
const MENU_STOP: &str = "standforge-stop";
const MENU_QUIT: &str = "standforge-quit";

pub fn setup(app: &tauri::App, timer: Arc<Mutex<StandTimer>>) -> tauri::Result<()> {
    let menu = MenuBuilder::new(app)
        .item(&MenuItemBuilder::with_id(MENU_SHOW, "显示悬浮窗").build(app)?)
        .item(&MenuItemBuilder::with_id(MENU_HIDE, "隐藏悬浮窗").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id(MENU_TOGGLE_PAUSE, "暂停 / 继续").build(app)?)
        .item(&MenuItemBuilder::with_id(MENU_STOP, "结束本轮").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id(MENU_QUIT, "退出 StandForge").build(app)?)
        .build()?;

    let icon = Image::from_bytes(include_bytes!("../icons/standforge-tray.png"))?;
    let tray_timer = timer.clone();

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .icon_as_template(true)
        .title("45:00")
        .tooltip("StandForge")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            MENU_SHOW => show_window(app),
            MENU_HIDE => hide_window(app),
            MENU_TOGGLE_PAUSE => toggle_pause(&tray_timer),
            MENU_STOP => stop_timer(&tray_timer),
            MENU_QUIT => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

pub fn update(app: &tauri::AppHandle, timer: &StandTimer) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };

    let remaining = timer.get_remaining_seconds();
    let title = format_time(remaining);
    let label = phase_label(timer.get_state());
    let tooltip = format!("StandForge · {label} · {title}");

    let _ = tray.set_title(Some(title));
    let _ = tray.set_tooltip(Some(tooltip));
}

fn show_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("floating") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn hide_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("floating") {
        let _ = window.hide();
    }
}

fn toggle_pause(timer: &Arc<Mutex<StandTimer>>) {
    if let Ok(timer) = timer.lock() {
        if timer.get_state() == TimerState::Paused {
            timer.resume();
        } else {
            timer.pause();
        }
    }
}

fn stop_timer(timer: &Arc<Mutex<StandTimer>>) {
    if let Ok(timer) = timer.lock() {
        timer.stop();
    }
}

fn phase_label(state: TimerState) -> &'static str {
    match state {
        TimerState::Idle => "后台提醒",
        TimerState::Sitting => "屏幕使用",
        TimerState::StandPending => "该站一会儿",
        TimerState::Standing => "站立中",
        TimerState::Snoozed => "已延后",
        TimerState::Paused => "已暂停",
    }
}

fn format_time(seconds: i64) -> String {
    let safe_seconds = seconds.max(0);
    format!("{:02}:{:02}", safe_seconds / 60, safe_seconds % 60)
}
