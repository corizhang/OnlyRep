import { appStorage } from '../storage/safeStorage';
import { initTauriMirror, isTauri, mirrorGet, mirrorSet } from '../storage/tauriKv';
import { newId } from '../canvas/datasource/registry';
import type { CanvasConfig } from '../canvas/types';

/**
 * 项目库持久化（与模板库同级、独立于工作区 persist key）：
 * 项目 = 模板（壳） + 数据。config 存库；数据快照在 IndexedDB 按源 id 保留，
 * 切换项目时由 restoreImportCaches 按 id 命中恢复，无需重复存储。
 * 「存档点 + 切换自动回写」：显式保存写库；切换项目前自动回写当前项目（防丢）。
 */

export interface SavedProject {
  id: string;
  name: string;
  updatedAt: number;
  config: CanvasConfig;
}

export interface ProjectLibraryData {
  activeId: string | null;
  items: SavedProject[];
}

const KEY = 'rankboard-projects-v1';

/** Tauri 环境启动时调用一次：把项目库从 SQLite 载入内存镜像 */
export async function initProjectLibraryStorage(): Promise<void> {
  if (isTauri()) await initTauriMirror([KEY]);
}

export function loadProjectLibrary(): ProjectLibraryData {
  try {
    const raw = isTauri() ? mirrorGet(KEY) : appStorage.getItem(KEY);
    if (!raw) return { activeId: null, items: [] };
    const data = JSON.parse(raw) as ProjectLibraryData;
    if (!Array.isArray(data.items)) return { activeId: null, items: [] };
    return { activeId: data.activeId ?? null, items: data.items };
  } catch {
    return { activeId: null, items: [] };
  }
}

export function saveProjectLibrary(data: ProjectLibraryData): void {
  try {
    if (isTauri()) mirrorSet(KEY, JSON.stringify(data));
    else appStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // 存储失败由 safeStorage 监听器统一提示
  }
}

export function newProjectId(): string {
  return newId('prj');
}

export function genProjectName(items: SavedProject[]): string {
  const base = '未命名项目';
  const names = new Set(items.map((p) => p.name));
  if (!names.has(base)) return base;
  let n = 2;
  while (names.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}
