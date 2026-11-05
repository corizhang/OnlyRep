import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { readWorkbookSync } from '../xlsxCore';

/** Bug 2 回归：SheetJS 将「85%」预转为数值 0.85 且 numFmt 含 % 时，应输出文本 "85%" 让下游清洗逻辑生效 */
describe('xlsxCore 百分比单元格（t=n + z 含 %）', () => {
  it('0.85 + numFmt 0% → RawTable 中为字符串 "85%"', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['转化率'],
      [0.85],
      [0.855],
    ]);
    const c2 = ws['A2'] as XLSX.CellObject;
    c2.t = 'n';
    c2.v = 0.85;
    c2.z = '0%';
    const c3 = ws['A3'] as XLSX.CellObject;
    c3.t = 'n';
    c3.v = 0.855;
    c3.z = '0.0%';
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'S1');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    const result = readWorkbookSync({ format: 'xlsx', buffer: buf });
    expect(result.cells[0][0]).toBe('转化率');
    expect(result.cells[1][0]).toBe('85%');
    expect(result.cells[2][0]).toBe('85.5%'); // 精度保持，无浮点尾差
  });

  it('普通数值列（numFmt 无 %）不受影响', () => {
    const ws = XLSX.utils.aoa_to_sheet([['值'], [1234]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'S1');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const result = readWorkbookSync({ format: 'xlsx', buffer: buf });
    expect(result.cells[1][0]).toBe(1234);
  });
});
