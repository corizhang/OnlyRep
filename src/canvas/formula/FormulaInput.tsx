import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCanvasStore } from '../../store/useCanvasStore';
import { FormulaError } from '../pipeline/formula/lexer';
import { parseFormula } from '../pipeline/formula/parser';
import { evaluateFormula } from '../pipeline/formula/eval';
import { FUNC_DOCS, FUNC_CATEGORIES, suggestFunction } from './funcDocs';
import { matchQuery } from './pinyin';
import { collectVariables, displayVarValue, groupVariables, type FormulaVariable } from './variableEnv';

/**
 * 公式编辑器（PRD R11）：Notion/飞书式体验的零依赖实现。
 * 架构 = 透明 textarea + 高亮叠层（CodeMirror 早期同款），
 * 规避 contenteditable 中文输入法坑（ARCH D25）。
 */

export const GROUP_COLOR: Record<FormulaVariable['group'], string> = {
  参数: 'text-blue-600',
  常量: 'text-cyan-700',
  取数: 'text-orange-600',
  计算字段: 'text-emerald-600',
  列: 'text-violet-600',
  合计: 'text-rose-600',
  系统: 'text-sky-600',
};

const FONT_CLS = 'text-[11px] leading-5';

const IDENT_RE = /[A-Za-z_\u4e00-\u9fa5][A-Za-z0-9_\u4e00-\u9fa5]*/;
const isIdentChar = (ch: string): boolean => /[A-Za-z0-9_\u4e00-\u9fa5]/.test(ch);

/** 高亮分段（显示专用，与 lexer 白名单同规则但永不抛错） */
interface Span {
  text: string;
  cls: string;
  pos: number;
}

function highlightSpans(src: string, vars: Map<string, FormulaVariable>): Span[] {
  const spans: Span[] = [];
  const re =
    /(\[[^\][]*\])|('[^']*'|"[^"]*")|(\d+(?:\.\d+)?)|([A-Za-z_\u4e00-\u9fa5][A-Za-z0-9_\u4e00-\u9fa5]*)|(>=|<=|==|!=|<>|&&|\|\||[+\-*/><=!%(),])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) spans.push({ text: src.slice(last, m.index), cls: 'text-slate-600', pos: last });
    const [raw, bracket, str, num, ident, op] = m;
    let cls = 'text-slate-500';
    if (bracket) cls = 'text-violet-600';
    else if (str) cls = 'text-amber-700';
    else if (num) cls = 'text-teal-700';
    else if (ident) {
      const after = src.slice(m.index + raw.length);
      if (/^\s*\(/.test(after)) cls = 'text-purple-600';
      else {
        // 系统固定变量大小写不敏感（Today / TODAY 都算命中）
        const v = vars.get(ident) ?? vars.get(ident.toLowerCase());
        cls = v ? GROUP_COLOR[v.group] : 'text-red-500';
      }
    } else if (op && '()+-*/%'.includes(raw)) cls = 'text-slate-400';
    spans.push({ text: raw, cls, pos: m.index });
    last = m.index + raw.length;
  }
  if (last < src.length) spans.push({ text: src.slice(last), cls: 'text-slate-600', pos: last });
  return spans;
}

export function wrapVarName(name: string): string {
  return IDENT_RE.test(name) && !/^[0-9]/.test(name) ? name : `[${name}]`;
}

/** 从 store 组装公式变量（行公式场景传入上游列；含合计行变量） */
export function useFormulaVariables(rowColumns?: { key: string; label: string }[]): FormulaVariable[] {
  const config = useCanvasStore((s) => s.config);
  const outputs = useCanvasStore((s) => s.outputs);
  const blockTotalVars = useCanvasStore((s) => s.blockTotalVars);
  return useMemo(
    () => collectVariables(config, outputs, rowColumns, blockTotalVars),
    [config, outputs, rowColumns, blockTotalVars],
  );
}

interface AcItem {
  kind: 'var' | 'fn';
  insert: string;
  label: string;
  sub: string;
  title: string;
}

