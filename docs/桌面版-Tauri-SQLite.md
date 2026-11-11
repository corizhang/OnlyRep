# RankBoard 桌面版（Tauri 壳 + SQLite）

> 桌面应用形态：Tauri 2 壳内跑同一份前端产物，config 与模板库落 SQLite（不再受浏览器 5MB 配额限制）。
> 浏览器/单文件 dist 路径完全保留，两条分发线并存。

## 构建与运行

```bash
npm run tauri:dev      # 开发模式（vite dev + 桌面窗口热更新）
npm run tauri:build    # 发布构建：先 npm run build，再 Rust release 编译
```

产物（`src-tauri/target/release/`）：
- `rankboard.exe` — 免安装单文件可执行
- `bundle/nsis/*.exe` — NSIS 安装包（含卸载、开始菜单项）

## 数据落点

| 数据 | 位置 |
|---|---|
| 工作区 config（`rankboard-canvas-v3`） | **SQLite**：`%APPDATA%\com.rankboard.app\rankboard.db`（kv 表） |
| 模板库（`rankboard-canvas-templates-v1`） | 同上（启动时载入内存镜像，写时同步落盘） |
| 导入文件快照（sourceCache） | WebView IndexedDB（大容量，沿用浏览器方案） |
| UI 偏好（入口模式/欢迎标记/节点主题） | WebView localStorage |

备份：直接复制 `rankboard.db` 即可；换机把该文件放回原路径。

## 架构接缝（浏览器零改动）

```
业务代码 → zustand persist → createJSONStorage( isTauri() ? tauriPersistStorage : appStorage )
                                    │ invoke('kv_*')            │ localStorage+内存降级
                                    ▼                            ▼
                        Rust rusqlite (bundled)              浏览器本地存储
```

- 前端检测：`window.__TAURI_INTERNALS__`（`src/storage/tauriKv.ts`）
- 同步消费者（模板库等）经**内存镜像**：启动时 `initTauriMirror` 一次性载入，写时先更内存再异步入库
- 启动序列（CanvasApp）：Tauri 下先 `persist.rehydrate()` + 镜像初始化，再 bootstrap（否则用默认空配置重算，配置换入后结果过期）
- Rust 侧仅 3 个 KV 命令（`kv_get/kv_set/kv_remove`），未来扩展（多模板表、文件快照表）在此结构上生长

## 环境备忘

- Rust 依赖走 `src-tauri/.cargo/config.toml` 的 rsproxy 镜像（crates.io 直连超时）
- 图标为程序生成（蓝底白柱状图）：`src-tauri/icons/`
