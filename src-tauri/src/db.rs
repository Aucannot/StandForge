use rusqlite::{Connection, Result, params};
use chrono::{Utc, DateTime};
use uuid::Uuid;
use crate::models::{StandSession, CycleConfig};

pub fn get_db_path() -> String {
    let mut path = std::env::var_os("HOME")
        .map(std::path::PathBuf::from)
        .map(|home| home.join("Library").join("Application Support").join("StandForge"))
        .unwrap_or_else(|| std::env::temp_dir().join("StandForge"));

    if let Err(err) = std::fs::create_dir_all(&path) {
        eprintln!("failed to create StandForge data directory: {err}");
    }

    path.push("standforge.db");
    path.to_string_lossy().to_string()
}

pub fn init_db() -> Result<()> {
    let db_path = get_db_path();
    let conn = Connection::open(&db_path)?;

    // journal_mode returns the selected mode, so consume that row instead of using execute().
    let _: String = conn.query_row("PRAGMA journal_mode = WAL", [], |row| row.get(0))?;

    // Create stand_sessions table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS stand_sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            device_id TEXT NOT NULL,
            scheduled_start_at TEXT NOT NULL,
            actual_stand_start_at TEXT,
            start_source TEXT NOT NULL,
            end_at TEXT,
            end_source TEXT,
            duration_sec INTEGER,
            snooze_count INTEGER DEFAULT 0,
            snooze_total_sec INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )?;

    // Create cycle_config table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS cycle_config (
            user_id TEXT PRIMARY KEY,
            sit_minutes INTEGER NOT NULL DEFAULT 45,
            stand_minutes INTEGER NOT NULL DEFAULT 15,
            notifications_enabled INTEGER NOT NULL DEFAULT 1,
            sound_enabled INTEGER NOT NULL DEFAULT 1,
            auto_end_enabled INTEGER NOT NULL DEFAULT 0,
            auto_end_after_sec INTEGER NOT NULL DEFAULT 3600,
            ui_skin TEXT NOT NULL DEFAULT 'liquid_glass',
            last_updated_at TEXT NOT NULL
        )",
        [],
    )?;

    let mut stmt = conn.prepare("PRAGMA table_info(cycle_config)")?;
    let column_names = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<Result<Vec<_>>>()?;
    if !column_names.iter().any(|name| name == "ui_skin") {
        conn.execute(
            "ALTER TABLE cycle_config ADD COLUMN ui_skin TEXT NOT NULL DEFAULT 'liquid_glass'",
            [],
        )?;
    }

    // Create timer_state_persist table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS timer_state_persist (
            id TEXT PRIMARY KEY DEFAULT 'main',
            status TEXT NOT NULL,
            current_session_id TEXT,
            current_phase TEXT NOT NULL,
            phase_remaining_sec INTEGER,
            phase_start_sec INTEGER,
            snooze_count INTEGER DEFAULT 0,
            updated_at TEXT NOT NULL
        )",
        [],
    )?;

    Ok(())
}

// Session operations

pub fn create_session(
    user_id: &str,
    device_id: &str,
) -> Result<String> {
    let db_path = get_db_path();
    let conn = Connection::open(&db_path)?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO stand_sessions (
            id, user_id, device_id, scheduled_start_at, start_source,
            snooze_count, snooze_total_sec, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            &id,
            user_id,
            device_id,
            &now,  // scheduled_start_at is now
            "user_confirm",
            0,
            0,
            &now,
            &now,
        ],
    )?;

    Ok(id)
}

pub fn update_session_stand_start(session_id: &str) -> Result<()> {
    let db_path = get_db_path();
    let conn = Connection::open(&db_path)?;
    let now = Utc::now();

    conn.execute(
        "UPDATE stand_sessions
         SET actual_stand_start_at = ?1, updated_at = ?2
         WHERE id = ?3",
        params![now.to_rfc3339(), now.to_rfc3339(), session_id],
    )?;

    Ok(())
}

pub fn update_session_end(
    session_id: &str,
    end_source: &str,
) -> Result<i64> {
    let db_path = get_db_path();
    let conn = Connection::open(&db_path)?;
    let now = Utc::now();

    // Get actual_stand_start_at to calculate duration
    let mut stmt = conn.prepare(
        "SELECT actual_stand_start_at FROM stand_sessions WHERE id = ?1"
    )?;
    let start_str: Option<String> = stmt.query_row(&[session_id], |row| row.get(0))?;

    let duration = if let Some(start_str) = start_str {
        if let Ok(start_dt) = DateTime::parse_from_rfc3339(&start_str) {
            let duration = now.signed_duration_since(start_dt)
                .num_seconds()
                .max(0);
            Some(duration)
        } else {
            None
        }
    } else {
        None
    };

    conn.execute(
        "UPDATE stand_sessions
         SET end_at = ?1, end_source = ?2, duration_sec = ?3, updated_at = ?4
         WHERE id = ?5",
        params![
            now.to_rfc3339(),
            end_source,
            duration.unwrap_or(0),
            now.to_rfc3339(),
            session_id,
        ],
    )?;

    Ok(duration.unwrap_or(0))
}

