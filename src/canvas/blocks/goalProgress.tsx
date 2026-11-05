import type { CSSProperties } from 'react';
import type { GoalProgressConfig } from '../types';
import { numericOf, resolveField } from '../binding/resolve';
import { renderTemplate } from '../pipeline/formula/eval';
import { fmtNum, fmtPct, withAlpha, type RenderCtx } from './context';
import { renderRichText } from './richText';

/**
 * 全年目标完成率块（PRD R4-04）：大百分比 + 进度条 + 两行可绑定元信息。
 * 比例约定 0~1（公式「已完成/全年目标」天然满足）。
 */
export default function GoalProgress({ cfg, ctx }: { cfg: GoalProgressConfig; ctx: RenderCtx }) {
  const res = resolveField(cfg.ratio, ctx.resolve);
  const ratio = numericOf(res);
  const valid = ratio !== null && Number.isFinite(ratio);
  const clamped = valid ? Math.max(0, Math.min(1, ratio)) : 0;
  const pctText = valid ? `${(ratio * 100).toFixed(Math.max(0, Math.min(2, cfg.decimals)))}%` : '—';

  const panel: CSSProperties = {
    background:
      cfg.panelBg ||
      `linear-gradient(135deg, ${withAlpha(ctx.accent, 0.92)} 0%, ${withAlpha(ctx.accent, 0.58)} 100%)`,
    borderRadius: ctx.shellRadius ?? 12,
    padding: '16px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: 22,
    boxSizing: 'border-box',
  };

  const meta = (tpl: string): string =>
    renderTemplate(tpl, { vars: ctx.resolve.env }, { num: fmtNum, pct: (n) => fmtPct(n) }).text;

  const left = cfg.metaLeft ? meta(cfg.metaLeft) : '';
  const right = cfg.metaRight ? meta(cfg.metaRight) : '';

  return (
    <div style={panel}>
      <div style={{ flexShrink: 0, minWidth: 128 }}>
        <div style={{ fontSize: ctx.baseFont * 0.85, color: 'rgba(255,255,255,0.78)' }}>{cfg.label}</div>
        {cfg.showPct && (
          <div
            style={{
              fontSize: ctx.baseFont * 2.9,
              fontWeight: 700,
              color: cfg.pctColor || '#FFFFFF',
              lineHeight: 1.2,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: -1,
            }}
          >
            {pctText}
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div
          style={{
            height: 10,
            borderRadius: 5,
            background: cfg.trackColor || 'rgba(255,255,255,0.22)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${clamped * 100}%`,
              height: '100%',
              borderRadius: 5,
              background: cfg.barColor || 'linear-gradient(90deg, #F5C542 0%, #F59E0B 100%)',
            }}
          />
        </div>
        {left && (
          <div style={{ fontSize: ctx.baseFont * 0.8, color: 'rgba(255,255,255,0.92)', lineHeight: 1.4 }}>
            {renderRichText(left, ctx)}
          </div>
        )}
        {right && (
          <div style={{ fontSize: ctx.baseFont * 0.8, color: 'rgba(255,255,255,0.72)', lineHeight: 1.4 }}>
            {renderRichText(right, ctx)}
          </div>
        )}
        {!valid && (
          <div style={{ fontSize: ctx.baseFont * 0.75, color: '#FDE68A' }}>
            完成率未绑定或计算失败{res.kind === 'error' ? `：${res.message}` : ''}
          </div>
        )}
      </div>
    </div>
  );
}
