import type { CSSProperties } from 'react';
import type { TextBlockConfig } from '../types';
import { renderTemplate } from '../pipeline/formula/eval';
import { roleColorFor } from '../../themes/themes';
import { fmtNum, fmtPct, type RenderCtx } from './context';
import { renderRichText } from './richText';

/**
 * 文本块：内容支持 {{表达式}} 占位与轻量富文本标记（**粗** ==亮== ~~次要~~ !!涨!! ??跌??）。
 * 导出走 inline style，html-to-image 可完整还原。
 */
export default function TextBlock({ cfg, ctx }: { cfg: TextBlockConfig; ctx: RenderCtx }) {
  const color =
    cfg.colorMode === 'custom' && cfg.customColor !== ''
      ? cfg.customColor
      : roleColorFor(ctx.theme, cfg.role);

  const { text } = renderTemplate(cfg.content, { vars: ctx.resolve.env }, { num: fmtNum, pct: (n) => fmtPct(n) });

  const style: CSSProperties = {
    fontSize: Math.round(ctx.baseFont * cfg.fontSizeScale * 100) / 100,
    fontWeight: cfg.bold ? 700 : 400,
    color,
    textAlign: cfg.align,
    lineHeight: 1.45,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  };
  return <div style={style}>{renderRichText(text, ctx)}</div>;
}
