import type { CSSProperties } from 'react';
import type { CleanRow } from '../../parser/clean';
import { getRawText, getVal } from '../../parser/clean';
import type { DataTableConfig, TableColumnConfig } from '../types';
import { resolveTable } from '../binding/resolve';
import { formatValue } from '../../compute/format';
import { withAlpha, type RenderCtx } from './context';
import { buildTotalRow, toNum } from './tableTotal';

/**
 * 数据表格块（PRD R4-06）：表头 / 斑马纹 / 合计行 / 整行高亮规则。
 * 支持「比率列」（两列相除），换数据后自动重算，无需改配置。
 */
export default function DataTable({ cfg, ctx }: { cfg: DataTableConfig; ctx: RenderCtx }) {
  const tableRes = resolveTable(cfg.table, ctx.resolve);
  if ('reason' in tableRes) {
    return <Placeholder text={`表格未就绪：${tableRes.reason}`} ctx={ctx} />;
  }
  const table = tableRes.table;

  const cols: TableColumnConfig[] =
    cfg.columns.length > 0
      ? cfg.columns
      : table.columns.slice(0, 8).map((c) => ({
          col: c.key,
          label: c.rawName || c.key,
          align: c.type === 'text' ? ('left' as const) : ('right' as const),
          format: c.type === 'text' ? ('text' as const) : ('number' as const),
          decimals: 'auto' as const,
        }));

  const rows = cfg.maxRows > 0 ? table.rows.slice(0, cfg.maxRows) : table.rows;
  const fs = ctx.baseFont * cfg.fontSizeScale;
  // 表头用主题色实底 + 白字（对齐 HTML 日报观感）；斑马纹/边框走浅色
  const headerBg = ctx.accent;
  const zebraBg = ctx.theme.dark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.035)';
  const borderColor = ctx.theme.dark ? 'rgba(255,255,255,0.09)' : 'rgba(15,23,42,0.08)';
  const cellPad = '7px 10px';

  const highlightOf = (row: CleanRow): string | null => {
    for (const rule of cfg.highlightRules) {
      const v = getVal(row, rule.col);
      const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/,/g, ''));
      let hit = false;
      switch (rule.op) {
        case '>':
          hit = Number.isFinite(n) && n > rule.value;
          break;
        case '>=':
          hit = Number.isFinite(n) && n >= rule.value;
          break;
        case '<':
          hit = Number.isFinite(n) && n < rule.value;
          break;
        case '<=':
          hit = Number.isFinite(n) && n <= rule.value;
          break;
        case '=':
          hit = Number.isFinite(n) && n === rule.value;
          break;
        case '!=':
          hit = !(Number.isFinite(n) && n === rule.value);
          break;
        case 'nonEmpty':
          hit = String(v ?? '').trim() !== '';
          break;
      }
      if (hit) return rule.color || '#F59E0B';
    }
    return null;
  };

  const totalCells = cfg.totalRow ? buildTotalRow(cols, rows, cfg.totalLabel) : null;

  const cellStyle = (c: TableColumnConfig): CSSProperties => ({
    padding: cellPad,
    textAlign: c.align,
    fontSize: fs,
    fontVariantNumeric: 'tabular-nums',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    width: c.width ? c.width : undefined,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {cfg.title && (
        <div style={{ fontSize: ctx.baseFont * 0.92, fontWeight: 600, color: ctx.theme.textColor }}>{cfg.title}</div>
      )}
      <div
        style={{
          background: cfg.cardBg || (ctx.theme.dark ? 'rgba(255,255,255,0.04)' : '#FFFFFF'),
          border: `1px solid ${borderColor}`,
          borderRadius: ctx.shellRadius ?? 10,
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: c0Width(cols) }}>
          <thead>
            {cfg.showHeader && (
              <tr>
                {cfg.showIndex && (
                  <th style={{ ...cellStyle({ ...cols[0], align: 'center' }), background: headerBg, color: '#FFFFFF', fontSize: fs * 0.9, fontWeight: cfg.headerBold ? 700 : 400, width: 34 }}>
                    #
                  </th>
                )}
                {cols.map((c, i) => (
                  <th
                    key={`${c.col}_${i}`}
                    style={{
                      ...cellStyle(c),
                      background: headerBg,
                      color: '#FFFFFF',
                      fontSize: fs * 0.9,
                      fontWeight: cfg.headerBold ? 700 : 400,
                    }}
                  >
                    {c.label || c.col}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const hi = highlightOf(row);
              const bg = hi
                ? withAlpha(hi, 0.16)
                : cfg.zebra && ri % 2 === 1
                  ? zebraBg
                  : 'transparent';
              return (
                <tr key={ri} style={{ background: bg }}>
                  {cfg.showIndex && (
                    <td style={{ ...cellStyle({ ...cols[0], align: 'center' }), color: ctx.theme.secondaryColor, borderBottom: `1px solid ${borderColor}` }}>
                      {ri + 1}
                    </td>
                  )}
                  {cols.map((c, ci) => (
                    <td
                      key={`${c.col}_${ci}`}
                      style={{
                        ...cellStyle(c),
                        color: ctx.theme.textColor,
                        borderBottom: `1px solid ${borderColor}`,
                        borderLeft: hi ? `3px solid ${hi}` : undefined,
                      }}
                    >
                      {cellText(c, row)}
                    </td>
                  ))}
                </tr>
              );
            })}
            {totalCells && (
              <tr>
                {cfg.showIndex && <td style={{ ...cellStyle({ ...cols[0], align: 'center' }), borderBottom: `1px solid ${borderColor}` }} />}
                {totalCells.map((t, i) => (
                  <td
                    key={i}
                    style={{
                      ...cellStyle(cols[i] ?? { col: '', label: '', align: 'right', format: 'text', decimals: 0 }),
                      fontWeight: 700,
                      color: ctx.theme.textColor,
                      background: ctx.theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.045)',
                      borderBottom: `1px solid ${borderColor}`,
                    }}
                  >
                    {t}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 列宽模式：全部固定时用 fixed 保证宽度生效 */
function c0Width(cols: TableColumnConfig[]): 'fixed' | 'auto' {
  return cols.every((c) => !!c.width) ? 'fixed' : 'auto';
}

function cellText(c: TableColumnConfig, row: CleanRow): string {
  if (c.format === 'ratio') {
    const num = toNum(getVal(row, c.ratioNum ?? ''));
    const den = toNum(getVal(row, c.ratioDen ?? ''));
    if (num === null || den === null || den === 0) return '—';
    const d = c.decimals === 'auto' ? 1 : Math.max(0, Math.min(4, Math.round(c.decimals)));
    return `${((num / den) * 100).toFixed(d)}%`;
  }
  const v = getVal(row, c.col);
  if (c.format === 'text') {
    const raw = getRawText(row, c.col);
    return raw !== '' ? raw : v === null ? '' : String(v);
  }
  if (v === null) return '—';
  if (typeof v === 'number') {
    if (c.format === 'percent') {
      const pct = Math.abs(v) <= 1 ? v * 100 : v;
      const d = c.decimals === 'auto' ? 1 : Math.max(0, Math.min(2, Math.round(c.decimals)));
      return `${pct.toFixed(d)}%`;
    }
    return formatValue(v, {
      thousands: true,
      decimals: c.decimals,
      unit: 'none',
      percent: false,
      prefix: '',
    });
  }
  return String(v);
}

/** 合计行计算已抽取到 tableTotal.ts（纯函数，含单测） */

function Placeholder({ text, ctx }: { text: string; ctx: RenderCtx }) {
  return (
    <div
      style={{
        border: `1px dashed ${ctx.theme.dark ? 'rgba(255,255,255,0.3)' : 'rgba(15,23,42,0.2)'}`,
        borderRadius: ctx.shellRadius ?? 8,
        padding: 16,
        textAlign: 'center',
        color: ctx.theme.secondaryColor,
        fontSize: ctx.baseFont * 0.85,
      }}
    >
      {text}
    </div>
  );
}
