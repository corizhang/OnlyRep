import { describe, expect, it } from 'vitest';
import { createSafeStorage, onStorageError, type StorageErrorInfo } from '../safeStorage';

function failingStorage(err: Error): Storage {
  return {
    getItem: () => null,
    setItem: () => {
      throw err;
    },
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    length: 0,
  };
}

describe('safeStorage 写失败通知', () => {
  it('配额错误 → 上报 quota（每次失败都报，防早期失败被节流吞掉）', () => {
    const err = new Error('full');
    err.name = 'QuotaExceededError';
    const s = createSafeStorage(() => failingStorage(err));
    const seen: StorageErrorInfo[] = [];
    const off = onStorageError((e) => seen.push(e));
    s.setItem('k1', 'v1');
    s.setItem('k2', 'v2');
    off();
    expect(seen.map((e) => e.kind)).toEqual(['quota', 'quota']);
    expect(s.getItem('k1')).toBe('v1');
  });

  it('环境禁用（native 不可用）→ 写入时上报 unavailable', () => {
    const s = createSafeStorage(() => null);
    const seen: StorageErrorInfo[] = [];
    const off = onStorageError((e) => seen.push(e));
    s.setItem('k', 'v');
    off();
    expect(seen.map((e) => e.kind)).toEqual(['unavailable']);
    expect(s.getItem('k')).toBe('v');
  });
});
