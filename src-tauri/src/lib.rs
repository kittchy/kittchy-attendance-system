mod commands;
mod db;
mod slack;
mod state;

use commands::attendance::{get_current_status_from_db, stamp_from_db};
use db::migrations::run_migrations;
use db::models::WorkStatus;
use rusqlite::Connection;
use state::AppState;
use std::sync::Mutex;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};

/// トレイメニューを現在の勤務状態に基づいて動的に構築する
fn build_tray_menu(
    app: &tauri::AppHandle,
) -> Result<tauri::menu::Menu<tauri::Wry>, Box<dyn std::error::Error>> {
    let state = app.state::<AppState>();
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let current = get_current_status_from_db(&db)?;

    // ワークスペース一覧を取得
    let mut ws_stmt =
        db.prepare("SELECT id, name FROM workspaces ORDER BY sort_order ASC, id ASC")?;
    let workspaces: Vec<(i64, String)> = ws_stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<Result<Vec<_>, _>>()?;

    let mut builder = MenuBuilder::new(app);

    // 状態表示（disabled）
    let status_text = match current.status {
        WorkStatus::Working => {
            let ws_name = current.workspace_name.as_deref().unwrap_or("不明");
            let time = current
                .clock_in_time
                .as_ref()
                .and_then(|t| chrono::DateTime::parse_from_rfc3339(t).ok())
                .map(|dt| dt.format("%H:%M").to_string())
                .unwrap_or_default();
            format!("● 勤務中 - {} ({}〜)", ws_name, time)
        }
        WorkStatus::OnBreak => {
            let ws_name = current.workspace_name.as_deref().unwrap_or("不明");
            format!("● 休憩中 - {}", ws_name)
        }
        WorkStatus::Idle => "○ 未出勤".to_string(),
    };

    let status_item = MenuItemBuilder::new(&status_text)
        .id("status_display")
        .enabled(false)
        .build(app)?;
    builder = builder.item(&status_item).separator();

    // 状態に応じたアクションボタン
    match current.status {
        WorkStatus::Working => {
            let clock_out = MenuItemBuilder::new("退勤")
                .id("action_clock_out")
                .build(app)?;
            let break_start = MenuItemBuilder::new("休憩")
                .id("action_break_start")
                .build(app)?;
            builder = builder.item(&clock_out).item(&break_start).separator();
        }
        WorkStatus::OnBreak => {
            let break_end = MenuItemBuilder::new("休憩終了")
                .id("action_break_end")
                .build(app)?;
            builder = builder.item(&break_end).separator();
        }
        WorkStatus::Idle => {
            // 出勤: ワークスペースが1つならサブメニューなし、2つ以上ならサブメニュー
            if workspaces.len() == 1 {
                let clock_in = MenuItemBuilder::new("出勤")
                    .id(format!("action_clock_in_{}", workspaces[0].0))
                    .build(app)?;
                builder = builder.item(&clock_in).separator();
            } else {
                let mut submenu = SubmenuBuilder::new(app, "出勤");
                for (ws_id, ws_name) in &workspaces {
                    let item = MenuItemBuilder::new(ws_name)
                        .id(format!("action_clock_in_{}", ws_id))
                        .build(app)?;
                    submenu = submenu.item(&item);
                }
                builder = builder.item(&submenu.build()?).separator();
            }
        }
    }

    // 共通メニュー
    let show_item = MenuItemBuilder::new("ウィンドウを表示")
        .id("show")
        .build(app)?;
    let quit_item = MenuItemBuilder::new("終了").id("quit").build(app)?;
    builder = builder.item(&show_item).item(&quit_item);

    Ok(builder.build()?)
}

/// トレイメニューを再構築して更新する
pub fn refresh_tray_menu(app: &tauri::AppHandle) {
    match build_tray_menu(app) {
        Ok(menu) => {
            if let Some(tray) = app.tray_by_id("main") {
                let _ = tray.set_menu(Some(menu));
            }
        }
        Err(e) => {
            log::warn!("トレイメニューの更新に失敗: {}", e);
        }
    }
}

/// トレイからの打刻を実行し、フロントエンドに通知する
fn tray_stamp(app: &tauri::AppHandle, event_type: &str, workspace_id: Option<i64>) {
    let state = app.state::<AppState>();
    let result = {
        let db = match state.db.lock() {
            Ok(db) => db,
            Err(e) => {
                log::warn!("DB lock エラー: {}", e);
                return;
            }
        };
        stamp_from_db(&db, event_type, workspace_id)
    };

    match result {
        Ok(_) => {
            let _ = app.emit("attendance-changed", ());
        }
        Err(e) => log::warn!("トレイ打刻エラー: {}", e),
    }
    refresh_tray_menu(app);
}

/// トレイメニューのイベントを処理する
fn handle_tray_menu_event(app: &tauri::AppHandle, event_id: &str) {
    match event_id {
        "show" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        "quit" => {
            app.exit(0);
        }
        id if id.starts_with("action_clock_in_") => {
            if let Ok(ws_id) = id.strip_prefix("action_clock_in_").unwrap().parse::<i64>() {
                tray_stamp(app, "clock_in", Some(ws_id));
            }
        }
        "action_clock_out" => tray_stamp(app, "clock_out", None),
        "action_break_start" => tray_stamp(app, "break_start", None),
        "action_break_end" => tray_stamp(app, "break_end", None),
        _ => {}
    }
}

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

            // システムトレイ（動的メニュー）
            let menu = build_tray_menu(app.handle()).expect("failed to build tray menu");

            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().cloned().unwrap())
                .menu(&menu)
                .show_menu_on_left_click(true)
                .tooltip("Kittchy 勤怠管理")
                .on_menu_event(|app, event| {
                    handle_tray_menu_event(app, event.id().as_ref());
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        refresh_tray_menu(app);
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // メインウィンドウを閉じる代わりに非表示にする
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::attendance::get_current_status,
            commands::attendance::stamp,
            commands::attendance::get_today_events,
            commands::attendance::update_event,
            commands::attendance::delete_event,
            commands::settings::get_settings,
            commands::settings::update_setting,
            commands::summary::get_daily_records,
            commands::summary::get_monthly_summary,
            commands::workspace::list_workspaces,
            commands::workspace::create_workspace,
            commands::workspace::update_workspace,
            commands::workspace::delete_workspace,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
