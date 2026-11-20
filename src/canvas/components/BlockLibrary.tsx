import type { CanvasBlockType } from '../types';
import { useState } from 'react';
import { createBlock } from '../defaults';
import { useCanvasStore } from '../../store/useCanvasStore';

/** 组件库（PRD R4）：点击或拖到画布添加区块；分「基础组件 / 复合组件」两组 */
const GROUPS: { title: string; items: { type: CanvasBlockType; label: string; desc: string; icon: string }[] }[] = [
  {
    title: '基础组件',
    items: [
      { type: 'text', label: '文本', desc: '支持 {{}} 插值', icon: 'T' },
      { type: 'divider', label: '分隔线', desc: '章节分隔', icon: '≡' },
      { type: 'image', label: '图片', desc: 'Logo / 插图', icon: '▢' },
      { type: 'kpiCard', label: 'KPI 指标卡', desc: '标签+主值+注释', icon: '％' },
    ],
  },
  {
    title: '复合组件',
    items: [
      { type: 'dataTable', label: '数据表格', desc: '表头/合计/高亮', icon: '▦' },
      { type: 'chart', label: '图表', desc: '条形/折线/环形/仪表', icon: '▤' },
      { type: 'rankList', label: '排行榜', desc: '名次/进度条/双列', icon: '☰' },
      { type: 'goalProgress', label: '目标完成率', desc: '大百分比+进度条', icon: '◎' },
      { type: 'row', label: '容器', desc: '分栏布局（1~4 列，可嵌套）', icon: '▭' },
    ],
  },
];

export default function BlockLibrary() {
  const addBlock = useCanvasStore((s) => s.addBlock);
  const addBlockToRow = useCanvasStore((s) => s.addBlockToRow);
  const selectedId = useCanvasStore((s) => s.selectedId);
  const config = useCanvasStore((s) => s.config);
  const collapsed = useCanvasStore((s) => s.libCollapsed);
  const setCollapsed = useCanvasStore((s) => s.setLibCollapsed);

  const [query, setQuery] = useState('');
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({});

  const selectedRow = (() => {
    if (!selectedId) return null;
    const b = config.blocks.find((x) => x.id === selectedId);
    return b && b.type === 'row' ? b : null;
  })();

  const total = GROUPS.reduce((n, g) => n + g.items.length, 0);

  // 收起态：左缘品牌色竖条（竖排字+图标），点击展开——对齐参照图的边缘交互
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        title="展开组件库"
        className="flex h-full w-7 shrink-0 flex-col items-center justify-center gap-2 border-r border-line bg-brand py-3 text-white shadow-sm transition-colors hover:bg-brand-hover"
      >
        <span className="text-[12px] leading-none">»</span>
        <span style={{ writingMode: 'vertical-lr', letterSpacing: 3 }} className="text-[11px] font-medium">
          组件库
        </span>
      </button>
    );
  }

  const q = query.trim().toLowerCase();
  const groups = GROUPS.map((g) => ({
    ...g,
    items: q ? g.items.filter((it) => it.label.toLowerCase().includes(q) || it.desc.toLowerCase().includes(q)) : g.items,
  })).filter((g) => g.items.length > 0);

  return (
    <aside className="relative flex h-full w-[220px] shrink-0 flex-col border-r border-line bg-soft">
      {/* 右缘收起条（整条可点，远比角落小按钮好找） */}
      <button
        type="button"
        onClick={() => setCollapsed(true)}
        title="收起组件库"
        className="absolute -right-[14px] top-1/2 z-20 flex h-[72px] w-[16px] -translate-y-1/2 items-center justify-center rounded-r-md border-y border-r border-brand-line bg-brand-soft text-[11px] font-medium text-brand shadow-sm transition-colors hover:bg-brand hover:text-white"
      >
        «
      </button>

      <header className="px-3 pb-1.5 pt-3">
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-ink-faint">🔍</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索组件…"
            className="w-full rounded-md bg-panel py-1.5 pl-7 pr-2 text-[12px] text-ink outline-none transition-shadow placeholder:text-ink-faint focus:ring-2 focus:ring-brand-line"
          />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3 pt-1">
        {groups.length === 0 && <p className="py-8 text-center text-[11.5px] text-ink-faint">没有匹配「{query}」的组件</p>}
        {groups.map((g) => {
          const closed = Boolean(closedGroups[g.title]);
          return (
            <div key={g.title} className="mb-2">
              <button
                type="button"
                onClick={() => setClosedGroups((prev) => ({ ...prev, [g.title]: !prev[g.title] }))}
                className="mb-1.5 flex w-full items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-hover"
              >
                <span className={`text-[9px] text-ink-faint transition-transform ${closed ? '-rotate-90' : ''}`}>▼</span>
                <span className="text-[11.5px] font-semibold text-ink-dim">{g.title}</span>
                <span className="text-[10.5px] text-ink-faint">({g.items.length})</span>
              </button>
              {!closed && (
                <div className="grid grid-cols-2 gap-1.5">
                  {g.items.map((it) => (
                    <button
                      key={it.type}
                      type="button"
                      draggable
                      title={it.desc}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/new-block', it.type);
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      onClick={() => {
                        const block = createBlock(it.type);
                        if (selectedRow && it.type !== 'row') {
                          // 选中容器时点击组件：加入其最后一列（拖入可精确到列与位置）
                          addBlockToRow(selectedRow.id, selectedRow.config.columns.length - 1, block);
                        } else {
                          addBlock(block);
                        }
                      }}
                      className="group flex flex-col items-center gap-1.5 rounded-lg border border-transparent bg-panel px-1 py-3 text-center transition-all hover:-translate-y-px hover:border-brand-line hover:shadow-card"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-hover text-[16px] text-ink-dim transition-colors group-hover:bg-brand-soft group-hover:text-brand">
                        {it.icon}
                      </span>
                      <span className="text-[11.5px] font-medium leading-tight text-ink">{it.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <p className="mt-2 rounded-md bg-hover px-2 py-1.5 text-[11px] leading-relaxed text-ink-faint">
          提示：容器可把画布分为多列，列内可再叠组件或嵌套容器。共 {total} 个组件。
        </p>
      </div>
    </aside>
  );
}
