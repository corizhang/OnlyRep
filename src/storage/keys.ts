import { appStorage } from './safeStorage';

/**
 * 存储键单一事实来源（更名 OnlyRep 后统一）。
 * 老键（rankboard-*）由 migrateLegacyKeys 在启动时自动拷贝到新键（幂等、旧值保留可回滚）。
 * 注意：迁移必须在 zustand persist 读取之前执行（main.tsx 顶部 side-effect 导入本模块即可）。
 */

/** 键名映射：老 → 新（kv（Tauri SQLite）与 localStorage 通用） */
export const KEY_MIGRATIONS: Record<string, string> = {
  'rankboard:entry-mode': 'onlyrep:entry-mode',
  'rankboard-canvas-v3': 'onlyrep-canvas-v3',
  'rankboard-canvas-templates-v1': 'onlyrep-canvas-templates-v1',
  'rankboard-projects-v1': 'onlyrep-projects-v1',
  'rankboard-skip-launcher': 'onlyrep-skip-launcher',
  'rankboard-project-pins': 'onlyrep-project-pins',
  'rankboard-project-dir': 'onlyrep-project-dir',
  'rankboard-export-dir': 'onlyrep-export-dir',
  'rankboard-onboarded-v1': 'onlyrep-onboarded-v1',
  'rankboard-ui-theme': 'onlyrep-ui-theme',
  'rankboard:config:v1': 'onlyrep:config:v1',
};

/** 带序号前缀的键（自动备份 rankboard-canvas-backup-v1..3） */
const PREFIX_MIGRATIONS: [string, string][] = [['rankboard-canvas-backup-v', 'onlyrep-canvas-backup-v']];

/** 启动时迁移：老键有值且新键为空 → 拷贝（旧键保留，出问题可人工回滚） */
export function migrateLegacyKeys(): void {
  try {
    for (const [oldKey, newKey] of Object.entries(KEY_MIGRATIONS)) {
      const oldVal = appStorage.getItem(oldKey);
      if (oldVal != null && appStorage.getItem(newKey) == null) {
        appStorage.setItem(newKey, oldVal);
      }
    }
    // 自动备份键迁移（序号固定 1..3，显式枚举——不依赖 localStorage 枚举能力，降级环境兼容）
    for (const [oldPrefix, newPrefix] of PREFIX_MIGRATIONS) {
      for (let v = 1; v <= 3; v += 1) {
        const oldKey = `${oldPrefix}${v}`;
        const newKey = `${newPrefix}${v}`;
        const oldVal = appStorage.getItem(oldKey);
        if (oldVal != null && appStorage.getItem(newKey) == null) appStorage.setItem(newKey, oldVal);
      }
    }
  } catch {
    // 存储降级环境：跳过迁移（内存态本就会重建）
  }
}

// ---- 新键常量（各处引用从这里取） ----
export const K = {
  entryMode: 'onlyrep:entry-mode',
  canvasPersist: 'onlyrep-canvas-v3',
  templates: 'onlyrep-canvas-templates-v1',
  projects: 'onlyrep-projects-v1',
  skipLauncher: 'onlyrep-skip-launcher',
  projectPins: 'onlyrep-project-pins',
  projectDir: 'onlyrep-project-dir',
  exportDir: 'onlyrep-export-dir',
  onboarded: 'onlyrep-onboarded-v1',
  uiTheme: 'onlyrep-ui-theme',
  rankConfig: 'onlyrep:config:v1',
  canvasBackupPrefix: 'onlyrep-canvas-backup-v',
} as const;
