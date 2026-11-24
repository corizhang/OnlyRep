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

/// 导出文件落盘：base64 解码写入导出目录（WebView 不处理 <a download>，桌面端必须走 Rust）。
/// 目录优先级：设置页自定义（kv 键 rankboard-export-dir）> 系统下载目录/RankBoard。
/// 返回完整路径供前端 toast 展示。
#[tauri::command]
fn export_file(app: tauri::AppHandle, state: State<DbState>, name: String, data_base64: String) -> Result<String, String> {
    let bytes = STANDARD
        .decode(data_base64)
        .map_err(|e| format!("base64 解码失败: {e}"))?;
    // 自定义导出目录（设置页写入的 kv）
    let custom_dir = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT value FROM kv WHERE key IN ('onlyrep-export-dir', 'rankboard-export-dir') ORDER BY CASE key WHEN 'onlyrep-export-dir' THEN 0 ELSE 1 END LIMIT 1")
            .map_err(|e| e.to_string())?;
        let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
        match rows.next().map_err(|e| e.to_string())? {
            Some(row) => row.get::<_, String>(0).ok(),
            None => None,
        }
    };
    let dir = match custom_dir.filter(|d| !d.trim().is_empty()) {
        Some(d) => std::path::PathBuf::from(d),
        None => app.path().download_dir().map_err(|e| e.to_string())?.join("OnlyRep"),
    };
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

/// 保存项目文件（.rkb）到项目目录：kv 键 rankboard-project-dir 自定义，缺省 文档/RankBoard/Projects
#[tauri::command]
fn save_project_file(app: tauri::AppHandle, state: State<DbState>, name: String, data_base64: String) -> Result<String, String> {
    let bytes = STANDARD.decode(data_base64).map_err(|e| format!("base64 解码失败: {e}"))?;
    let custom_dir = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT value FROM kv WHERE key IN ('onlyrep-project-dir', 'rankboard-project-dir') ORDER BY CASE key WHEN 'onlyrep-project-dir' THEN 0 ELSE 1 END LIMIT 1")
            .map_err(|e| e.to_string())?;
        let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
        match rows.next().map_err(|e| e.to_string())? {
            Some(row) => row.get::<_, String>(0).ok(),
            None => None,
        }
    };
    let dir = match custom_dir.filter(|d| !d.trim().is_empty()) {
        Some(d) => std::path::PathBuf::from(d),
        None => app
            .path()
            .document_dir()
            .map_err(|e| e.to_string())?
            .join("OnlyRep")
            .join("Projects"),
    };
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    // 文件名清洗（Windows 非法字符）
    let safe: String = name
        .chars()
        .map(|c| match c {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect();
    let path = dir.join(format!("{}.rkb", safe));
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

/// 在资源管理器中打开导出文件所在文件夹并选中该文件（Windows 桌面版）
#[tauri::command]
fn open_export_folder(path: String) -> Result<(), String> {
    std::process::Command::new("explorer")
        .arg("/select,")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            // 更名迁移（rankboard→onlyrep）：新库不存在且旧数据目录有库 → 整体拷贝过来
            let db_path = dir.join("onlyrep.db");
            if !db_path.exists() {
                if let Ok(appdata) = std::env::var("APPDATA") {
                    let legacy_db = std::path::PathBuf::from(appdata).join("com.rankboard.app").join("rankboard.db");
                    if legacy_db.exists() {
                        let _ = std::fs::create_dir_all(&dir);
                        if let Err(e) = std::fs::copy(&legacy_db, &db_path) {
                            eprintln!("[migrate] 旧数据库拷贝失败: {e}");
                        }
                    }
                }
            }
            let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
            conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL); PRAGMA journal_mode = WAL;",
            )
            .map_err(|e| e.to_string())?;
            // kv 键更名迁移（幂等：新键不存在才拷贝，旧行保留可回滚）
            let _ = conn.execute_batch(
                "INSERT OR IGNORE INTO kv (key, value) SELECT 'onlyrep-export-dir', value FROM kv WHERE key = 'rankboard-export-dir';
                 INSERT OR IGNORE INTO kv (key, value) SELECT 'onlyrep-project-dir', value FROM kv WHERE key = 'rankboard-project-dir';"
            );
            app.manage(DbState(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![kv_get, kv_set, kv_remove, export_file, open_export_folder, save_project_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
