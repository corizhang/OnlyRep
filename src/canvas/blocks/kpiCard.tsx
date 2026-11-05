import type { CSSProperties } from 'react';
import type { KpiCardConfig } from '../types';
import { formatResolved, resolveField } from '../binding/resolve';
import { renderTemplate } from '../pipeline/formula/eval';
import { fmtNum, fmtPct, type RenderCtx } from './context';
import { renderRichText } from './richText';

/** KPI 指标卡（PRD R4-03）：标签 + 主值（可绑定）+ 注释行（可带表达式） */
export default function KpiCard({ cfg, ctx }: { cfg: KpiCardConfig; ctx: RenderCtx }) {
  const res = resolveField(cfg.value, ctx.resolve);
  const { text, state, message } = formatResolved(res, cfg.format);
  const accent = cfg.accent || ctx.accent;
  const noteColor =
    cfg.noteTone === 'rise'
      ? ctx.rise
      : cfg.noteTone === 'fall'
        ? ctx.fall
        : cfg.noteTone === 'custom' && cfg.customNoteColor
          ? cfg.customNoteColor
          : ctx.theme.secondaryColor;

  const note = cfg.note
    ? renderTemplate(cfg.note, { vars: ctx.resolve.env }, { num: fmtNum, pct: (n) => fmtPct(n) }).text
    : '';

  const card: CSSProperties = {
    background: cfg.cardBg || (ctx.theme.dark ? 'rgba(255,255,255,0.07)' : '#FFFFFF'),
    border: `1px solid ${ctx.theme.dark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.08)'}`,
    borderRadius: ctx.shellRadius ?? 12,
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    minWidth: 0,
    boxSizing: 'border-box',
  };

  return (
    <div style={card}>
      <div style={{ fontSize: ctx.baseFont * 0.86, color: ctx.theme.secondaryColor, letterSpacing: 0.2 }}>
        {cfg.label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, minWidth: 0 }}>
        <span
          style={{
            fontSize: ctx.baseFont * 2.1,
            fontWeight: 700,
            color: accent,
            lineHeight: 1.15,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: -0.5,
          }}
        >
          {text}
        </span>
        {cfg.unit && <span style={{ fontSize: ctx.baseFont * 0.85, color: ctx.theme.secondaryColor }}>{cfg.unit}</span>}
        {state !== 'ok' && (
          <span title={message} style={{ fontSize: ctx.baseFont * 0.75, color: '#F59E0B' }}>
            ●
          </span>
        )}
      </div>
      {note && <div style={{ fontSize: ctx.baseFont * 0.78, color: noteColor, lineHeight: 1.4 }}>{renderRichText(note, ctx)}</div>}
    </div>
  );
}
