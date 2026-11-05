import { describe, expect, it } from 'vitest';
import { runPipeline, clearPipelineCache } from '../pipeline';
import type { CleanedTable } from '../../parser/clean';
import { createDefaultConfig } from '../../constants/defaults';
import type { ColumnMeta } from '../../types';

function meta(key: string, type: ColumnMeta['type']): ColumnMeta {
  return { key, rawName: key, type, typeConfidence: 1, dirtyCount: 0, missingCount: 0, unitHint: '' };
}

const cleaned: CleanedTable = {
  rows: [
    { __idx: 1, '姓名': '张三', '网点': 'A店', '业绩': 100 },
    { __idx: 2, '姓名': '李四', '网点': 'B店', '业绩': 200 },
  ],
  columns: [meta('姓名', 'text'), meta('网点', 'text'), meta('业绩', 'number')],
  totalRows: 2,
  excludedCount: 0,
  dirtyCells: { '姓名': [], '网点': [], '业绩': [] },
};

describe('pipeline 字段回退（R3-04 修复回归）', () => {
  it('nameKey 为空时，直接排序行名回退到第一个文本列', () => {
    clearPipelineCache();
    const cfg = { ...createDefaultConfig(), metricKey: '业绩', nameKey: '' };
    const board = runPipeline(cleaned, cfg);
    expect(board.rows.map((r) => r.name)).toEqual(['李四', '张三']); // desc：200 在前
  });

  it('分组模式未选维度列时，groupKey 回退到第一个文本列（不按空串合成一组）', () => {
    clearPipelineCache();
    const cfg = {
      ...createDefaultConfig(),
      mode: 'grouped' as const,
      metricKey: '业绩',
      nameKey: '',
      dimensionKey: '',
      aggMethod: 'sum' as const,
    };
    const board = runPipeline(cleaned, cfg);
    expect(board.rows).toHaveLength(2); // 若按 '' 分组会是 1 组
    expect(board.rows.map((r) => r.name)).toEqual(['李四', '张三']);
    expect(board.rows.map((r) => r.rawValue)).toEqual([200, 100]);
  });
});
