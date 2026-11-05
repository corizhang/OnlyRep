import { useEffect, useState } from 'react';
import { useFormulaVariables, GROUP_COLOR } from '../formula/FormulaInput';
import { groupVariables, displayVarValue } from '../formula/variableEnv';
import { matchQuery } from '../formula/pinyin';
import { varFullToken, varBareToken, insertVariableIntoElement } from '../formula/varInsert';

/**
 * 变量面板（PRD R4-07 增补）：常驻侧栏。
 * - 点击复制 {{变量}}（可切换为仅复制名称）
 * - 拖拽到任意输入框/文本域落点插入：{{ 外插完整 {{变量}}、{{ 内或表达式编辑器插裸名
 */

function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  // file:// 下 clipboard API 可能不可用 → 降级 execCommand
  return new Promise((resolve, reject) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      resolve();
    } catch (err) {
      reject(err instanceof Error ? err : new Error('copy failed'));
    } finally {
      document.body.removeChild(ta);
    }
  });
}

export default function VariablePanel() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState('');
  const [copyMode, setCopyMode] = useState<'full' | 'bare'>('full');
  const variables = useFormulaVariables();

  // 全局拖拽落点：允许把变量拖进任意 input/textarea（含公式编辑器），上下文感知插入
  useEffect(() => {
    const onDragOver = (e: DragEvent): void => {
      if (!e.dataTransfer?.types.includes('text/variable')) return;
      const t = e.target;
      if (t instanceof Element && t.closest('input, textarea')) e.preventDefault();
    };
    const onDrop = (e: DragEvent): void => {
      const name = e.dataTransfer?.getData('text/variable');
      if (!name) return;
      const t = e.target;
      const el = t instanceof Element ? t.closest<HTMLInputElement | HTMLTextAreaElement>('input, textarea') : null;
      if (!el) return;
      e.preventDefault();
      insertVariableIntoElement(el, name);
    };
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('drop', onDrop);
    return () => {
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('drop', onDrop);
    };
  }, []);

  const q = query.trim().toLowerCase();
  // 名称 / 拼音 / 说明都能命中（便于用「今天」「日期」搜到 today）
  const filtered = variables.filter(
    (v) => q === '' || v.name.toLowerCase().includes(q) || matchQuery(q, v.name) || (v.hint ?? '').toLowerCase().includes(q),
  );
  const grouped = groupVariables(filtered);

  const copy = async (name: string): Promise<void> => {
    const token = copyMode === 'bare' ? varBareToken(name) : varFullToken(name);
    try {
      await copyText(token);
      setCopied(name);
      setTimeout(() => setCopied(''), 1600);
    } catch {
      setCopied('');
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-7 shrink-0 flex-col items-center gap-1 border-l border-slate-200 bg-slate-50 py-3 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
        title="展开变量面板"
      >
        <span className="text-[12px] font-medium">ƒx</span>
        <span className="text-[11.5px]" style={{ writingMode: 'vertical-rl' }}>
          变量 · {variables.length}
        </span>
      </button>
    );
  }

  return (
    <aside className="flex w-[240px] shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-2.5 py-2">
        <span className="text-[12px] font-semibold text-slate-700">变量面板</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[12px] text-slate-400 hover:text-slate-600"
          title="收起"
        >
          »
        </button>
      </div>
      <div className="px-2.5 pt-2">
        <input
          className="w-full rounded border border-slate-300 px-2 py-1 text-[12px] outline-none focus:border-blue-400"
          placeholder="搜索（支持拼音首字母）"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="mt-1 flex items-center justify-between gap-1">
          <p className="text-[10.5px] leading-3 text-slate-400">点击复制 / 拖入输入框；{'{{'} 内拖入自动插裸名</p>
          <button
            type="button"
            onClick={() => setCopyMode((m) => (m === 'full' ? 'bare' : 'full'))}
            className="shrink-0 rounded border border-slate-300 px-1 py-0.5 text-[10.5px] text-slate-500 hover:border-blue-400 hover:text-blue-600"
            title="切换点击复制的格式"
          >
            {copyMode === 'full' ? '{{x}}' : 'x'}
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
        {grouped.length === 0 && <p className="text-[11.5px] text-slate-400">没有匹配的变量</p>}
        {grouped.map((g) => (
          <div key={g.group} className="mb-2">
            <p className="mb-1 text-[11.5px] font-semibold text-slate-400">{g.group}</p>
            <div className="space-y-0.5">
              {g.items.map((v) => (
                <button
                  key={v.name}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/variable', v.name);
                    e.dataTransfer.setData('text/plain', varFullToken(v.name));
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => void copy(v.name)}
                  title={`${v.name}${v.value !== undefined ? ` = ${displayVarValue(v)}` : ''}${v.hint ? ` · ${v.hint}` : ''}\n点击复制 / 拖入输入框插入`}
                  className={`flex w-full cursor-grab items-baseline gap-1 rounded px-1.5 py-1 text-left text-[12px] hover:bg-slate-100 active:cursor-grabbing ${
                    copied === v.name ? 'bg-emerald-50' : ''
                  }`}
                >
                  <span className={`min-w-0 flex-1 truncate font-medium ${GROUP_COLOR[v.group]}`}>
                    {copied === v.name ? '✓ 已复制' : v.name}
                  </span>
                  {v.value !== undefined && (
                    <span className="shrink-0 text-[10.5px] text-slate-400">{displayVarValue(v)}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
