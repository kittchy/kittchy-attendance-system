mod commands;
mod db;
mod state;

use db::migrations::run_migrations;
use rusqlite::Connection;
use state::AppState;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // DB初期化
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("failed to get app data dir");
            std::fs::create_dir_all(&app_dir).expect("failed to create app data dir");

            let db_path = app_dir.join("attendance.db");
            let conn = Connection::open(&db_path).expect("failed to open database");
            run_migrations(&conn).expect("failed to run migrations");

            app.manage(AppState {
                db: Mutex::new(conn),
            });

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::attendance::get_current_status,
            commands::attendance::stamp,
            commands::attendance::get_today_events,
            commands::settings::get_settings,
            commands::settings::update_setting,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