pub fn add_snooze_to_session(session_id: &str, snooze_minutes: i32) -> Result<()> {
    let db_path = get_db_path();
    let conn = Connection::open(&db_path)?;
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE stand_sessions
         SET snooze_count = snooze_count + 1,
             snooze_total_sec = snooze_total_sec + ?1,
             updated_at = ?2
         WHERE id = ?3",
        params![snooze_minutes * 60, now, session_id],
    )?;

    Ok(())
}

pub fn get_session(session_id: &str) -> Result<Option<StandSession>> {
    let db_path = get_db_path();
    let conn = Connection::open(&db_path)?;

    let mut stmt = conn.prepare(
        "SELECT id, user_id, device_id, scheduled_start_at,
                actual_stand_start_at, start_source, end_at, end_source,
                duration_sec, snooze_count, snooze_total_sec, created_at, updated_at
         FROM stand_sessions WHERE id = ?1"
    )?;

    let mut rows = stmt.query(&[session_id])?;

    if let Some(row) = rows.next()? {
        Ok(Some(StandSession {
            id: row.get(0)?,
            user_id: row.get(1)?,
            device_id: row.get(2)?,
            scheduled_start_at: row.get(3)?,
            actual_stand_start_at: row.get(4)?,
            start_source: row.get(5)?,
            end_at: row.get(6)?,
            end_source: row.get(7)?,
            duration_sec: row.get(8)?,
            snooze_count: row.get(9)?,
            snooze_total_sec: row.get(10)?,
            created_at: row.get(11)?,
            updated_at: row.get(12)?,
        }))
    } else {
        Ok(None)
    }
}

pub fn get_today_sessions(user_id: &str) -> Result<Vec<StandSession>> {
    let db_path = get_db_path();
    let conn = Connection::open(&db_path)?;

    let mut stmt = conn.prepare(
        "SELECT id, user_id, device_id, scheduled_start_at,
                actual_stand_start_at, start_source, end_at, end_source,
                duration_sec, snooze_count, snooze_total_sec, created_at, updated_at
         FROM stand_sessions
         WHERE user_id = ?1 AND date(end_at, 'localtime') = date('now', 'localtime')
         ORDER BY end_at DESC"
    )?;

    let mut sessions = Vec::new();
    let mut rows = stmt.query(&[user_id])?;

    while let Some(row) = rows.next()? {
        sessions.push(StandSession {
            id: row.get(0)?,
            user_id: row.get(1)?,
            device_id: row.get(2)?,
            scheduled_start_at: row.get(3)?,
            actual_stand_start_at: row.get(4)?,
            start_source: row.get(5)?,
            end_at: row.get(6)?,
            end_source: row.get(7)?,
            duration_sec: row.get(8)?,
            snooze_count: row.get(9)?,
            snooze_total_sec: row.get(10)?,
            created_at: row.get(11)?,
            updated_at: row.get(12)?,
        });
    }

    Ok(sessions)
}

// Config operations

pub fn get_or_create_config(user_id: &str) -> Result<CycleConfig> {
    let db_path = get_db_path();
    let conn = Connection::open(&db_path)?;
    let now = Utc::now();

    // Try to get existing config
    let mut stmt = conn.prepare(
        "SELECT user_id, sit_minutes, stand_minutes, notifications_enabled,
                sound_enabled, auto_end_enabled, auto_end_after_sec, ui_skin, last_updated_at
         FROM cycle_config WHERE user_id = ?1"
    )?;

    if let Ok(row) = stmt.query_row(&[user_id], |row| {
        Ok(CycleConfig {
            user_id: row.get(0)?,
            sit_minutes: row.get(1)?,
            stand_minutes: row.get(2)?,
            notifications_enabled: row.get(3)?,
            sound_enabled: row.get(4)?,
            auto_end_enabled: row.get(5)?,
            auto_end_after_sec: row.get(6)?,
            ui_skin: row.get(7)?,
            last_updated_at: row.get(8)?,
        })
    }) {
        return Ok(row);
    }

    // Create default config
    let config = CycleConfig {
        user_id: user_id.to_string(),
        sit_minutes: 45,
        stand_minutes: 15,
        notifications_enabled: true,
        sound_enabled: true,
        auto_end_enabled: false,
        auto_end_after_sec: 3600,
        ui_skin: "liquid_glass".to_string(),
        last_updated_at: now.to_rfc3339(),
    };

    conn.execute(
        "INSERT INTO cycle_config (
            user_id, sit_minutes, stand_minutes, notifications_enabled,
            sound_enabled, auto_end_enabled, auto_end_after_sec, ui_skin, last_updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            user_id,
            config.sit_minutes,
            config.stand_minutes,
            config.notifications_enabled,
            config.sound_enabled,
            config.auto_end_enabled,
            config.auto_end_after_sec,
            &config.ui_skin,
            now.to_rfc3339(),
        ],
    )?;

    Ok(config)
}

pub fn update_config(config: &CycleConfig) -> Result<()> {
    let db_path = get_db_path();
    let conn = Connection::open(&db_path)?;
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT OR REPLACE INTO cycle_config (
            user_id, sit_minutes, stand_minutes, notifications_enabled,
            sound_enabled, auto_end_enabled, auto_end_after_sec, ui_skin, last_updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            &config.user_id,
            config.sit_minutes,
            config.stand_minutes,
            config.notifications_enabled,
            config.sound_enabled,
            config.auto_end_enabled,
            config.auto_end_after_sec,
            &config.ui_skin,
            now,
        ],
    )?;

    Ok(())
}
