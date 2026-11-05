import type { CleanedTable } from '../../parser/clean';
import type { FileFingerprint } from '../types';

/**
 * 导入源本地缓存（PRD R1-增补「数据快照缓存 + 文件句柄记忆」）：
 * - 快照：清洗后的 CleanTable + 文件指纹，存 IndexedDB（容量数百 MB、异步不阻塞）；
 *   localStorage 5MB 限额太小，不采用。
 * - 句柄：File System Access API 的 FileSystemFileHandle（structured clone 原生支持），
 *   刷新后可一键重新读取磁盘上的最新文件（数据不落盘）。
 * - 环境降级：无 indexedDB（如 node 测试）时退化为内存 Map，API 行为一致。
 */

export interface SourceSnapshot {
  fp: FileFingerprint;
  sheetName: string;
  table: CleanedTable;
  sheets: { name: string; rows: number; cols: number }[];
  savedAt: number;
}

// ========== 指纹 ==========

export function fileFingerprint(file: File): FileFingerprint {
  return { name: file.name, size: file.size, lastModified: file.lastModified };
}

export function sameFingerprint(a: FileFingerprint | null | undefined, b: FileFingerprint | null | undefined): boolean {
  if (!a || !b) return false;
  return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
}

// ========== IndexedDB 底层 ==========

const DB_NAME = 'rankboard-cache';
const DB_VERSION = 1;
const SNAPSHOT_STORE = 'snapshots';
const HANDLE_STORE = 'handles';

const memoryFallback = new Map<string, unknown>();

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) db.createObjectStore(SNAPSHOT_STORE);
        if (!db.objectStoreNames.contains(HANDLE_STORE)) db.createObjectStore(HANDLE_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function idbRun<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | null> {
  return openDb().then((db) => {
    if (!db) return null;
    return new Promise<T | null>((resolve) => {
      try {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => resolve((req.result as T) ?? null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  });
}

// ========== 快照 API ==========

export async function saveSourceSnapshot(sourceId: string, snapshot: SourceSnapshot): Promise<void> {
  const ok = await idbRun<void>(SNAPSHOT_STORE, 'readwrite', (s) => s.put(snapshot, sourceId));
  if (ok === null) memoryFallback.set(`snap:${sourceId}`, snapshot);
}

export async function loadSourceSnapshot(sourceId: string): Promise<SourceSnapshot | null> {
  const v = await idbRun<SourceSnapshot>(SNAPSHOT_STORE, 'readonly', (s) => s.get(sourceId));
  if (v) return v;
  const mem = memoryFallback.get(`snap:${sourceId}`);
  return (mem as SourceSnapshot | undefined) ?? null;
}

export async function removeSourceSnapshot(sourceId: string): Promise<void> {
  await idbRun<unknown>(SNAPSHOT_STORE, 'readwrite', (s) => s.delete(sourceId));
  memoryFallback.delete(`snap:${sourceId}`);
}

export async function clearSourceSnapshots(): Promise<void> {
  await idbRun<unknown>(SNAPSHOT_STORE, 'readwrite', (s) => s.clear());
  for (const k of [...memoryFallback.keys()]) {
    if (k.startsWith('snap:')) memoryFallback.delete(k);
  }
}

// ========== 文件句柄 API（File System Access API） ==========

/** 当前环境是否支持 showOpenFilePicker（Chrome/Edge） */
export function supportsFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function';
}

export async function saveFileHandle(sourceId: string, handle: FileSystemFileHandle): Promise<void> {
  const ok = await idbRun<void>(HANDLE_STORE, 'readwrite', (s) => s.put(handle, sourceId));
  if (ok === null) memoryFallback.set(`handle:${sourceId}`, handle);
}

export async function getFileHandle(sourceId: string): Promise<FileSystemFileHandle | null> {
  const v = await idbRun<FileSystemFileHandle>(HANDLE_STORE, 'readonly', (s) => s.get(sourceId));
  if (v) return v;
  const mem = memoryFallback.get(`handle:${sourceId}`);
  return (mem as FileSystemFileHandle | undefined) ?? null;
}

export async function removeFileHandle(sourceId: string): Promise<void> {
  await idbRun<unknown>(HANDLE_STORE, 'readwrite', (s) => s.delete(sourceId));
  memoryFallback.delete(`handle:${sourceId}`);
}

/** 已授权则直接返回 true；未授权时弹浏览器授权框，拒绝则 false */
export async function ensureHandlePermission(handle: FileSystemFileHandle): Promise<boolean> {
  try {
    const h = handle as FileSystemFileHandle & {
      queryPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
      requestPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
    };
    if (h.queryPermission && (await h.queryPermission({ mode: 'read' })) === 'granted') return true;
    if (h.requestPermission && (await h.requestPermission({ mode: 'read' })) === 'granted') return true;
    return false;
  } catch {
    return false;
  }
}
