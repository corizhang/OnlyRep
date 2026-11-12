import { describe, expect, it } from 'vitest';
import { buildChartOption, prepareChartData } from '../chartTheme';
import type { ChartConfig } from '../../types';
import type { CleanedTable } from '../../../engine/clean';

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

const table: CleanedTable = {
  columns: [
    { key: '阶段', label: '阶段', kind: 'text' },
    { key: '人数', label: '人数', kind: 'number' },
  ],
  rows: [
    { 阶段: '进件', 人数: 500 },
    { 阶段: '触达', 人数: 1000 },
    { 阶段: '首刷', 人数: 100 },
    { 阶段: '核卡', 人数: 250 },
  ],
};

interface FunnelDatum { name: string; value: number; ofFirst: number; ofPrev: number | null }
function funnelData(cfg: ChartConfig): FunnelDatum[] {
  const prepared = prepareChartData(cfg, table, palette);
  if ('error' in prepared) throw new Error(prepared.error);
  const option = buildChartOption({ cfg, prepared, palette, fontSize: 12 });
  const series = (option.series as { type: string; data: FunnelDatum[] }[])[0];
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
    const zeroTable: CleanedTable = { columns: table.columns, rows: [{ 阶段: 'A', 人数: 0 }, { 阶段: 'B', 人数: 0 }] };
    const prepared = prepareChartData(makeCfg({}), zeroTable, palette);
    if ('error' in prepared) throw new Error(prepared.error);
    const option = buildChartOption({ cfg: makeCfg({}), prepared, palette, fontSize: 12 });
    const series = (option.series as { data: FunnelDatum[] }[])[0];
    expect(series.data[0].ofFirst).toBe(0);
    expect(series.data[1].ofPrev).toBeNull(); // prev=0 → null 兜底
  });
});
