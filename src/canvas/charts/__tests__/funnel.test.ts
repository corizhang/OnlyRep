import { describe, expect, it } from 'vitest';
import { buildChartOption, prepareChartData, prepareFunnelScalars } from '../chartTheme';
import type { ChartConfig } from '../../types';
import type { CleanedTable } from '../../../parser/clean';

/** 转化漏斗：展示顺序与转化率预计算（较上层/占首层） */

const palette = {
  text: '#111',
  secondary: '#666',
  accent: '#2563eb',
  grid: '#eee',
  dark: false,
  bg: '#fff',
} as Parameters<typeof buildChartOption>[0]['palette'];

function makeCfg(patch: Partial<ChartConfig>): ChartConfig {
  return {
    title: '',
    chartType: 'funnel',
    table: { nodeRef: 'n1' },
    dimension: '阶段',
    metrics: [{ col: '人数', label: '', color: '' }],
    sortBy: 'value',
    sort: 'desc',
    maxRows: 0,
    showValueLabel: true,
    highlightLast: false,
    horizontal: false,
    height: 300,
    showLegend: false,
    showGrid: false,
    yUnit: '',
    ...patch,
  };
}

const meta = (key: string, type: 'text' | 'number') => ({ key, rawName: key, type, typeConfidence: 1, dirtyCount: 0, sampleValues: [], missingCount: 0, unitHint: '' });
const table: CleanedTable = {
  columns: [meta('阶段', 'text'), meta('人数', 'number')],
  rows: [
    { __idx: 0, 阶段: '进件', 人数: 500 },
    { __idx: 1, 阶段: '触达', 人数: 1000 },
    { __idx: 2, 阶段: '首刷', 人数: 100 },
    { __idx: 3, 阶段: '核卡', 人数: 250 },
  ],
  totalRows: 4,
  excludedCount: 0,
  dirtyCells: {},
};

interface FunnelDatum { name: string; value: number; ofFirst: number; ofPrev: number | null }
function funnelData(cfg: ChartConfig): FunnelDatum[] {
  const prepared = prepareChartData(cfg, table, palette);
  if ('error' in prepared) throw new Error(prepared.error);
  const option = buildChartOption({ cfg, prepared, palette, fontSize: 12 });
  const series = (option.series as { type: string; sort: string; data: FunnelDatum[] }[])[0];
  expect(series.type).toBe('funnel');
  expect(series.sort).toBe('none'); // 数据侧已排好
  return series.data;
}

describe('转化漏斗', () => {
  it('默认降序：按数值从大到小，转化率按展示顺序计算', () => {
    const data = funnelData(makeCfg({}));
    expect(data.map((d) => d.name)).toEqual(['触达', '进件', '核卡', '首刷']);
    expect(data[0].ofFirst).toBe(100);
    expect(data[0].ofPrev).toBeNull();
    expect(data[1].ofPrev).toBeCloseTo(50); // 进件/触达
    expect(data[2].ofPrev).toBeCloseTo(50); // 核卡/进件
    expect(data[3].ofFirst).toBeCloseTo(10); // 首刷占首层
  });

  it('升序：从小到大排列', () => {
    const data = funnelData(makeCfg({ sort: 'asc' }));
    expect(data.map((d) => d.name)).toEqual(['首刷', '核卡', '进件', '触达']);
  });

  it('不排序：保持源行顺序', () => {
    const data = funnelData(makeCfg({ sort: 'none' }));
    expect(data.map((d) => d.name)).toEqual(['进件', '触达', '首刷', '核卡']);
  });

  it('全零数据不除零崩溃', () => {
    const zeroTable: CleanedTable = { columns: table.columns, rows: [{ __idx: 0, 阶段: 'A', 人数: 0 }, { __idx: 1, 阶段: 'B', 人数: 0 }], totalRows: 2, excludedCount: 0, dirtyCells: {} };
    const prepared = prepareChartData(makeCfg({}), zeroTable, palette);
    if ('error' in prepared) throw new Error(prepared.error);
    const option = buildChartOption({ cfg: makeCfg({}), prepared, palette, fontSize: 12 });
    const series = (option.series as { data: FunnelDatum[] }[])[0];
    expect(series.data[0].ofFirst).toBe(0);
    expect(series.data[1].ofPrev).toBeNull(); // prev=0 → null 兜底
  });
});

describe('漏斗·逐层取数（scalars 模式）', () => {
  // 用户真实场景：阶段=表里的列 → 取数节点求和出标量 → 漏斗逐层绑定
  const ctx = {
    outputs: {
      n1: { kind: 'scalar' as const, value: 1931 },
      n2: { kind: 'scalar' as const, value: 331 },
      n3: { kind: 'error' as const, message: '表达式错误' },
    },
    env: {},
    sources: [],
  };

  it('绑定取数节点 + 现场公式手录数字', () => {
    const prepared = prepareFunnelScalars(
      [
        { name: '扫码人数', value: { kind: 'node', nodeRef: 'n1' } },
        { name: '绑卡人数', value: { kind: 'node', nodeRef: 'n2' } },
        { name: '人工补录', value: { kind: 'formula', expr: '120' } },
      ],
      ctx,
    );
    if ('error' in prepared) throw new Error(prepared.error);
    expect(prepared.categories).toEqual(['扫码人数', '绑卡人数', '人工补录']);
    expect(prepared.series[0].data).toEqual([1931, 331, 120]);
  });

  it('保持用户定义顺序（不受数值大小影响）', () => {
    const prepared = prepareFunnelScalars(
      [
        { name: 'B', value: { kind: 'node', nodeRef: 'n2' } }, // 331
        { name: 'A', value: { kind: 'node', nodeRef: 'n1' } }, // 1931（大数在后也保持）
      ],
      ctx,
    );
    if ('error' in prepared) throw new Error(prepared.error);
    expect(prepared.categories).toEqual(['B', 'A']);
    expect(prepared.series[0].data).toEqual([331, 1931]);
  });

  it('空层级 → 引导错误；单层取数失败 → 该层 0 并继续', () => {
    const empty = prepareFunnelScalars([], ctx);
    expect('error' in empty).toBe(true);

    const partial = prepareFunnelScalars(
      [
        { name: '扫码人数', value: { kind: 'node', nodeRef: 'n1' } },
        { name: '坏层', value: { kind: 'node', nodeRef: 'n3' } },
      ],
      ctx,
    );
    if ('error' in partial) throw new Error(partial.error);
    expect(partial.series[0].data).toEqual([1931, 0]);
  });
});
