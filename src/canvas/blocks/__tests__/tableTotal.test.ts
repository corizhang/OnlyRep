import { describe, expect, it } from 'vitest';
import type { CleanRow } from '../../../parser/clean';
import { buildTotalRow, totalNumberOf } from '../tableTotal';
import type { TableColumnConfig } from '../../types';

function row(values: Record<string, string | number>): CleanRow {
  return { __idx: 0, ...values };
}

function col(overrides: Partial<TableColumnConfig> & { col: string }): TableColumnConfig {
  return { label: overrides.col, align: 'right', format: 'number', decimals: 'auto', ...overrides };
}

describe('buildTotalRow 合计行聚合（R4-06 增补）', () => {
  const rows = [
    row({ 日期: '10-28', 新增绑卡: 1200, 转化率: '10%', 触达: 10000, 到店: 1000 }),
    row({ 日期: '10-29', 新增绑卡: 800, 转化率: '20%', 触达: 20000, 到店: 4000 }),
    row({ 日期: '10-30', 新增绑卡: 1000, 转化率: '30%', 触达: 30000, 到店: 6000 }),
  ];

  it('number 列 auto → 求和', () => {
    const out = buildTotalRow([col({ col: '新增绑卡' })], rows, '合计');
    expect(out).toEqual(['3,000']);
  });

  it('percent 列 auto → 平均（修复机械相加 bug）', () => {
    const out = buildTotalRow([col({ col: '转化率', format: 'percent' })], rows, '合计');
    // (10 + 20 + 30) / 3 = 20
    expect(out).toEqual(['20.0%']);
  });

  it('percent 列显式 sum → 求和', () => {
    const out = buildTotalRow([col({ col: '转化率', format: 'percent', totalAgg: 'sum' })], rows, '合计');
    expect(out).toEqual(['60.0%']);
  });

  it('percent 列 avg/max/min', () => {
    expect(buildTotalRow([col({ col: '转化率', format: 'percent', totalAgg: 'avg' })], rows, '合计')).toEqual(['20.0%']);
    expect(buildTotalRow([col({ col: '转化率', format: 'percent', totalAgg: 'max' })], rows, '合计')).toEqual(['30.0%']);
    expect(buildTotalRow([col({ col: '转化率', format: 'percent', totalAgg: 'min' })], rows, '合计')).toEqual(['10.0%']);
  });

  it('ratio 列 → 分子合计 ÷ 分母合计（加权口径，非逐行平均）', () => {
    const out = buildTotalRow([col({ col: '转化率', format: 'ratio', ratioNum: '到店', ratioDen: '触达' })], rows, '合计');
    // 11000 / 60000 ≈ 18.33%（逐行平均会是 20%）
    expect(out).toEqual(['18.3%']);
  });

  it('percent 列 weighted → 分子合计 ÷ 分母合计（企微批次转化率场景）', () => {
    // 194/11221≈1.7%、197/24296≈0.8%；逐行平均 = 1.3%（错），加权 = 391/35517 ≈ 1.1%（对）
    const wrows = [
      row({ 渠道: '企微', 投放人数: 11221, 累计绑卡: 194, 转化率: '1.7%' }),
      row({ 渠道: '企微', 投放人数: 24296, 累计绑卡: 197, 转化率: '0.8%' }),
    ];
    const cols = [
      col({ col: '渠道', format: 'text', align: 'left' }),
      col({ col: '投放人数' }),
      col({ col: '累计绑卡' }),
      col({ col: '转化率', format: 'percent', totalAgg: 'weighted', ratioNum: '累计绑卡', ratioDen: '投放人数' }),
    ];
    const out = buildTotalRow(cols, wrows, '合计');
    expect(out).toEqual(['合计', '35,517', '391', '1.1%']);
  });

  it('percent 列 auto 且配置了分子/分母列 → 自动加权', () => {
    const out = buildTotalRow(
      [col({ col: '转化率', format: 'percent', ratioNum: '到店', ratioDen: '触达' })],
      rows,
      '合计',
    );
    expect(out).toEqual(['18.3%']);
  });

  it('percent 列 weighted 分母为 0/缺失 → 显示 —', () => {
    const out = buildTotalRow(
      [col({ col: '转化率', format: 'percent', totalAgg: 'weighted', ratioNum: '到店', ratioDen: '不存在' })],
      rows,
      '合计',
    );
    expect(out).toEqual(['—']);
  });

  it('totalAgg=none → 留空', () => {
    const out = buildTotalRow([col({ col: '新增绑卡', totalAgg: 'none' })], rows, '合计');
    expect(out).toEqual(['']);
  });

  it('文本列：首个文本列放「合计」文案', () => {
    const out = buildTotalRow([col({ col: '日期', format: 'text', align: 'left' }), col({ col: '新增绑卡' })], rows, '合计');
    expect(out).toEqual(['合计', '3,000']);
  });

  it('数值全为空 → 留空，不产出 NaN', () => {
    const emptyRows = [row({ 新增绑卡: '' }), row({ 新增绑卡: '—' })];
    const out = buildTotalRow([col({ col: '新增绑卡' })], emptyRows, '合计');
    expect(out).toEqual(['']);
  });

  it('逗号/百分号字符串正确清洗', () => {
    const r = [row({ v: '1,200' }), row({ v: '800' })];
    const out = buildTotalRow([col({ col: 'v' })], r, '合计');
    expect(out).toEqual(['2,000']);
  });

  it('混合配置：完整合计行（文本+求和+平均+比率+不合计）', () => {
    const cols: TableColumnConfig[] = [
      col({ col: '日期', format: 'text', align: 'left' }),
      col({ col: '新增绑卡' }),
      col({ col: '转化率', format: 'percent' }),
      col({ col: '转化率', format: 'ratio', ratioNum: '到店', ratioDen: '触达', label: '到店转化' }),
      col({ col: '触达', totalAgg: 'none' }),
    ];
    const out = buildTotalRow(cols, rows, '合计');
    expect(out).toEqual(['合计', '3,000', '20.0%', '18.3%', '']);
  });

  it('totalNumberOf：数值与单元格展示口径一致（变量注入用）', () => {
    // number 求和
    expect(totalNumberOf(col({ col: '新增绑卡' }), rows)).toBe(3000);
    // percent 平均：数据为百分数数值刻度（10/20/30 → 20）
    expect(totalNumberOf(col({ col: '转化率', format: 'percent' }), rows)).toBe(20);
    // percent 加权：0~1 比值 ×100（11000/60000 → 18.33）
    expect(totalNumberOf(col({ col: '转化率', format: 'percent', totalAgg: 'weighted', ratioNum: '到店', ratioDen: '触达' }), rows)).toBeCloseTo(18.33, 1);
    // ratio 重算
    expect(totalNumberOf(col({ col: '转化率', format: 'ratio', ratioNum: '到店', ratioDen: '触达' }), rows)).toBeCloseTo(18.33, 1);
    // 文本列 → 'label'；none → null
    expect(totalNumberOf(col({ col: '日期', format: 'text' }), rows)).toBe('label');
    expect(totalNumberOf(col({ col: '触达', totalAgg: 'none' }), rows)).toBeNull();
  });

  it('totalNumberOf：企微批次转化率真实场景（391/35517 → 1.1）', () => {
    const wrows = [
      row({ 投放人数: 11221, 累计绑卡: 194 }),
      row({ 投放人数: 24296, 累计绑卡: 197 }),
    ];
    const c = col({ col: '批次转化率', format: 'percent', totalAgg: 'weighted', ratioNum: '累计绑卡', ratioDen: '投放人数' });
    expect(totalNumberOf(c, wrows)).toBeCloseTo(1.1009, 3);
  });
});
