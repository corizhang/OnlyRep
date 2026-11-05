import type { CSSProperties } from 'react';
import { getRawText, getVal } from '../../parser/clean';
import type { RankBlockConfig } from '../types';
import { resolveTable } from '../binding/resolve';
import { formatValue } from '../../compute/format';
import { aggregate } from '../../compute/aggregate';
import type { RenderCtx } from './context';

/**
 * 排行榜复合块（PRD R4-08 / K5）：绑定表格输出 + 角色映射 + 块内排序/聚合 + 名次样式。
 * 复用既有 aggregate 纯函数，不侵入排行榜 store / 渲染（R10-01）。
 */

interface RankItem {
  name: string;
  value: number;
}

export default function RankBlock({ cfg, ctx }: { cfg: RankBlockConfig; ctx: RenderCtx }) {
  const tableRes = resolveTable(cfg.table, ctx.resolve);
  if ('reason' in tableRes) return <Placeholder text={`表格未就绪：${tableRes.reason}`} ctx={ctx} />;
  const table = tableRes.table;
  if (!cfg.nameCol || !cfg.metricCol) return <Placeholder text="请先映射「名称列」与「指标列」" ctx={ctx} />;

  let items: RankItem[];
  if (cfg.groupCol) {
    const map = aggregate(table.rows, cfg.groupCol, cfg.metricCol, cfg.aggMethod);
    items = [...map.values()].map((e) => ({ name: e.key, value: e.value ?? 0 }));
  } else {
    items = table.rows.map((r) => ({
      name: getRawText(r, cfg.nameCol) || String(getVal(r, cfg.nameCol) ?? ''),
      value: (() => {
        const v = getVal(r, cfg.metricCol);
        return typeof v === 'number' ? v : 0;
      })(),
    }));
  }

  items.sort((a, b) => (cfg.sortDir === 'asc' ? a.value - b.value : b.value - a.value));
  const top = items.slice(0, Math.max(1, cfg.topN));
  const max = Math.max(...top.map((i) => Math.abs(i.value)), 1);
  const accent = cfg.accent || ctx.accent;

  const rowStyle = (rank: number): CSSProperties => {
    const tier = rank === 1 ? ctx.theme.tiers.top3 : rank <= 3 ? ctx.theme.tiers.top3 : rank <= 10 ? ctx.theme.tiers.top10 : ctx.theme.tiers.rest;
    return {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 10px',
      borderRadius: 8,
      background: tier.cardBg,
      border: `1px solid ${tier.cardBorder}`,
      marginBottom: ctx.gap / 2,
    };
  };

  const card = (item: RankItem, i: number) => {
    const rank = i + 1;
    const medal = rank === 1 ? ctx.theme.medalColors.gold : rank === 2 ? ctx.theme.medalColors.silver : rank === 3 ? ctx.theme.medalColors.bronze : null;
    return (
      <div key={`${item.name}_${i}`} style={rowStyle(rank)}>
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: rank <= 3 ? '50%' : 6,
            background: medal ?? (ctx.theme.dark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.08)'),
            color: medal ? '#3A2A00' : ctx.theme.secondaryColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: ctx.baseFont * 0.8,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {rank}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: ctx.baseFont,
              fontWeight: 600,
              color: ctx.theme.textColor,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.name || '(空)'}
          </div>
          {cfg.showProgress && (
            <div style={{ height: 4, borderRadius: 2, background: ctx.theme.dark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.08)', marginTop: 5 }}>
              <div style={{ width: `${(Math.abs(item.value) / max) * 100}%`, height: '100%', borderRadius: 2, background: accent }} />
            </div>
          )}
        </div>
        <div style={{ fontSize: ctx.baseFont * 1.02, fontWeight: 700, color: rank <= 3 ? accent : ctx.theme.textColor, fontVariantNumeric: 'tabular-nums' }}>
          {formatValue(item.value, cfg.format, '')}
        </div>
      </div>
    );
  };

  if (cfg.variant === 'table') {
    const head: CSSProperties = {
      padding: '6px 8px',
      fontSize: ctx.baseFont * 0.82,
      color: ctx.theme.secondaryColor,
      borderBottom: `1px solid ${ctx.theme.dark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.1)'}`,
      textAlign: 'left',
    };
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: ctx.baseFont }}>
        <thead>
          <tr>
            <th style={{ ...head, width: 46, textAlign: 'center' }}>名次</th>
            <th style={head}>名称</th>
            <th style={{ ...head, textAlign: 'right' }}>数值</th>
          </tr>
        </thead>
        <tbody>
          {top.map((it, i) => (
            <tr key={`${it.name}_${i}`}>
              <td style={{ padding: '6px 8px', textAlign: 'center', color: ctx.theme.secondaryColor }}>{i + 1}</td>
              <td style={{ padding: '6px 8px', color: ctx.theme.textColor }}>{it.name}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: accent }}>
                {formatValue(it.value, cfg.format, '')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (cfg.variant === 'twoColumn') {
    const half = Math.ceil(top.length / 2);
    return (
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>{top.slice(0, half).map(card)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>{top.slice(half).map((it, i) => card(it, half + i))}</div>
      </div>
    );
  }

  if (top.length === 0) return <Placeholder text="没有可排行的数据行" ctx={ctx} />;
  return <div>{top.map(card)}</div>;
}

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
