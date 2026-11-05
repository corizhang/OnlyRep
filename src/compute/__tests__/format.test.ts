import { describe, expect, it } from 'vitest';
import { formatValue, autoDecimals, groupThousands } from '../format';

const base = {
  thousands: true,
  decimals: 'auto' as const,
  unit: 'none' as const,
  percent: false,
  prefix: '',
};

describe('formatValue 数值格式化（R3-03 / 验收标准）', () => {
  it('1234567 + unit:wan → 「123.5万」', () => {
    expect(formatValue(1234567, { ...base, unit: 'wan' })).toBe('123.5万');
  });

  it('1234567 + unit:none + thousands → 「1,234,567」', () => {
    expect(formatValue(1234567, base)).toBe('1,234,567');
  });

  it('auto 模式大数自动换算万（≥1e4 且 <1e8）', () => {
    expect(formatValue(1234567, { ...base, unit: 'auto' })).toBe('123.5万');
  });

  it('auto 模式超大数换算亿', () => {
    expect(formatValue(1234000000, { ...base, unit: 'auto' })).toBe('12.34亿');
  });

  it('百分比列：0.856 → 「85.6%」', () => {
    expect(formatValue(0.856, { ...base, percent: true })).toBe('85.6%');
  });

  it('colUnit=% 时自动补百分号', () => {
    expect(formatValue(0.85, { ...base }, '%')).toBe('85%');
  });

  it('前缀与负数与固定小数位', () => {
    expect(formatValue(-1234.5, { ...base, prefix: '¥', decimals: 1 })).toBe('-¥1,234.5');
  });

  it('NaN → 「-」', () => {
    expect(formatValue(NaN, base)).toBe('-');
  });
});

describe('autoDecimals / groupThousands', () => {
  it('整数 0 位；近似整数消除浮点尾差', () => {
    expect(autoDecimals(1234567)).toBe(0);
    expect(autoDecimals(85.00000000000001)).toBe(0);
  });
  it('非整数取最少位', () => {
    expect(autoDecimals(85.6)).toBe(1);
    expect(autoDecimals(0.85)).toBe(2);
  });
  it('groupThousands 保留小数与负号', () => {
    expect(groupThousands('1234567')).toBe('1,234,567');
    expect(groupThousands('1234.5')).toBe('1,234.5');
    expect(groupThousands('-9876543.21')).toBe('-9,876,543.21');
  });
});
