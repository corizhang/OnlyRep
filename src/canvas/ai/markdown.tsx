import type { ReactNode } from 'react';

/**
 * 轻量 Markdown 渲染（AI 会话气泡专用）：
 * 代码块 ```、行内码 `、粗体 **、标题 #/##/###、有序/无序列表、普通段落。
 * 纯 React 元素输出（不走 HTML 注入），故意不支持链接/图片/表格——
 * AI 回答用不到，省了 XSS 面。
 */

/** 行内：`code` 与 **bold** 混排 */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1]) {
      parts.push(
        <code key={`${keyPrefix}c${i}`} className="rounded bg-black/10 px-1 py-0.5 font-mono text-[11px]">
          {m[1].slice(1, -1)}
        </code>,
      );
    } else if (m[2]) {
      parts.push(
        <strong key={`${keyPrefix}b${i}`} className="font-semibold">
          {m[2].slice(2, -2)}
        </strong>,
      );
    }
    last = m.index + m[0].length;
    i += 1;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function renderMarkdown(text: string): ReactNode {
  const lines = text.split('\n');
  const out: ReactNode[] = [];
  let codeBuf: string[] | null = null;
  let listBuf: { ordered: boolean; items: string[] } | null = null;
  let key = 0;

  let tableBuf: string[][] | null = null;
  const flushTable = (): void => {
    if (!tableBuf || tableBuf.length === 0) return;
    const [head, ...body] = tableBuf;
    out.push(
      <div key={`tbl${key}`} className="overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              {head.map((c, i) => (
                <th key={i} className="border border-line bg-hover px-1.5 py-1 text-left font-semibold">
                  {renderInline(c, `th${key}_${i}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, r) => (
              <tr key={r} className={r % 2 ? 'bg-soft' : ''}>
                {row.map((c, i) => (
                  <td key={i} className="border border-line px-1.5 py-1 align-top">
                    {renderInline(c, `td${key}_${r}_${i}`)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    key += 1;
    tableBuf = null;
  };

  const flushList = (): void => {
    if (!listBuf) return;
    const items = listBuf.items.map((it, j) => <li key={j}>{renderInline(it, `li${key}_${j}`)}</li>);
    out.push(
      listBuf.ordered ? (
        <ol key={`l${key}`} className="ml-4 list-decimal space-y-0.5">
          {items}
        </ol>
      ) : (
        <ul key={`l${key}`} className="ml-4 list-disc space-y-0.5">
          {items}
        </ul>
      ),
    );
    key += 1;
    listBuf = null;
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    // 表格行（| a | b |；分隔行 |---|---| 跳过）
    const isTableRow = /^\s*\|.*\|\s*$/.test(line);
    if (isTableRow) {
      flushList();
      if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue; // 分隔行
      const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      if (!tableBuf) tableBuf = [];
      tableBuf.push(cells);
      continue;
    }
    flushTable();
    // 代码块围栏
    if (/^```/.test(line.trim())) {
      flushList();
      if (codeBuf === null) {
        codeBuf = [];
      } else {
        out.push(
          <pre key={`code${key}`} className="overflow-x-auto rounded-md bg-[#1f2430] px-2.5 py-2 font-mono text-[11px] leading-relaxed text-[#d8dee9]">
            {codeBuf.join('\n')}
          </pre>,
        );
        key += 1;
        codeBuf = null;
      }
      continue;
    }
    if (codeBuf !== null) {
      codeBuf.push(raw);
      continue;
    }
    // 标题
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flushList();
      const cls = h[1].length === 1 ? 'text-[13px] font-semibold' : 'text-[12px] font-semibold';
      out.push(
        <div key={`h${key}`} className={`${cls} mt-1.5 text-ink`}>
          {renderInline(h[2], `h${key}`)}
        </div>,
      );
      key += 1;
      continue;
    }
    // 列表
    const ul = line.match(/^\s*[-·•]\s+(.*)$/);
    const ol = line.match(/^\s*(\d+)[.、)]\s*(.*)$/);
    if (ul || ol) {
      const ordered = Boolean(ol);
      if (!listBuf || listBuf.ordered !== ordered) flushList();
      if (!listBuf) listBuf = { ordered, items: [] };
      listBuf.items.push((ul?.[1] ?? ol?.[2] ?? '').trim());
      continue;
    }
    // 空行
    if (!line.trim()) {
      flushList();
      continue;
    }
    // 普通段落
    flushList();
    out.push(<div key={`p${key}`}>{renderInline(line, `p${key}`)}</div>);
    key += 1;
  }
  flushTable();
  flushList();
  if (codeBuf !== null) {
    out.push(
      <pre key={`code${key}`} className="overflow-x-auto rounded-md bg-[#1f2430] px-2.5 py-2 font-mono text-[11px] leading-relaxed text-[#d8dee9]">
        {codeBuf.join('\n')}
      </pre>,
    );
  }
  return <div className="space-y-1">{out}</div>;
}
