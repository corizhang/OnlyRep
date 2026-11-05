import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { renderRichText } from '../richText';
import type { RenderCtx } from '../context';
import type { ThemeTokens } from '../../../types';

/** 从 React 元素树提取带样式的片段：[{text, style}]（node 环境，无需 DOM 渲染） */
function flatten(node: ReactNode): { text: string; style?: Record<string, unknown> }[] {
  if (typeof node === 'string' || typeof node === 'number') return [{ text: String(node) }];
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap((n) => flatten(n));
  const el = node as { props?: { style?: Record<string, unknown>; children?: ReactNode } };
  if (el.props) {
    return flatten(el.props.children).map((x) => ({ text: x.text, style: x.style ?? el.props?.style }));
  }
  return [];
}

const ctx = {
  theme: { dark: false, secondaryColor: '#64748B' } as ThemeTokens,
  rise: '#DC2626',
  fall: '#16A34A',
} as unknown as RenderCtx;

describe('renderRichText 轻量富文本', () => {
  it('无标记 → 原样字符串（快速路径）', () => {
    expect(renderRichText('普通文字 {{a}}', ctx)).toBe('普通文字 {{a}}');
  });

  it('五种标记各自生效', () => {
    const out = renderRichText('**重**==亮==~~灰~~!!涨!!??跌??', ctx);
    const parts = flatten(out);
    const find = (t: string): Record<string, unknown> | undefined => parts.find((p) => p.text === t)?.style;
    expect(find('重')?.fontWeight).toBe(700);
    expect(String(find('亮')?.background)).toContain('253, 224, 71');
    expect(find('灰')?.color).toBe('#64748B');
    expect(find('涨')?.color).toBe('#DC2626');
    expect(find('跌')?.color).toBe('#16A34A');
  });

  it('标记内嵌套（**==重点==**）：外层粗、内层高亮', () => {
    const arr = renderRichText('**==重点==**', ctx) as {
      props?: { style?: Record<string, unknown>; children?: ReactNode[] };
    }[];
    const outer = arr[0] as { props?: { style?: Record<string, unknown>; children?: ReactNode[] } };
    // 外层 span：加粗
    expect(outer.props?.style?.fontWeight).toBe(700);
    // 内层 span：高亮底色
    const inner = outer.props?.children?.[0] as { props?: { style?: Record<string, unknown>; children?: unknown } };
    expect(String(inner.props?.style?.background)).toContain('253, 224, 71');
    expect(inner.props?.children).toBe('重点');
  });

  it('未配对标记 → 原样显示不崩', () => {
    expect(renderRichText('未闭合 **标记', ctx)).toBe('未闭合 **标记');
  });

  it('多段混合：文字与标记交错', () => {
    const parts = flatten(renderRichText('A**B**C', ctx));
    expect(parts.map((p) => p.text).join('')).toBe('ABC');
    expect(parts[0].style).toBeUndefined();
    expect(parts[1].style?.fontWeight).toBe(700);
    expect(parts[2].style).toBeUndefined();
  });
});
