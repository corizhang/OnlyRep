import type { CSSProperties, ReactNode } from 'react';
import type { RenderCtx } from './context';

/**
 * 轻量富文本（PRD R4-07 增补）：
 * 在 {{表达式}} 模板之上叠加内联标记，textarea 直写 + 工具栏一键包裹，导出全兼容：
 *   **加粗**  ==高亮==  ~~次要~~  !!涨色!!  ??跌色??
 * 标记在 renderTemplate 之后再解析（表达式算出的数值同样可被标记包裹）；
 * 可嵌套（如 **==重点==**）；无法配对时原样显示，不会产生半截样式。
 */

const HAS_MARK = /\*\*|==|~~|!!|\?\?/;

export function renderRichText(text: string, ctx: RenderCtx): ReactNode {
  if (!text || !HAS_MARK.test(text)) return text;
  const markBg = ctx.theme.dark ? 'rgba(250, 204, 21, 0.32)' : 'rgba(253, 224, 71, 0.85)';
  // 每次调用新建正则：递归解析嵌套时会重置 lastIndex，共享实例会导致外层死循环
  const re = /\*\*(.+?)\*\*|==(.+?)==|~~(.+?)~~|!!(.+?)!!|\?\?(.+?)\?\?/g;
  const out: ReactNode[] = [];
  let last = 0;
  let k = 0;
  let matched = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    matched = true;
    if (m.index > last) out.push(text.slice(last, m.index));
    const inner = m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? '';
    let style: CSSProperties | undefined;
    if (m[1] !== undefined) style = { fontWeight: 700 };
    else if (m[2] !== undefined) style = { background: markBg, borderRadius: 2, padding: '0 2px' };
    else if (m[3] !== undefined) style = { color: ctx.theme.secondaryColor };
    else if (m[4] !== undefined) style = { color: ctx.rise, fontWeight: 600 };
    else style = { color: ctx.fall, fontWeight: 600 };
    // 内层递归：支持标记嵌套
    out.push(
      <span key={k++} style={style}>
        {renderRichText(inner, ctx)}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (!matched) return text; // 标记未配对 → 原样返回
  if (last < text.length) out.push(text.slice(last));
  return out;
}
