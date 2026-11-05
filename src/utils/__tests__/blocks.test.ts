import { describe, expect, it } from 'vitest';
import {
  chunkRows,
  clampNum,
  createRankListBlockConfig,
  expandTableCols,
  getPosterTitle,
  newBlockId,
  normalizeWeights,
  splitTwoColumn,
} from '../blocks';
import { createDefaultConfig } from '../../constants/defaults';
import type { RankListBlockConfig, RankRow, TableColId } from '../../types';

function makeRows(n: number): RankRow[] {
  return Array.from({ length: n }, (_, i) => ({
    rank: i + 1,
    displayRank: i + 1,
    name: `成员${i + 1}`,
    secondary: [],
    value: 100 - i,
    rawValue: 100 - i,
    delta: null,
    ratio: 1,
    isOthers: false,
    sampleCount: 1,
  }));
}

describe('chunkRows（分页切片，paged 变体）', () => {
  it('7 行每页 3 条 → [3,3,1]', () => {
    const pages = chunkRows([1, 2, 3, 4, 5, 6, 7], 3);
    expect(pages).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
  });

  it('整除时页数正好', () => {
    expect(chunkRows([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });

  it('size 大于数组长度 → 单页', () => {
    expect(chunkRows([1, 2], 10)).toEqual([[1, 2]]);
  });

  it('空数组 → 无页', () => {
    expect(chunkRows([], 5)).toEqual([]);
  });

  it('非法 size（0/负数/NaN）回退为每页 1 条', () => {
    expect(chunkRows([1, 2, 3], 0)).toEqual([[1], [2], [3]]);
    expect(chunkRows([1, 2, 3], -2)).toEqual([[1], [2], [3]]);
    expect(chunkRows([1, 2, 3], Number.NaN)).toEqual([[1], [2], [3]]);
  });
});

describe('splitTwoColumn（双列切分，twoColumn 变体）', () => {
  it('偶数行 10 → 左右各 5', () => {
    const [left, right] = splitTwoColumn(makeRows(10));
    expect(left).toHaveLength(5);
    expect(right).toHaveLength(5);
    expect(left[0].name).toBe('成员1');
    expect(right[0].name).toBe('成员6');
  });

  it('奇数行 5 → 左 3 右 2（左列先填满）', () => {
    const [left, right] = splitTwoColumn(makeRows(5));
    expect(left).toHaveLength(3);
    expect(right).toHaveLength(2);
  });

  it('空数组 → 双空列', () => {
    expect(splitTwoColumn([])).toEqual([[], []]);
  });
});

describe('getPosterTitle（从区块提取标题）', () => {
  it('取第一个 role=title 文本块内容', () => {
    const config = createDefaultConfig();
    expect(getPosterTitle(config)).toBe('排行榜');
  });

  it('无标题块时返回空串', () => {
    const config = createDefaultConfig();
    config.blocks = config.blocks.filter((b) => b.type !== 'text');
    expect(getPosterTitle(config)).toBe('');
  });
});

describe('newBlockId / clampNum', () => {
  it('id 进程内唯一', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newBlockId()));
    expect(ids.size).toBe(200);
  });

  it('clampNum 夹取范围并回退 NaN', () => {
    expect(clampNum(5, 0, 10, 1)).toBe(5);
    expect(clampNum(-1, 0, 10, 1)).toBe(0);
    expect(clampNum(99, 0, 10, 1)).toBe(10);
    expect(clampNum(Number.NaN, 0, 10, 7)).toBe(7);
  });
});

