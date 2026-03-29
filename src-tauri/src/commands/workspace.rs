use crate::db::models::Workspace;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn list_workspaces(state: State<AppState>) -> Result<Vec<Workspace>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT id, name, color, slack_webhook_url, slack_clock_in_message, slack_clock_out_message, sort_order \
             FROM workspaces ORDER BY sort_order ASC, id ASC",
        )
        .map_err(|e| e.to_string())?;

    let workspaces = stmt
        .query_map([], |row| {
            Ok(Workspace {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                slack_webhook_url: row.get(3)?,
                slack_clock_in_message: row.get(4)?,
                slack_clock_out_message: row.get(5)?,
                sort_order: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(workspaces)
}

#[tauri::command]
pub fn create_workspace(
    name: String,
    color: String,
    state: State<AppState>,
) -> Result<Workspace, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // sort_order は既存の最大値 + 1
    let max_order: i64 = db
        .query_row(
            "SELECT COALESCE(MAX(sort_order), 0) FROM workspaces",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    db.execute(
        "INSERT INTO workspaces (name, color, sort_order) VALUES (?1, ?2, ?3)",
        rusqlite::params![name, color, max_order + 1],
    )
    .map_err(|e| e.to_string())?;

    let id = db.last_insert_rowid();

    Ok(Workspace {
        id,
        name,
        color,
        slack_webhook_url: String::new(),
        slack_clock_in_message: "出勤しました".to_string(),
        slack_clock_out_message: "退勤しました".to_string(),
        sort_order: max_order + 1,
    })
}

#[tauri::command]
pub fn update_workspace(
    id: i64,
    name: String,
    color: String,
    slack_webhook_url: String,
    slack_clock_in_message: String,
    slack_clock_out_message: String,
    state: State<AppState>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let affected = db
        .execute(
            "UPDATE workspaces SET name = ?1, color = ?2, slack_webhook_url = ?3, \
             slack_clock_in_message = ?4, slack_clock_out_message = ?5 WHERE id = ?6",
            rusqlite::params![
                name,
                color,
                slack_webhook_url,
                slack_clock_in_message,
                slack_clock_out_message,
                id
            ],
        )
        .map_err(|e| e.to_string())?;

    if affected == 0 {
        return Err("ワークスペースが見つかりません".to_string());
    }

    Ok(())
}

#[tauri::command]
pub fn delete_workspace(id: i64, state: State<AppState>) -> Result<(), String> {
    if id == 1 {
        return Err("デフォルトワークスペースは削除できません".to_string());
    }

    let mut db = state.db.lock().map_err(|e| e.to_string())?;

    let tx = db.transaction().map_err(|e| e.to_string())?;

    // 関連する打刻データをデフォルトワークスペースに移行
    tx.execute(
        "UPDATE stamp_events SET workspace_id = 1 WHERE workspace_id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "DELETE FROM workspaces WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    Ok(())
}
