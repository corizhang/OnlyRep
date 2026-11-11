/**
 * 应用持久化的唯一入口。
 *
 * 背景：Chrome/Edge 在 file:// 下访问 localStorage 会抛 SecurityError（隐私模式、
 * 禁用站点数据同理）。顶层裸调用会直接白屏；zustand persist 虽自带降级，但每次
 * 写入都会刷一串 "storage is currently unavailable"。这里统一做「探测 + 内存降级」，
 * 保证任何环境下都不会抛错。
 *
 * SQLite / Tauri 接缝：后续套 Tauri 壳做本地应用时，SQLite 应放在 Rust 原生层
 * （tauri-plugin-sql），由前端经 IPC 访问，而不是在浏览器里跑 WASM。届时只需把
 * createSafeStorage 的入参换成 Tauri 侧实现（同一组 getItem/setItem/removeItem；
 * zustand 的 StateStorage 允许返回 Promise，异步后端可直接接入），两个 store 和
 * 业务代码都不用改。纯浏览器阶段不引入 SQLite：单文件产物会白白增大，且数据最终
 * 仍要落 IndexedDB/OPFS，与现有 sourceCache 能力重复。
 */

export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 存储异常类型：unavailable=环境禁用（file://隐私模式等）；quota=配额写满；unknown=其他写失败 */
export type StorageErrorKind = 'unavailable' | 'quota' | 'unknown';

export interface StorageErrorInfo {
  kind: StorageErrorKind;
  key: string;
  message: string;
}

type StorageErrorListener = (e: StorageErrorInfo) => void;

const listeners = new Set<StorageErrorListener>();

/** 订阅存储写失败事件（用于「降级到内存」时提示用户导出备份，而非静默丢数据） */
export function onStorageError(cb: StorageErrorListener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function emitError(e: StorageErrorInfo): void {
  for (const cb of listeners) {
    try {
      cb(e);
    } catch {
      // 监听器异常不影响存储本身
    }
  }
}

function classifyError(err: unknown): StorageErrorKind {
  const e = err as { name?: string; code?: number } | null;
  if (e?.name === 'QuotaExceededError' || e?.code === 22 || e?.name === 'NS_ERROR_DOM_QUOTA_REACHED') return 'quota';
  return 'unknown';
}

/** 探测可用性：有的环境读属性不抛、真正读写才抛，必须实写一次 */
function detectNative(): Storage | null {
  try {
    const s = globalThis.localStorage;
    const probe = '__rankboard_storage_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

/**
 * native 为主、内存为影子副本：任何一次 native 抛错都只影响当次调用，
 * 绝不会冒泡到业务层；内存副本始终保留，降级后本次会话数据仍可读写。
 */
export function createSafeStorage(
  getNative: () => Storage | null = detectNative,
): StorageBackend {
  const memory = new Map<string, string | null>();
  let native: Storage | null = null;
  try {
    native = getNative();
  } catch {
    native = null;
  }
  // 每次写失败都上报：早期失败（如 persist 初始化写入）不得因节流被吞掉；
  // 消费方（store 监听器）用「消息相同则不重复 set」来防循环与刷屏。
  const report = (kind: StorageErrorKind, key: string, message: string): void => {
    emitError({ kind, key, message });
  };

  return {
    getItem(key) {
      if (memory.has(key)) return memory.get(key) ?? null;
      if (!native) return null;
      try {
        return native.getItem(key);
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      memory.set(key, value);
      if (!native) {
        report('unavailable', key, 'native storage unavailable');
        return;
      }
      try {
        native.setItem(key, value);
      } catch (err) {
        // 配额超限 / 权限被回收：后续写入只进内存；上报以便 UI 提示导出备份
        report(classifyError(err), key, String((err as { message?: string } | null)?.message ?? err));
      }
    },
    removeItem(key) {
      memory.set(key, null); // 墓碑：避免降级后 getItem 又读回 native 的旧值
      if (!native) return;
      try {
        native.removeItem(key);
      } catch {
        // ignore
      }
    },
  };
}

export const appStorage = createSafeStorage();