export default function FormulaInput({
  value,
  onChange,
  variables = [],
  rowSample,
  multiline = false,
  placeholder = '输入公式，如：已完成/全年目标',
}: {
  value: string;
  onChange: (v: string) => void;
  /** 变量池（用 useFormulaVariables() 组装；缺省仅提示函数） */
  variables?: FormulaVariable[];
  /** 行公式预览样本（上游表第一行；缺省按无行上下文预览） */
  rowSample?: Record<string, unknown>;
  multiline?: boolean;
  placeholder?: string;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const hlRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const composingRef = useRef(false);
  const [ac, setAc] = useState<{ start: number; end: number; items: AcItem[]; index: number } | null>(null);
  const [popupLeft, setPopupLeft] = useState(0);
  const [expanded, setExpanded] = useState(() => new URLSearchParams(window.location.search).has('fx'));

  const varMap = useMemo(() => new Map(variables.map((v) => [v.name, v])), [variables]);
  const envVars = useMemo(() => {
    const env: Record<string, unknown> = {};
    for (const v of variables) if (v.value !== undefined) env[v.name] = v.value;
    return env;
  }, [variables]);

  // ---- 实时校验（仅语法/白名单，红色波浪线；语义错误走预览区灰色提示） ----
  const validation = useMemo(() => {
    const text = value.trim();
    if (text === '') return null;
    try {
      parseFormula(text);
      return null;
    } catch (err) {
      if (err instanceof FormulaError) {
        const offset = value.length - value.trimStart().length;
        const pos = err.pos >= 0 ? err.pos + offset : undefined;
        const fn = pos !== undefined ? /不支持函数「([^」]+)」/.exec(err.message) : null;
        const suggest = fn ? suggestFunction(fn[1]) : null;
        return { message: err.message, pos, badFn: fn ? fn[1] : null, suggest };
      }
      return { message: '公式无法解析', pos: undefined, badFn: null, suggest: null };
    }
  }, [value]);

  // ---- 实时预览 ----
  const preview = useMemo(() => {
    const text = value.trim();
    if (text === '') return null;
    const res = evaluateFormula(text, { vars: envVars as never, row: rowSample as never });
    if (!res.ok) return null;
    const v = res.value;
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 10000) / 10000);
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (v === null) return '空';
    return String(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, envVars, rowSample]);

  const spans = useMemo(() => highlightSpans(value, varMap), [value, varMap]);

  // ---- 自动补全 ----
  const buildItems = useCallback(
    (prefix: string): AcItem[] => {
      const vars: AcItem[] = variables
        .filter((v) => matchQuery(prefix, v.name))
        .slice(0, 12)
        .map((v) => ({
          kind: 'var',
          insert: wrapVarName(v.name),
          label: v.name,
          sub: v.group,
          title: `${v.hint ?? ''}${v.value !== undefined ? ` = ${displayVarValue(v)}` : ''}`,
        }));
      const q = prefix.toLowerCase();
      const fns: AcItem[] = FUNC_CATEGORIES.flatMap((c) =>
        Object.keys(FUNC_DOCS)
          .filter((n) => FUNC_DOCS[n].cat === c && n.toLowerCase().includes(q))
          .map((n) => ({
            kind: 'fn',
            insert: `${n}(`,
            label: n,
            sub: FUNC_DOCS[n].sig,
            title: `${FUNC_DOCS[n].desc}\n例：${FUNC_DOCS[n].example}`,
          })),
      );
      return [...vars, ...fns].slice(0, 8);
    },
    [variables],
  );

  const refreshAc = useCallback(
    (caret: number) => {
      const ta = taRef.current;
      if (!ta || composingRef.current) return setAc(null);
      let start = caret;
      while (start > 0 && isIdentChar(value[start - 1])) start -= 1;
      const prefix = value.slice(start, caret);
      if (prefix === '') return setAc(null);
      const items = buildItems(prefix);
      if (items.length === 0) return setAc(null);
      // 光标水平定位（测量前缀宽度）
      const ms = measureRef.current;
      if (ms) {
        ms.textContent = value.slice(0, start);
        setPopupLeft(Math.max(0, Math.min(ms.offsetWidth, (hlRef.current?.clientWidth ?? 300) - 250)));
      }
      setAc({ start, end: caret, items, index: 0 });
    },
    [value, buildItems],
  );

  const applyInsert = useCallback(
    (insert: string, start: number, end: number) => {
      const ta = taRef.current;
      const next = value.slice(0, start) + insert + value.slice(end);
      setAc(null);
      onChange(next);
      const caret = start + insert.length;
      requestAnimationFrame(() => {
        ta?.focus();
        ta?.setSelectionRange(caret, caret);
      });
    },
    [value, onChange],
  );

  const insertAtCaret = useCallback(
    (insert: string) => {
      const ta = taRef.current;
      if (!ta) return;
      const caret = ta.selectionStart ?? value.length;
      let start = caret;
      while (start > 0 && isIdentChar(value[start - 1])) start -= 1;
      applyInsert(insert, start, caret);
    },
    [value, applyInsert],
  );

  const syncScroll = (): void => {
    if (hlRef.current && taRef.current) {
      hlRef.current.scrollTop = taRef.current.scrollTop;
    }
  };

  const autoGrow = (): void => {
    const ta = taRef.current;
    if (ta && !multiline) {
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight}px`;
    }
  };

  useEffect(autoGrow, [value, multiline]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (composingRef.current) return;
    if (ac) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAc({ ...ac, index: (ac.index + 1) % ac.items.length });
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAc({ ...ac, index: (ac.index - 1 + ac.items.length) % ac.items.length });
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const item = ac.items[ac.index];
        applyInsert(item.insert, ac.start, ac.end);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setAc(null);
        return;
      }
    }
  };

  const showErrorLine = validation !== null;

  return (
    <div className="rounded border border-slate-300 bg-white focus-within:border-blue-400">
      {/* 输入区：高亮层 + 透明 textarea */}
      <div className="relative flex items-start">
        <div className="relative min-h-[24px] flex-1 overflow-hidden">
          <div ref={hlRef} className={`pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap px-2 py-1 ${FONT_CLS}`} aria-hidden>
            {spans.map((s, i) => (
              <span
                key={i}
                className={s.cls}
                style={
                  validation?.pos !== undefined && s.pos <= validation.pos && validation.pos < s.pos + s.text.length
                    ? { textDecoration: 'underline wavy #dc2626', textUnderlineOffset: 2 }
                    : undefined
                }
              >
                {s.text || ' '}
              </span>
            ))}
            {value === '' && <span className="text-slate-300">{placeholder}</span>}
          </div>
          <textarea
            ref={taRef}
            value={value}
            rows={multiline ? 3 : 1}
            spellCheck={false}
            data-var-scope="expr"
            className={`absolute inset-0 h-full w-full resize-none whitespace-pre-wrap bg-transparent px-2 py-1 text-transparent caret-slate-700 outline-none selection:bg-blue-200 ${FONT_CLS}`}
            onChange={(e) => {
              onChange(e.target.value);
              refreshAc(e.target.selectionStart ?? 0);
            }}
            onKeyUp={(e) => {
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) refreshAc(taRef.current?.selectionStart ?? 0);
            }}
            onClick={() => refreshAc(taRef.current?.selectionStart ?? 0)}
            onKeyDown={onKeyDown}
            onScroll={syncScroll}
            onCompositionStart={() => (composingRef.current = true)}
            onCompositionEnd={(e) => {
              composingRef.current = false;
              refreshAc((e.target as HTMLTextAreaElement).selectionStart ?? 0);
            }}
          />
        </div>
        {/* 预览值 */}
        {preview !== null && (
          <span className="mt-1 shrink-0 whitespace-nowrap pr-2 text-[10px] font-medium text-emerald-600" title="按当前环境实时预览">
            = {preview}
          </span>
        )}
        <button
          type="button"
          title={expanded ? '收起变量与函数面板' : '展开变量与函数面板'}
          className={`m-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${expanded ? 'bg-blue-100 text-blue-700' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}
          onClick={() => setExpanded(!expanded)}
        >
          ƒx
        </button>
        <span ref={measureRef} className={`invisible absolute whitespace-pre ${FONT_CLS}`} aria-hidden />
      </div>

      {/* 校验信息行 */}
      {showErrorLine ? (
        <div className="flex items-center gap-2 border-t border-red-100 bg-red-50 px-2 py-1 text-[10px] text-red-600">
          <span className="min-w-0 flex-1 truncate" title={validation?.message}>
            {validation?.message}
          </span>
          {validation?.suggest && validation.badFn && (
            <button
              type="button"
              className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-700 hover:bg-red-200"
              onClick={() => {
                const offset = value.length - value.trimStart().length;
                const p = (validation.pos ?? 0) - offset;
                applyInsert(validation.suggest as string, p, p + (validation.badFn as string).length);
              }}
            >
              改为 {validation.suggest}？
            </button>
          )}
        </div>
      ) : (
        ac === null && <div className="px-2 py-0.5 text-[9px] leading-3 text-slate-300">ƒ 输入触发补全 · ↑↓ 选择 · Enter 插入 · 点 ƒx 展开变量面板</div>
      )}

      {/* 补全弹层 */}
      {ac && (
        <div className="absolute z-30 mt-0.5 w-[250px] rounded-md border border-slate-200 bg-white py-1 shadow-lg" style={{ marginLeft: popupLeft }}>
          {ac.items.map((item, i) => (
            <button
              key={`${item.kind}:${item.label}`}
              type="button"
              className={`flex w-full items-baseline gap-1.5 px-2 py-1 text-left text-[11px] ${i === ac.index ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
              onMouseDown={(e) => {
                e.preventDefault();
                applyInsert(item.insert, ac.start, ac.end);
              }}
              onMouseEnter={() => setAc({ ...ac, index: i })}
            >
              <span className={`font-medium ${item.kind === 'fn' ? 'text-purple-600' : GROUP_COLOR[(varMap.get(item.label)?.group ?? '参数') as never]}`}>
                {item.label}
              </span>
              <span className="min-w-0 flex-1 truncate text-[9px] text-slate-400">{item.sub}</span>
              {item.kind === 'var' && <span className="shrink-0 text-[9px] text-slate-400">{varMap.get(item.label)?.group}</span>}
            </button>
          ))}
        </div>
      )}

      {/* ƒx 面板：变量树 + 函数字典 */}
      {expanded && (
        <div className="grid max-h-52 grid-cols-2 overflow-y-auto border-t border-slate-200 text-[10px]">
          <div className="border-r border-slate-100 p-1.5">
            <p className="pb-1 text-[9px] font-semibold text-slate-400">变量（点击插入）</p>
            {groupVariables(variables).map((b) => (
              <div key={b.group}>
                <p className="pt-1 text-[9px] text-slate-400">
                  {b.group} · {b.items.length}
                </p>
                {b.items.map((v) => (
                  <button
                    key={v.name}
                    type="button"
                    className="block w-full truncate rounded px-1 py-0.5 text-left hover:bg-slate-50"
                    title={`${v.hint ?? ''}${v.value !== undefined ? `\n当前值 = ${displayVarValue(v)}` : ''}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertAtCaret(wrapVarName(v.name));
                    }}
                  >
                    <span className={`font-medium ${GROUP_COLOR[v.group]}`}>{v.name}</span>
                    {v.value !== undefined && <span className="ml-1 text-slate-400">= {displayVarValue(v)}</span>}
                  </button>
                ))}
              </div>
            ))}
            {variables.length === 0 && <p className="py-1 text-slate-300">暂无可用变量</p>}
          </div>
          <div className="p-1.5">
            <p className="pb-1 text-[9px] font-semibold text-slate-400">函数（点击插入）</p>
            {FUNC_CATEGORIES.map((c) => (
              <div key={c}>
                <p className="pt-1 text-[9px] text-slate-400">{c}</p>
                {Object.keys(FUNC_DOCS)
                  .filter((n) => FUNC_DOCS[n].cat === c)
                  .map((n) => (
                    <button
                      key={n}
                      type="button"
                      className="block w-full truncate rounded px-1 py-0.5 text-left hover:bg-slate-50"
                      title={`${FUNC_DOCS[n].desc}\n例：${FUNC_DOCS[n].example}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        insertAtCaret(`${n}(`);
                      }}
                    >
                      <span className="font-medium text-purple-600">{n}</span>
                      <span className="ml-1 text-slate-400">{FUNC_DOCS[n].sig}</span>
                    </button>
                  ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
