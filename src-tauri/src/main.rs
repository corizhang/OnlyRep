// 桌面壳：窗口内跑前端单文件产物；config/模板库经 KV 命令落到 SQLite（app_data_dir/rankboard.db）
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose::STANDARD, Engine as _};
use rusqlite::{params, Connection};
use std::sync::Mutex;
use tauri::{Manager, State};

struct DbState(Mutex<Connection>);

#[tauri::command]
fn kv_get(state: State<DbState>, key: String) -> Result<Option<String>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT value FROM kv WHERE key = ?1")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query(params![key]).map_err(|e| e.to_string())?;
    match rows.next().map_err(|e| e.to_string())? {
        Some(row) => Ok(Some(row.get(0).map_err(|e| e.to_string())?)),
        None => Ok(None),
    }
}

#[tauri::command]
fn kv_set(state: State<DbState>, key: String, value: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO kv(key, value) VALUES(?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn kv_remove(state: State<DbState>, key: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM kv WHERE key = ?1", params![key])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 导出文件落盘：base64 解码写入系统下载目录（WebView 不处理 <a download>，桌面端必须走 Rust）。
/// 返回完整路径供前端 toast 展示。
#[tauri::command]
fn export_file(app: tauri::AppHandle, name: String, data_base64: String) -> Result<String, String> {
    let bytes = STANDARD
        .decode(data_base64)
        .map_err(|e| format!("base64 解码失败: {e}"))?;
    let dir = app
        .path()
        .download_dir()
        .map_err(|e| e.to_string())?
        .join("RankBoard");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    // 同名不覆盖：追加序号
    let mut path = dir.join(&name);
    let stem = std::path::Path::new(&name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("export")
        .to_string();
    let ext = std::path::Path::new(&name)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();
    let mut i = 1;
    while path.exists() {
        let fname = if ext.is_empty() {
            format!("{stem} ({i})")
        } else {
            format!("{stem} ({i}).{ext}")
        };
        path = dir.join(fname);
        i += 1;
    }
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            let conn = Connection::open(dir.join("rankboard.db")).map_err(|e| e.to_string())?;
            conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL); PRAGMA journal_mode = WAL;",
            )
            .map_err(|e| e.to_string())?;
            app.manage(DbState(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![kv_get, kv_set, kv_remove, export_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
