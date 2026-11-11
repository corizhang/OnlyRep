import { invoke } from '@tauri-apps/api/core';

/**
 * Tauri 桌面壳存储层（SQLite via Rust kv 命令）：
 * - isTauri() 运行时检测（浏览器/file:// 恒 false，零影响）
 * - tauriPersistStorage：zustand persist 用的异步 KV（config 大对象走 SQLite，不再受 5MB 配额限制）
 * - mirrorGet/mirrorSet：给同步消费者（模板库等）的内存镜像，写时先更内存再异步落盘
 */

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** zustand persist 异步存储后端（StateStorage 允许 Promise） */
export const tauriPersistStorage = {
  getItem: async (key: string): Promise<string | null> => invoke<string | null>('kv_get', { key }),
  setItem: async (key: string, value: string): Promise<void> => {
    await invoke('kv_set', { key, value });
  },
  removeItem: async (key: string): Promise<void> => {
    await invoke('kv_remove', { key });
  },
};

// ---- 同步消费者的内存镜像 ----

const mirror = new Map<string, string>();

/** 启动时把指定 key 从 SQLite 载入镜像（仅 Tauri 环境调用一次） */
export async function initTauriMirror(keys: string[]): Promise<void> {
  for (const key of keys) {
    try {
      const v = await tauriPersistStorage.getItem(key);
      if (v !== null) mirror.set(key, v);
    } catch (e) {
      console.error('[tauriKv] 镜像载入失败', key, e);
    }
  }
}

/** 同步读（Tauri 时读镜像；否则调用方应走 appStorage） */
export function mirrorGet(key: string): string | null {
  return mirror.get(key) ?? null;
}

/** 同步写：先更内存，异步入库（失败仅记日志，不影响内存态） */
export function mirrorSet(key: string, value: string): void {
  mirror.set(key, value);
  tauriPersistStorage.setItem(key, value).catch((e) => console.error('[tauriKv] 落盘失败', key, e));
}

export function mirrorRemove(key: string): void {
  mirror.delete(key);
  tauriPersistStorage.removeItem(key).catch((e) => console.error('[tauriKv] 删除失败', key, e));
}
