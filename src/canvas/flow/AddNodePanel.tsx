import { useEffect, useMemo, useRef, useState } from 'react';
import { SearchOutlined } from '@ant-design/icons';
import type { NodeType } from '../types';
import { STEP_DEF_LIST } from './nodes';
import type { StepCategory } from './nodes/types';

/**
 * 添加节点面板内容（唯一实现，节点工具条与连线插入共用）：
 * 搜索 + 分类页签 + 分组列表。分组完全由注册表 STEP_DEF_LIST 的 category 字段驱动——
 * 新注册节点自动出现在面板里，无需在此处或别处维护清单。
 */

const CATEGORIES: StepCategory[] = ['筛选与整理', '计算与合并', '取数与公式'];

export default function AddNodePanelContent({
  onPick,
  footerHint,
  autoFocus = false,
  onEscape,
}: {
  onPick: (type: NodeType) => void;
  /** 底部提示（如「添加后自动连接到「x」」） */
  footerHint?: string;
  autoFocus?: boolean;
  onEscape?: () => void;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<StepCategory>('筛选与整理');

  useEffect(() => {
    if (autoFocus) searchRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (!onEscape) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onEscape();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onEscape]);

  const items = useMemo(() => {
    // 注册表驱动：分类取自节点定义本身
    const list = STEP_DEF_LIST.map((d) => ({ type: d.type, category: d.category, label: d.label, icon: d.icon, hint: d.hint }));
    const q = query.trim().toLowerCase();
    return list.filter((item) => !q || `${item.label} ${item.hint} ${item.category}`.toLowerCase().includes(q));
  }, [query]);

  return (
    <>
      <div className="flex items-center gap-2 border-b border-[var(--nb-pop-border)] px-3 py-2">
        <SearchOutlined className="text-[var(--nb-text-faint)]" />
        <input
          ref={searchRef}
          type="search"
          role="searchbox"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索节点名称或用途"
          aria-label="搜索节点"
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-[var(--nb-text-faint)]"
        />
        <kbd className="rounded border border-[var(--nb-pop-border)] px-1 py-0.5 text-[9px] text-[var(--nb-text-faint)]">Esc</kbd>
      </div>
      {!query.trim() && (
        <div className="flex shrink-0 gap-1 border-b border-[var(--nb-pop-border)] px-2 py-2" role="tablist" aria-label="节点分类">
          {CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              role="tab"
              aria-selected={activeCategory === category}
              onClick={() => setActiveCategory(category)}
              className={`flex-1 rounded-md px-1 py-1.5 text-[11px] transition-colors ${activeCategory === category ? 'bg-brand/15 text-brand' : 'text-[var(--nb-text-dim)] hover:bg-[var(--nb-control-hover)]'}`}
            >
              {category}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {(query.trim() ? CATEGORIES : [activeCategory]).map((category) => {
          const group = items.filter((item) => item.category === category);
          if (group.length === 0) return null;
          return (
            <section key={category} className="mb-1.5 last:mb-0">
              <h3 className="px-2 pb-0.5 text-[10px] font-semibold leading-3 tracking-wide text-[var(--nb-text-faint)]">{category}</h3>
              <div className="space-y-px">
                {group.map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    title={item.hint}
                    onClick={() => onPick(item.type)}
                    className="flex min-h-9 w-full min-w-0 items-center gap-2 rounded-md border border-transparent px-2 py-1 text-left transition-colors hover:border-brand/25 hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--nb-control-bg)] text-[12px] font-semibold text-brand">{item.icon}</span>
                    <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                      <span className="truncate text-[12px] font-medium">{item.label}</span>
                      <span className="truncate text-[10px] text-[var(--nb-text-faint)]">{item.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
        {items.length === 0 && <p className="px-2 py-6 text-center text-xs text-[var(--nb-text-faint)]">没有匹配的节点</p>}
      </div>
      {footerHint && (
        <div className="shrink-0 truncate border-t border-[var(--nb-pop-border)] px-3 py-2 text-[10px] text-[var(--nb-text-dim)]" title={footerHint}>
          {footerHint}
        </div>
      )}
    </>
  );
}
