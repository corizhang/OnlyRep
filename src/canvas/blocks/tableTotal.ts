import type { CleanRow } from '../../parser/clean';
import { getVal } from '../../parser/clean';
import { formatValue } from '../../compute/format';
import type { TableColumnConfig, TotalAgg } from '../types';

/**
 * 合计行计算（PRD R4-06 增补）：
 * - ratio 列 → 分子合计 ÷ 分母合计（加权口径）
 * - number/percent 列 → 按列配置 totalAgg；auto 时 number 求和、percent 平均
 * - 文本列 → 仅在首个文本列放「合计」文案
 */

export function toNum(v: string | number | null): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v ?? '').replace(/[,\s%]/g, '');
  if (s === '') return null; // 空值 / null / '—' 一律视为无效，避免 Number('') === 0 混入求和
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function sumOf(rows: CleanRow[], col: string): number | null {
  let sum = 0;
  let hit = false;
  for (const r of rows) {
    const n = toNum(getVal(r, col));
    if (n !== null) {
      sum += n;
      hit = true;
    }
  }
  return hit ? sum : null;
}

function aggregateOf(rows: CleanRow[], col: string, agg: Exclude<TotalAgg, 'auto' | 'none' | 'weighted'>): number | null {
  const nums = rows.map((r) => toNum(getVal(r, col))).filter((n): n is number => n !== null);
  if (nums.length === 0) return null;
  if (agg === 'sum') return nums.reduce((a, b) => a + b, 0);
  if (agg === 'avg') return nums.reduce((a, b) => a + b, 0) / nums.length;
  if (agg === 'max') return Math.max(...nums);
  return Math.min(...nums);
}

/** auto 时的默认口径：number=求和、percent=平均（配置了分子/分母列则加权重算）、ratio=重算 */
function resolveAgg(c: TableColumnConfig): TotalAgg {
  if (c.totalAgg) return c.totalAgg;
  return c.format === 'percent' && c.ratioNum && c.ratioDen ? 'weighted' : 'auto';
}

function fmtNumber(v: number, c: TableColumnConfig): string {
  return formatValue(v, { thousands: true, decimals: c.decimals, unit: 'none', percent: false, prefix: '' });
}

function fmtPercent(v: number, c: TableColumnConfig): string {
  const d = c.decimals === 'auto' ? 1 : Math.max(0, Math.min(2, Math.round(c.decimals)));
  return `${(Math.abs(v) <= 1 ? v * 100 : v).toFixed(d)}%`;
}

/**
 * 单列合计的数值结果（合计行变量注入复用同一口径）：
 * - number → 数值
 * - percent/weighted、ratio → 百分比数值（已 ×100，与单元格展示一致，如 1.1 表示 1.1%）
 * - null → 不参与 / 无法计算
 * - 'label' → 文本列（合计行放文案）
 */
export function totalNumberOf(c: TableColumnConfig, rows: CleanRow[]): number | null | 'label' {
  const agg = resolveAgg(c);
  if (agg === 'none') return null;
  if (c.format === 'ratio') {
    const num = sumOf(rows, c.ratioNum ?? '');
    const den = sumOf(rows, c.ratioDen ?? '');
    return den !== null && den !== 0 && num !== null ? (num / den) * 100 : null;
  }
  if (c.format === 'percent') {
    if (agg === 'weighted') {
      const num = sumOf(rows, c.ratioNum ?? '');
      const den = sumOf(rows, c.ratioDen ?? '');
      return den !== null && den !== 0 && num !== null ? (num / den) * 100 : null;
    }
    const total = aggregateOf(rows, c.col, agg === 'auto' ? 'avg' : (agg as Exclude<TotalAgg, 'auto' | 'none' | 'weighted'>));
    return total === null ? null : (Math.abs(total) <= 1 ? total * 100 : total);
  }
  if (c.format === 'number') {
    return aggregateOf(rows, c.col, agg === 'auto' ? 'sum' : (agg as Exclude<TotalAgg, 'auto' | 'none' | 'weighted'>));
  }
  return 'label';
}

export function buildTotalRow(cols: TableColumnConfig[], rows: CleanRow[], label: string): string[] {
  const out: string[] = [];
  let labelUsed = false;
  for (const c of cols) {
    const agg = resolveAgg(c);
    if (agg === 'none') {
      out.push('');
      continue;
    }
    if (c.format === 'ratio') {
      const num = sumOf(rows, c.ratioNum ?? '');
      const den = sumOf(rows, c.ratioDen ?? '');
      const d = c.decimals === 'auto' ? 1 : Math.max(0, Math.min(4, Math.round(c.decimals)));
      out.push(den !== null && den !== 0 && num !== null ? `${((num / den) * 100).toFixed(d)}%` : '—');
      continue;
    }
    if (c.format === 'number' || c.format === 'percent') {
      // percent 列加权：分子合计÷分母合计（如批次转化率 = 累计绑卡合计 ÷ 投放人数合计）
      if (c.format === 'percent' && agg === 'weighted') {
        const num = sumOf(rows, c.ratioNum ?? '');
        const den = sumOf(rows, c.ratioDen ?? '');
        out.push(den !== null && den !== 0 && num !== null ? fmtPercent(num / den, c) : '—');
        continue;
      }
      // ratio 重算已由 format==='ratio' 承担；percent 默认平均，number 默认求和
      const eff: Exclude<TotalAgg, 'auto' | 'none' | 'weighted'> =
        agg === 'auto' ? (c.format === 'percent' ? 'avg' : 'sum') : (agg as Exclude<TotalAgg, 'auto' | 'none' | 'weighted'>);
      const total = aggregateOf(rows, c.col, eff);
      if (total === null) {
        out.push('');
      } else if (c.format === 'percent') {
        out.push(fmtPercent(total, c));
      } else {
        out.push(fmtNumber(total, c));
      }
      continue;
    }
    if (!labelUsed) {
      out.push(label);
      labelUsed = true;
    } else {
      out.push('');
    }
  }
  return out;
}
