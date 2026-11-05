import { describe, expect, it } from 'vitest';
import {
  parseCell,
  parseCellLenient,
  inferColumnType,
  toHalfWidth,
  cleanTable,
  getVal,
} from '../../parser/clean';
import type { RawTable } from '../../types';

describe('parseCell 脏数据清洗（R1-07）', () => {
  it('千分位/万/百分比/全角数字 清洗后求和 = 1234 + 35000 + 0.85 + 123', () => {
    const cells = ['1,234', '3.5万', '85%', '１２３'];
    const sum = cells
      .map((s) => parseCell(s, 'number') as number)
      .reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1234 + 35000 + 0.85 + 123, 6);
  });

  it('缺失标记：- / — / N/A / 无 / 空 → null', () => {
    for (const t of ['-', '—', '–', 'N/A', 'na', '无', '']) {
      expect(parseCell(t, 'number')).toBeNull();
    }
  });

  it('(123) 会计负数 → -123', () => {
    expect(parseCell('(123)', 'number')).toBe(-123);
  });

  it('亿单位：1.2亿 → 1.2e8', () => {
    expect(parseCell('1.2亿', 'number')).toBeCloseTo(1.2e8, 0);
  });

  it('文本列不转换数值', () => {
    expect(parseCell('3.5万', 'text')).toBe('3.5万');
  });

  it('日期列：Date → yyyy-MM-dd 文本', () => {
    expect(parseCell(new Date(2024, 5, 1), 'date')).toBe('2024-06-01');
  });

  it('无法解析的数值抛 DirtyCellError（计入 dirtyCount）', () => {
    expect(() => parseCell('abc', 'number')).toThrow();
  });
});

describe('inferColumnType 类型推断（R1-06）', () => {
  it('数值列', () => {
    expect(inferColumnType(['1,234', 12, '3.5万']).type).toBe('number');
  });
  it('百分比列', () => {
    expect(inferColumnType(['85%', '90%']).type).toBe('percent');
  });
  it('日期列', () => {
    expect(inferColumnType(['2024-06-01', '2024/7/1']).type).toBe('date');
  });
  it('文本列', () => {
    expect(inferColumnType(['张三', '李四']).type).toBe('text');
  });
  it('空列 → text 置信度 0', () => {
    const r = inferColumnType([null, null]);
    expect(r.type).toBe('text');
    expect(r.confidence).toBe(0);
  });
});

describe('toHalfWidth 全角转半角', () => {
  it('全角数字与符号', () => {
    expect(toHalfWidth('１２３')).toBe('123');
    expect(toHalfWidth('％')).toBe('%');
    expect(toHalfWidth('－')).toBe('-');
    expect(toHalfWidth('，')).toBe(',');
  });
  it('中文不受影响', () => {
    expect(toHalfWidth('新增企微客户数')).toBe('新增企微客户数');
  });
});

describe('宽容清洗：字母编号（如 YD00117）不误判为脏数据', () => {
  const rawTable: RawTable = {
    sheetName: 'S1',
    sheets: [{ name: 'S1', rows: 3, cols: 3 }],
    headerRowIndex: 0,
    columns: [],
    source: 'csv',
    fileName: 't.csv',
    cells: [
      ['员工号', '姓名', '业绩'],
      ['YD00117', '张三', 100],
      [8056548, '李四', 200],
      ['12.34.56', '王五', 300],
      [8056549, '赵六', 400],
      [8056550, '钱七', 500],
    ],
  };
  const cleaned = cleanTable(rawTable, {
    excludeTotalKeywords: true,
    excludedRowIdx: new Set(),
  });

  it('员工号列：YD 文本原样保留、不计脏；真残缺值（12.34.56）置空且计脏', () => {
    const meta = cleaned.columns.find((c) => c.key === '员工号');
    expect(meta?.type).toBe('number');
    expect(meta?.dirtyCount).toBe(1);
    expect(meta?.missingCount).toBe(0);
    const ydRow = cleaned.rows.find((r) => getVal(r, '员工号') === 'YD00117');
    expect(ydRow).toBeTruthy();
    const badRow = cleaned.rows.find((r) => r.__idx === 3);
    expect(badRow).toBeTruthy();
    expect(getVal(badRow!, '员工号')).toBeNull();
    expect(cleaned.dirtyCells['员工号']).toHaveLength(1);
    expect(cleaned.dirtyCells['员工号'][0]?.raw).toBe('12.34.56');
  });

  it('parseCellLenient：字母/汉字文本保留原值，纯数字残缺置脏', () => {
    expect(parseCellLenient('YD00117', 'number')).toEqual({ value: 'YD00117', dirty: false });
    expect(parseCellLenient('未填写', 'number')).toEqual({ value: '未填写', dirty: false });
    expect(parseCellLenient('12.34.56', 'number')).toEqual({ value: null, dirty: true });
    expect(parseCellLenient('1,234', 'number')).toEqual({ value: 1234, dirty: false });
  });
});
