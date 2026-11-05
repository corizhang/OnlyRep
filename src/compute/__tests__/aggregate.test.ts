import { describe, expect, it } from 'vitest';
import { aggregate, applyFilters } from '../aggregate';
import type { CleanRow } from '../../parser/clean';
import { createDefaultConfig } from '../../constants/defaults';
import type { RankConfig } from '../../types';

const rows: CleanRow[] = [
  { __idx: 1, '网点': 'A店', '业绩': 100, '姓名': '甲' },
  { __idx: 2, '网点': 'A店', '业绩': 250, '姓名': '乙' },
  { __idx: 3, '网点': 'B店', '业绩': 300, '姓名': '丙' },
  { __idx: 4, '网点': 'B店', '业绩': null, '姓名': '丁' },
  { __idx: 5, '网点': 'C店', '业绩': null, '姓名': '戊' },
];

describe('aggregate 分组聚合（R2-04 / 验收标准 3）', () => {
  it('按网点求和 = 手工期望值（A店 100+250=350，B店 300，C店 全缺失 → null）', () => {
    const m = aggregate(rows, '网点', '业绩', 'sum');
    expect(m.get('A店')?.value).toBe(350);
    expect(m.get('B店')?.value).toBe(300);
    expect(m.get('C店')?.value).toBeNull();
    expect(m.get('A店')?.samples).toBe(2);
  });

  it('avg / max / min / count / countDistinct 六种聚合', () => {
    expect(aggregate(rows, '网点', '业绩', 'avg').get('A店')?.value).toBeCloseTo(175, 6);
    expect(aggregate(rows, '网点', '业绩', 'max').get('A店')?.value).toBe(250);
    expect(aggregate(rows, '网点', '业绩', 'min').get('A店')?.value).toBe(100);
    expect(aggregate(rows, '网点', '业绩', 'count').get('A店')?.value).toBe(2);
    expect(aggregate(rows, '网点', '业绩', 'countDistinct').get('A店')?.value).toBe(2);
  });

  it('count 对缺失行也计数（count → 组内全部样本）', () => {
    expect(aggregate(rows, '网点', '业绩', 'count').get('C店')?.value).toBe(1);
  });
});

describe('applyFilters 过滤（R2-06）', () => {
  it('最少样本数 + 最小值阈值', () => {
    const cfg: RankConfig = {
      ...createDefaultConfig(),
      filters: { minSamples: 2, minValue: 360 },
    };
    const entries = [...aggregate(rows, '网点', '业绩', 'sum').values()];
    const { kept, excluded } = applyFilters(entries, cfg, { applyMinSamples: true });
    expect(kept).toHaveLength(0);
    expect(excluded).toBe(3);
  });

  it('minValue=null 时不启用阈值', () => {
    const cfg: RankConfig = {
      ...createDefaultConfig(),
      filters: { minSamples: 1, minValue: null },
    };
    const entries = [...aggregate(rows, '网点', '业绩', 'sum').values()];
    const { kept, excluded } = applyFilters(entries, cfg, { applyMinSamples: true });
    expect(kept).toHaveLength(2); // A店 / B店（C店 null 不进榜）
    expect(excluded).toBe(1);
  });
});
