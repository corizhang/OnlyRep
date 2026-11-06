import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import FormulaInput, { GROUP_COLOR, useFormulaVariables, wrapVarName, type FormulaInputHandle } from './FormulaInput';
import { FUNC_DOCS, FUNC_CATEGORIES } from './funcDocs';
import { displayVarValue, groupVariables, type FormulaVariable } from './variableEnv';
import { matchQuery } from './pinyin';

/**
 * 公式编辑弹窗（飞书/Notion 式，第二版）：
 * - 顶部大输入区（多行、13.5px、语法高亮、实时预览 = 值）
 * - 下方双栏：左 = 可搜索的「变量 / 函数」Tab 列表（点击插入）；右 = 选中项详情（签名、说明、示例）
 * - 底部：取消 / 保存（草稿模式，保存才应用并重算）
 * - createPortal 到 body，避免画布 zoom/transform 影响 fixed 定位
 */

type Tab = 'vars' | 'fns';

export default function FormulaEditorModal({
  open,
  title,
  value,
  rowColumns,
  rowSample,
  onOk,
  onClose,
}: {
  open: boolean;
  title: string;
  value: string;
  /** 行公式场景的上游列（derive） */
  rowColumns?: { key: string; label: string }[];
  /** 行公式预览样本 */
  rowSample?: Record<string, unknown>;
  onOk: (expr: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [tab, setTab] = useState<Tab>('vars');
  const [query, setQuery] = useState('');
  const [selVar, setSelVar] = useState<FormulaVariable | null>(null);
  const [selFn, setSelFn] = useState<string | null>(null);
  const editorRef = useRef<FormulaInputHandle>(null);
  const variables = useFormulaVariables(rowColumns);

  // 每次打开时以当前公式为草稿起点
  useEffect(() => {
    if (open) {
      setDraft(value);
      setQuery('');
      setSelVar(null);
      setSelFn(null);
      // 打开即聚焦输入区（光标落到公式末尾，点插入更顺手）
      requestAnimationFrame(() => editorRef.current?.focus());
    }
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // 搜索过滤（变量支持中文/拼音）
  const varGroups = useMemo(() => {
    const q = query.trim();
    const list = q === '' ? variables : variables.filter((v) => matchQuery(q, v.name));
    return groupVariables(list);
  }, [variables, query]);

  const fnList = useMemo(() => {
    const q = query.trim().toLowerCase();
    const names = Object.keys(FUNC_DOCS).filter((n) => q === '' || n.toLowerCase().includes(q));
    return FUNC_CATEGORIES.map((c) => ({ cat: c, items: names.filter((n) => FUNC_DOCS[n].cat === c) })).filter((g) => g.items.length > 0);
  }, [query]);

  if (!open) return null;

  const insert = (text: string): void => editorRef.current?.insertText(text);

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-[640px] max-h-[88vh] w-[860px] max-w-full flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        {/* 标题栏 */}
        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3">
          <span className="text-[15px] font-semibold text-slate-800">编辑公式</span>
          <span className="min-w-0 truncate rounded bg-slate-100 px-2 py-0.5 text-[12px] text-slate-500" title={title}>
            {title}
          </span>
          <button
            type="button"
            className="ml-auto rounded px-1.5 text-[18px] leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            onClick={onClose}
            title="关闭（Esc）"
          >
            ×
          </button>
        </div>

        {/* 大输入区（飞书式） */}
        <div className="px-5 pt-4">
          <FormulaInput
            ref={editorRef}
            value={draft}
            onChange={setDraft}
            variables={variables}
            rowSample={rowSample}
            multiline
            size="lg"
            placeholder="输入公式，如：ROUND((年绑卡指标-累计完成绑卡人数)/剩余日期, 2)"
          />
        </div>

        {/* 变量 / 函数浏览区 */}
        <div className="mt-4 flex min-h-0 flex-1 border-t border-slate-200">
          {/* 左栏：Tab + 搜索 + 列表 */}
          <div className="flex w-[320px] shrink-0 flex-col border-r border-slate-200">
            <div className="flex items-center gap-4 border-b border-slate-100 px-4 pt-2.5">
              {(
                [
                  { key: 'vars', label: '变量' },
                  { key: 'fns', label: '函数' },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`-mb-px border-b-2 pb-2 text-[13px] font-medium ${tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                  {t.label}
                </button>
              ))}
              <div className="ml-auto flex-1 pb-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={tab === 'vars' ? '搜索变量（支持拼音）' : '搜索函数'}
                  className="w-full rounded-md border border-slate-200 px-2 py-1 text-[12px] outline-none focus:border-blue-400"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {tab === 'vars' &&
                varGroups.map((g) => (
                  <div key={g.group} className="mb-2">
                    <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium text-slate-400">
                      {g.group} · {g.items.length}
                    </p>
                    {g.items.map((v) => (
                      <button
                        key={v.name}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setSelVar(v);
                          insert(wrapVarName(v.name));
                        }}
                        onMouseEnter={() => setSelVar(v)}
                        className={`flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-slate-50 ${selVar?.name === v.name ? 'bg-blue-50' : ''}`}
                      >
                        <span className={`min-w-0 flex-1 truncate font-medium ${GROUP_COLOR[v.group]}`}>{v.name}</span>
                        {v.value !== undefined && <span className="shrink-0 text-[11.5px] text-slate-400">= {displayVarValue(v)}</span>}
                      </button>
                    ))}
                  </div>
                ))}
              {tab === 'vars' && varGroups.length === 0 && <p className="px-2 py-6 text-center text-[12px] text-slate-400">没有匹配的变量</p>}

              {tab === 'fns' &&
                fnList.map((g) => (
                  <div key={g.cat} className="mb-2">
                    <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium text-slate-400">{g.cat}</p>
                    {g.items.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setSelFn(n);
                          insert(`${n}(`);
                        }}
                        onMouseEnter={() => setSelFn(n)}
                        className={`flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-slate-50 ${selFn === n ? 'bg-blue-50' : ''}`}
                      >
                        <span className="font-medium text-purple-600">{n}</span>
                        <span className="min-w-0 flex-1 truncate text-[11.5px] text-slate-400">{FUNC_DOCS[n].sig}</span>
                      </button>
                    ))}
                  </div>
                ))}
              {tab === 'fns' && fnList.length === 0 && <p className="px-2 py-6 text-center text-[12px] text-slate-400">没有匹配的函数</p>}
            </div>
          </div>

          {/* 右栏：详情（飞书式函数说明面板） */}
          <div className="min-w-0 flex-1 overflow-y-auto p-4">
            {tab === 'fns' && selFn ? (
              <div>
                <p className="text-[14px] font-semibold text-slate-800">
                  {selFn}
                  <span className="ml-1.5 text-[12px] font-normal text-slate-400">{FUNC_DOCS[selFn].cat}</span>
                </p>
                <code className="mt-1.5 block rounded-md bg-slate-100 px-2.5 py-1.5 text-[12.5px] text-purple-700">{FUNC_DOCS[selFn].sig}</code>
                <p className="mt-3 text-[12.5px] leading-relaxed text-slate-600">{FUNC_DOCS[selFn].desc}</p>
                <p className="mt-4 text-[11.5px] font-semibold text-slate-500">示例</p>
                <pre className="mt-1.5 whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-[12px] leading-relaxed text-slate-600">{FUNC_DOCS[selFn].example}</pre>
                <button
                  type="button"
                  className="mt-3 rounded-md bg-blue-600 px-3 py-1 text-[12px] font-medium text-white hover:bg-blue-700"
                  onClick={() => insert(`${selFn}(`)}
                >
                  插入函数
                </button>
              </div>
            ) : tab === 'vars' && selVar ? (
              <div>
                <p className="text-[14px] font-semibold text-slate-800">
                  {selVar.name}
                  <span className="ml-1.5 text-[12px] font-normal text-slate-400">{selVar.group}</span>
                </p>
                {selVar.value !== undefined && (
                  <p className="mt-2 text-[13px] text-slate-600">
                    当前值 <b className="ml-1 text-emerald-600">{displayVarValue(selVar)}</b>
                  </p>
                )}
                {selVar.hint && <p className="mt-2 text-[12.5px] leading-relaxed text-slate-500">{selVar.hint}</p>}
                <button
                  type="button"
                  className="mt-4 rounded-md bg-blue-600 px-3 py-1 text-[12px] font-medium text-white hover:bg-blue-700"
                  onClick={() => insert(wrapVarName(selVar.name))}
                >
                  插入变量
                </button>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-[12.5px] text-slate-300">
                {tab === 'fns' ? '把光标移到函数上查看说明与示例' : '把光标移到变量上查看取值与来源'}
              </div>
            )}
          </div>
        </div>

        {/* 底部操作 */}
        <div className="flex items-center gap-2 border-t border-slate-200 px-5 py-3">
          <span className="text-[12px] text-slate-400">点击变量/函数插入到光标处；修改先以草稿预览，点「保存」后应用并重新计算。</span>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              className="rounded-md border border-slate-300 px-3.5 py-1.5 text-[13px] text-slate-600 hover:bg-slate-50"
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="button"
              className="rounded-md bg-blue-600 px-4 py-1.5 text-[13px] font-medium text-white hover:bg-blue-700"
              onClick={() => {
                onOk(draft);
                onClose();
              }}
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
