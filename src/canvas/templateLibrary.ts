import { appStorage } from '../storage/safeStorage';
import { newId } from '../canvas/datasource/registry';
import type { CanvasConfig } from '../canvas/types';

/**
 * 模板库持久化（独立于工作区 persist key）：
 * 「存档点」模式——保存时才把工作区写进库，之后继续编辑不回写（类似手动保存的草稿），
 * 切换模板覆盖工作区前由 UI 层做脏检查提醒。
 */

export interface SavedTemplate {
  id: string;
  name: string;
  updatedAt: number;
  config: CanvasConfig;
}

export interface TemplateLibraryData {
  activeId: string | null;
  items: SavedTemplate[];
}

const KEY = 'rankboard-canvas-templates-v1';

export function loadTemplateLibrary(): TemplateLibraryData {
  try {
    const raw = appStorage.getItem(KEY);
    if (!raw) return { activeId: null, items: [] };
    const data = JSON.parse(raw) as TemplateLibraryData;
    if (!Array.isArray(data.items)) return { activeId: null, items: [] };
    return { activeId: data.activeId ?? null, items: data.items };
  } catch {
    return { activeId: null, items: [] };
  }
}

export function saveTemplateLibrary(data: TemplateLibraryData): void {
  try {
    appStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // 存储失败由 safeStorage 监听器统一提示
  }
}

/** 生成不重复的默认名：未命名模板 N */
export function genTemplateName(items: SavedTemplate[]): string {
  let n = items.length + 1;
  const names = new Set(items.map((t) => t.name));
  while (names.has(`未命名模板 ${n}`)) n += 1;
  return `未命名模板 ${n}`;
}

/** 新建模板 id */
export function newTemplateId(): string {
  return newId('tpl');
}

/** 模板摘要（列表副标题用） */
export function templateSummary(t: SavedTemplate): string {
  const nodes = t.config.pipeline?.nodes?.length ?? 0;
  const blocks = t.config.blocks?.length ?? 0;
  return `${nodes} 节点 · ${blocks} 区块`;
}
