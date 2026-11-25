/**
 * 启动迁移入口：必须在任何 store（zustand persist 同步读键）之前执行。
 * main.tsx 第一行 `import './storage/keysMigrate'` 保证顺序（ES 模块副作用导入按序执行）。
 */
import { migrateLegacyKeys, K } from './keys';
import { appStorage } from './safeStorage';

migrateLegacyKeys();

/**
 * 配置自愈：AI 早期提示词把 manualTable 数据源的 columns/rows 错放进嵌套 table 字段
 * （真实形状是直接挂在源上）——持久层里已有的错误形状在启动时拍平修复。
 * 覆盖三个存储：当前工作区 persist、项目库、模板库。
 */
export function hoistManualTable(node: unknown, changed: { v: boolean }): void {
  if (Array.isArray(node)) {
    for (const item of node) hoistManualTable(item, changed);
    return;
  }
  if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if (o.kind === 'manualTable' && !Array.isArray(o.rows)) {
      const t = o.table as { columns?: string[]; rows?: unknown[][] } | undefined;
      if (t && Array.isArray(t.columns) && Array.isArray(t.rows)) {
        o.columns = t.columns;
        o.rows = t.rows;
        delete o.table;
        changed.v = true;
      }
    }
    for (const v of Object.values(o)) hoistManualTable(v, changed);
  }
}

export function fixPersistedShape(key: string): void {
  const raw = appStorage.getItem(key);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as unknown;
    const changed = { v: false };
    hoistManualTable(parsed, changed);
    if (changed.v) appStorage.setItem(key, JSON.stringify(parsed));
  } catch {
    /* 非 JSON 内容忽略 */
  }
}

try {
  fixPersistedShape(K.canvasPersist);
  fixPersistedShape(K.projects);
  fixPersistedShape(K.templates);
} catch {
  /* 降级环境忽略 */
}
