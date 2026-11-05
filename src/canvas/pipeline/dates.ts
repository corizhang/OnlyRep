import type { ScalarValue } from '../types';

/**
 * 日期解析（管道行选择 / DAYS 函数 / 趋势图排序共用）。
 * 覆盖：Date、Excel 序列号、yyyymmdd、yyyy-MM-dd、yyyy/M/d、yyyy.MM.dd、yyyy年M月D日、M月D日（当年）。
 */

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/** 解析为 UTC 零点的 Date（避免时区导致跨日）；失败返回 null */
export function parseDateValue(v: ScalarValue): Date | null {
  if (v === null || v === undefined) return null;

  // ScalarValue 名义上不含 Date，但导入源的原始单元格可能是 Date（清洗后一般已转字符串）
  const anyV = v as unknown;
  if (anyV instanceof Date) {
    if (Number.isNaN(anyV.getTime())) return null;
    return new Date(Date.UTC(anyV.getFullYear(), anyV.getMonth(), anyV.getDate()));
  }

  if (typeof v === 'boolean') return null;

  if (typeof v === 'number') {
    // Excel 序列号（1900 起算，取 1954~2119 合理区间）
    if (v >= 20000 && v <= 80000) {
      return new Date(EXCEL_EPOCH + Math.round(v) * 86400000);
    }
    // 20261029 形态
    if (v >= 19000101 && v <= 29991231) return parseDateValue(String(v));
    return null;
  }

  const s = String(v).trim();
  if (s === '') return null;

  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return mk(+m[1], +m[2], +m[3]);

  m = s.match(/^(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日?/);
  if (m) return mk(+m[1], +m[2], +m[3]);

  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return mk(+m[1], +m[2], +m[3]);

  m = s.match(/^(\d{1,2})[-/月](\d{1,2})日?$/);
  if (m) return mk(new Date().getFullYear(), +m[1], +m[2]);

  return null;
}

function mk(y: number, mo: number, d: number): Date | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** 日期差（天，向上取整）：to - from */
export function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / 86400000);
}

/** 今天的 UTC 零点 */
export function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/** 统一显示为 YYYY-MM-DD（解析失败返回原文本） */
export function formatDateLabel(v: ScalarValue): string {
  const d = parseDateValue(v);
  if (!d) return v === null ? '' : String(v);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 短日期 M-D（趋势图 X 轴用；解析失败返回原文本） */
export function formatShortDate(v: ScalarValue): string {
  const d = parseDateValue(v);
  if (!d) return v === null ? '' : String(v);
  return `${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}