describe('normalizeWeights（表格列宽归一化，总和 100 保留 1 位小数）', () => {
  it('正常归一化：权重比例映射为百分比', () => {
    expect(normalizeWeights({ rank: 1, name: 3 }, ['rank', 'name'])).toEqual([25, 75]);
    expect(normalizeWeights({ rank: 2, name: 2, value: 6 }, ['rank', 'name', 'value'])).toEqual([
      20, 20, 60,
    ]);
  });

  it('缺省权重按 1 计', () => {
    expect(normalizeWeights({ name: 3 }, ['rank', 'name', 'value'])).toEqual([20, 60, 20]);
  });

  it('全缺省均分', () => {
    expect(normalizeWeights({}, ['rank', 'name', 'secondary', 'value'])).toEqual([25, 25, 25, 25]);
  });

  it('非法值钳制：NaN/0/负数 → 1，超出上界 → 10', () => {
    expect(
      normalizeWeights(
        { rank: Number.NaN, name: 0, secondary: -5, value: 99 },
        ['rank', 'name', 'secondary', 'value'],
      ),
    ).toEqual([7.7, 7.7, 7.7, 76.9]);
  });

  it('舍入误差补偿到最大权重列，总和严格 100', () => {
    const pcts = normalizeWeights({}, ['rank', 'name', 'value']);
    expect(pcts).toEqual([33.4, 33.3, 33.3]);
    expect(Math.round(pcts.reduce((a, b) => a + b, 0) * 10) / 10).toBe(100);
  });

  it('任意输入总和恒为 100（保留 1 位小数精度）', () => {
    for (const weights of [
      { rank: 1, name: 2, secondary: 3, value: 4 },
      { rank: 10, name: 1 },
      { value: 7 },
    ]) {
      const ids: TableColId[] = ['rank', 'name', 'secondary', 'value'];
      const pcts = normalizeWeights(weights, ids);
      expect(Math.round(pcts.reduce((a, b) => a + b, 0) * 10) / 10).toBe(100);
    }
  });

  it('空列返回空数组', () => {
    expect(normalizeWeights({ rank: 5 }, [])).toEqual([]);
  });
});

describe('expandTableCols（表格列展开次要字段列）', () => {
  it('默认三列不含 secondary → 不展开', () => {
    expect(expandTableCols(['rank', 'name', 'value'], 2)).toEqual([
      { id: 'rank', secIndex: -1 },
      { id: 'name', secIndex: -1 },
      { id: 'value', secIndex: -1 },
    ]);
  });

  it("secondary 按次要字段数展开（secIndex 0..n-1），位置由 columns 决定", () => {
    expect(expandTableCols(['rank', 'secondary', 'value'], 2)).toEqual([
      { id: 'rank', secIndex: -1 },
      { id: 'secondary', secIndex: 0 },
      { id: 'secondary', secIndex: 1 },
      { id: 'value', secIndex: -1 },
    ]);
  });

  it('0 个次要字段时 secondary 展开为 0 列', () => {
    expect(expandTableCols(['rank', 'secondary', 'name'], 0)).toEqual([
      { id: 'rank', secIndex: -1 },
      { id: 'name', secIndex: -1 },
    ]);
  });

  it('重复列去重（保留首次出现顺序）', () => {
    expect(expandTableCols(['rank', 'rank', 'name'], 1)).toEqual([
      { id: 'rank', secIndex: -1 },
      { id: 'name', secIndex: -1 },
    ]);
  });

  it('未知列 id 过滤；空输入返回空', () => {
    expect(expandTableCols(['bogus' as TableColId], 1)).toEqual([]);
    expect(expandTableCols([], 1)).toEqual([]);
  });
});

describe('createRankListBlockConfig（榜单块默认配置工厂）', () => {
  it('默认值 = P0 之前的旧行为', () => {
    const c = createRankListBlockConfig('long', 10);
    expect(c.rowStyle).toBe('card');
    expect(c.badgeShape).toBe('circle');
    expect(c.top1Icon).toBe('auto');
    expect(c.progressBar).toEqual({ show: true, color: 'accent' });
    expect(c.table).toEqual({
      columns: ['rank', 'name', 'value'],
      colWidthMode: 'auto',
      colWeights: {},
      aligns: {},
      header: { show: true, bold: true, bg: 'theme' },
    });
  });

  it('overrides 覆盖指定字段，其余保持默认', () => {
    const c = createRankListBlockConfig('table', 10, {
      rowStyle: 'minimal',
      progressBar: { show: false, color: 'tier' },
    });
    expect(c.rowStyle).toBe('minimal');
    expect(c.badgeShape).toBe('circle');
    expect(c.progressBar).toEqual({ show: false, color: 'tier' });
  });
});

describe('sanitizeRankListBlockConfig（榜单块 P0 字段清洗）', () => {
  it('旧结构（仅 variant/pageSize）补齐全部默认值（旧行为不变）', () => {
    const c = createDefaultConfig();
    const rl = c.blocks.find((b) => b.type === 'rankList');
    expect(rl).toBeTruthy();
    const cfg = rl!.config as RankListBlockConfig;
    expect(cfg.rowStyle).toBe('card');
    expect(cfg.table.columns).toEqual(['rank', 'name', 'value']);
  });
});
