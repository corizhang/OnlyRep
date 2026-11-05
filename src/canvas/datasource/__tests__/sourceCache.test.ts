import { describe, expect, it } from 'vitest';
import {
  clearSourceSnapshots,
  fileFingerprint,
  getFileHandle,
  loadSourceSnapshot,
  removeFileHandle,
  removeSourceSnapshot,
  sameFingerprint,
  saveFileHandle,
  saveSourceSnapshot,
} from '../sourceCache';
import type { SourceSnapshot } from '../sourceCache';

function fakeSnap(fp: { name: string; size: number; lastModified: number }): SourceSnapshot {
  return {
    fp,
    sheetName: '',
    table: { rows: [], columns: [], totalRows: 0, excludedCount: 0, dirtyCells: {} } as SourceSnapshot['table'],
    sheets: [],
    savedAt: 1700000000000,
  };
}

describe('fileFingerprint / sameFingerprint', () => {
  it('指纹三要素一致才算同一文件', () => {
    const a = { name: '看板.xlsx', size: 1024, lastModified: 1700000000000 };
    const b = { name: '看板.xlsx', size: 1024, lastModified: 1700000000000 };
    const c = { name: '看板.xlsx', size: 2048, lastModified: 1700000000000 };
    expect(sameFingerprint(a, b)).toBe(true);
    expect(sameFingerprint(a, c)).toBe(false);
    expect(sameFingerprint(a, null)).toBe(false);
    expect(sameFingerprint(null, null)).toBe(false);
  });

  it('fileFingerprint 从 File 提取三要素', () => {
    const f = new File(['x'.repeat(5)], '日报.xlsx');
    Object.defineProperty(f, 'lastModified', { value: 123 });
    const fp = fileFingerprint(f);
    expect(fp).toEqual({ name: '日报.xlsx', size: 5, lastModified: 123 });
  });
});

describe('sourceCache 快照存取（node 环境走内存后备，API 行为与 IDB 一致）', () => {
  it('save → load 往返', async () => {
    await clearSourceSnapshots();
    const snap = fakeSnap({ name: 'a.xlsx', size: 1, lastModified: 1 });
    await saveSourceSnapshot('ds_1', snap);
    const got = await loadSourceSnapshot('ds_1');
    expect(got?.fp.name).toBe('a.xlsx');
    expect(got?.savedAt).toBe(1700000000000);
  });

  it('未命中返回 null', async () => {
    await clearSourceSnapshots();
    expect(await loadSourceSnapshot('ds_none')).toBeNull();
  });

  it('remove 后返回 null', async () => {
    await saveSourceSnapshot('ds_2', fakeSnap({ name: 'b.xlsx', size: 2, lastModified: 2 }));
    await removeSourceSnapshot('ds_2');
    expect(await loadSourceSnapshot('ds_2')).toBeNull();
  });

  it('clear 清空全部', async () => {
    await saveSourceSnapshot('ds_3', fakeSnap({ name: 'c.xlsx', size: 3, lastModified: 3 }));
    await saveSourceSnapshot('ds_4', fakeSnap({ name: 'd.xlsx', size: 4, lastModified: 4 }));
    await clearSourceSnapshots();
    expect(await loadSourceSnapshot('ds_3')).toBeNull();
    expect(await loadSourceSnapshot('ds_4')).toBeNull();
  });
});

describe('sourceCache 文件句柄存取', () => {
  it('save → get → remove', async () => {
    const fakeHandle = { kind: 'file', name: 'a.xlsx' } as unknown as FileSystemFileHandle;
    await saveFileHandle('ds_9', fakeHandle);
    expect(await getFileHandle('ds_9')).not.toBeNull();
    await removeFileHandle('ds_9');
    expect(await getFileHandle('ds_9')).toBeNull();
  });

  it('未存过返回 null', async () => {
    expect(await getFileHandle('ds_none')).toBeNull();
  });
});
