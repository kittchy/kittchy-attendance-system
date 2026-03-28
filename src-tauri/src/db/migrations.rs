use rusqlite::Connection;

pub fn run_migrations(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS stamp_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL CHECK(event_type IN ('clock_in', 'clock_out', 'break_start', 'break_end')),
            timestamp TEXT NOT NULL,
            date_key TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_stamp_events_date_key ON stamp_events(date_key);

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS workspaces (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            color TEXT NOT NULL DEFAULT '#3b82f6',
            slack_webhook_url TEXT NOT NULL DEFAULT '',
            slack_clock_in_message TEXT NOT NULL DEFAULT '出勤しました',
            slack_clock_out_message TEXT NOT NULL DEFAULT '退勤しました',
            sort_order INTEGER NOT NULL DEFAULT 0
        );
        ",
    )?;

    // デフォルトワークスペースを作成（存在しなければ）
    conn.execute(
        "INSERT OR IGNORE INTO workspaces (id, name, color, sort_order) VALUES (1, 'デフォルト', '#3b82f6', 0)",
        [],
    )?;

    // stamp_events に workspace_id カラムを追加（既存テーブルの場合）
    let has_workspace_id: bool = conn
        .prepare("SELECT COUNT(*) FROM pragma_table_info('stamp_events') WHERE name = 'workspace_id'")?
        .query_row([], |row| row.get(0))?;

    if !has_workspace_id {
        conn.execute_batch(
            "ALTER TABLE stamp_events ADD COLUMN workspace_id INTEGER NOT NULL DEFAULT 1;",
        )?;
    }

    // 既存の settings テーブルの Slack 設定をデフォルトワークスペースにマイグレーション
    migrate_slack_settings_to_workspace(conn)?;

    Ok(())
}

/// settings テーブルの Slack 設定をデフォルトワークスペースに移行する
fn migrate_slack_settings_to_workspace(conn: &Connection) -> Result<(), rusqlite::Error> {
    // slack_webhook_url が settings に存在し、かつデフォルト WS の webhook が空なら移行
    let webhook: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'slack_webhook_url'",
            [],
            |row| row.get(0),
        )
        .ok();

    if let Some(url) = webhook {
        if !url.is_empty() {
            let ws_url: String = conn
                .query_row(
                    "SELECT slack_webhook_url FROM workspaces WHERE id = 1",
                    [],
                    |row| row.get(0),
                )
                .unwrap_or_default();

            if ws_url.is_empty() {
                conn.execute(
                    "UPDATE workspaces SET slack_webhook_url = ?1 WHERE id = 1",
                    rusqlite::params![url],
                )?;

                // 出勤・退勤メッセージも移行
                if let Ok(msg) = conn.query_row(
                    "SELECT value FROM settings WHERE key = 'slack_clock_in_message'",
                    [],
                    |row| row.get::<_, String>(0),
                ) {
                    conn.execute(
                        "UPDATE workspaces SET slack_clock_in_message = ?1 WHERE id = 1",
                        rusqlite::params![msg],
                    )?;
                }

                if let Ok(msg) = conn.query_row(
                    "SELECT value FROM settings WHERE key = 'slack_clock_out_message'",
                    [],
                    |row| row.get::<_, String>(0),
                ) {
                    conn.execute(
                        "UPDATE workspaces SET slack_clock_out_message = ?1 WHERE id = 1",
                        rusqlite::params![msg],
                    )?;
                }
            }
        }
    }

    Ok(())
}
