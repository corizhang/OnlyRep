import type { ColumnMeta } from '../../types';
import type { CleanRow, CleanedTable } from '../../parser/clean';
import { getRawText, getVal } from '../../parser/clean';
import type { AggMethod, NamedScalars, NodeOutput, PipelineNode, ScalarValue } from '../types';
import { evaluateFormula } from './formula/eval';
import { parseDateValue } from './dates';

/**
 * 管道节点实现（ARCH §2）。全部为纯函数，不依赖 React / store。
 * 每个节点：inputs（上游输出）+ params → NodeOutput。
 */

export interface NodeRunContext {
  /** 全局标量环境（formula 节点读取；由引擎按拓扑增量维护） */
  vars: NamedScalars;
  /** 非阻断警告收集（日期解析失败行数等，对应 PRD E7） */
  warn: (msg: string) => void;
}

/** 聚合一组数值（scalarOut 用） */
export function aggValues(values: number[], method: AggMethod): number | null {
  if (values.length === 0) return method === 'count' ? 0 : null;
  switch (method) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0);
    case 'avg':
      return values.reduce((a, b) => a + b, 0) / values.length;
    case 'count':
      return values.length;
    case 'countDistinct':
      return new Set(values).size;
    case 'max':
      return values.reduce((a, b) => (b > a ? b : a), values[0]);
    case 'min':
      return values.reduce((a, b) => (b < a ? b : a), values[0]);
  }
}

/** 构造新表（保留列元信息，重算 totalRows） */
export function makeTable(rows: CleanRow[], columns: ColumnMeta[], excluded = 0): CleanedTable {
  return {
    rows,
    columns,
    totalRows: rows.length + excluded,
    excludedCount: excluded,
    dirtyCells: {},
  };
}

function makeColumn(key: string, name: string, type: ColumnMeta['type'] = 'number'): ColumnMeta {
  return {
    key,
    rawName: name,
    type,
    typeConfidence: 1,
    dirtyCount: 0,
    missingCount: 0,
    unitHint: '',
  };
}

/** 输出是否为表 */
export function asTable(out: NodeOutput | undefined): CleanedTable | null {
  return out && out.kind === 'table' ? out.table : null;
}

// ========== 节点执行 ==========

export function runNode(node: PipelineNode, inputs: NodeOutput[], ctx: NodeRunContext): NodeOutput {
  switch (node.type) {
    case 'filter':
      return runFilter(node, inputs);
    case 'pickRows':
      return runPickRows(node, inputs, ctx);
    case 'derive':
      return runDerive(node, inputs, ctx);
    case 'sortTopN':
      return runSortTopN(node, inputs);
    case 'groupAgg':
      return runGroupAgg(node, inputs);
    case 'scalarOut':
      return runScalarOut(node, inputs);
    case 'formula':
      return runFormula(node, ctx);
    default:
      return { kind: 'error', message: `未知节点类型：${node.type}` };
  }
}

function firstTable(inputs: NodeOutput[]): CleanedTable | { error: string } {
  const t = asTable(inputs[0]);
  if (!t) return { error: '上游没有表格输出' };
  return t;
}

type FilterOp = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'notEmpty' | 'empty';

function runFilter(node: PipelineNode, inputs: NodeOutput[]): NodeOutput {
  const t = firstTable(inputs);
  if ('error' in t) return { kind: 'error', message: t.error };
  const col = String(node.params.col ?? '');
  const op = String(node.params.op ?? 'eq') as FilterOp;
  const raw = node.params.value;
  if (!col) return { kind: 'table', table: t };

  const target = raw === undefined || raw === null ? '' : String(raw);
  const numTarget = Number(target.replace(/,/g, ''));

  const rows = t.rows.filter((r) => {
    const v = getVal(r, col);
    const text = getRawText(r, col) || (v === null ? '' : String(v));
    switch (op) {
      case 'notEmpty':
        return text.trim() !== '';
      case 'empty':
        return text.trim() === '';
      case 'contains':
        return text.includes(target);
      case 'eq':
        return String(v ?? '') === target || (Number.isFinite(numTarget) && v === numTarget);
      case 'ne':
        return !(String(v ?? '') === target || (Number.isFinite(numTarget) && v === numTarget));
      case 'gt':
        return typeof v === 'number' && Number.isFinite(numTarget) && v > numTarget;
      case 'gte':
        return typeof v === 'number' && Number.isFinite(numTarget) && v >= numTarget;
      case 'lt':
        return typeof v === 'number' && Number.isFinite(numTarget) && v < numTarget;
      case 'lte':
        return typeof v === 'number' && Number.isFinite(numTarget) && v <= numTarget;
      default:
        return true;
    }
  });

  return { kind: 'table', table: makeTable(rows, t.columns, t.excludedCount) };
}

function runPickRows(node: PipelineNode, inputs: NodeOutput[], ctx: NodeRunContext): NodeOutput {
  const t = firstTable(inputs);
  if ('error' in t) return { kind: 'error', message: t.error };
  const mode = String(node.params.mode ?? 'latestDate');
  const dateCol = String(node.params.dateCol ?? '');
  const n = Math.max(1, Math.round(Number(node.params.n ?? 1)) || 1);

  if (mode === 'all') return { kind: 'table', table: t };

  if (mode === 'latestDate') {
    if (!dateCol) return { kind: 'table', table: t };
    let max = -Infinity;
    let bad = 0;
    const parsed: (number | null)[] = t.rows.map((r) => {
      const d = parseDateValue(getVal(r, dateCol));
      if (!d) {
        bad += 1;
        return null;
      }
      return d.getTime();
    });
    for (const p of parsed) if (p !== null && p > max) max = p;
    if (max === -Infinity) {
      ctx.warn(`「${dateCol}」无法解析出日期，已保留全部 ${t.rows.length} 行`);
      return { kind: 'table', table: t };
    }
    const rows = t.rows.filter((_, i) => parsed[i] === max);
    if (bad > 0) ctx.warn(`日期列「${dateCol}」有 ${bad} 行解析失败，未参与「取最新日期」`);
    return { kind: 'table', table: makeTable(rows, t.columns, t.excludedCount) };
  }

  if (mode === 'firstN') {
    return { kind: 'table', table: makeTable(t.rows.slice(0, n), t.columns, t.excludedCount) };
  }
  if (mode === 'lastN') {
    return { kind: 'table', table: makeTable(t.rows.slice(-n), t.columns, t.excludedCount) };
  }
  return { kind: 'table', table: t };
}

function runDerive(node: PipelineNode, inputs: NodeOutput[], ctx: NodeRunContext): NodeOutput {
  const t = firstTable(inputs);
  if ('error' in t) return { kind: 'error', message: t.error };
  const name = String(node.params.name ?? '').trim();
  const expr = String(node.params.expr ?? '').trim();
  if (!name || !expr) return { kind: 'table', table: t };

  let failed = 0;
  const rows: CleanRow[] = t.rows.map((r) => {
    const rowVars: NamedScalars = {};
    for (const c of t.columns) rowVars[c.key] = getVal(r, c.key) as ScalarValue;
    for (const k of Object.keys(ctx.vars)) if (!(k in rowVars)) rowVars[k] = ctx.vars[k];

    const res = evaluateFormula(expr, { vars: ctx.vars, row: rowVars });
    let value: number | string | null = null;
    if (res.ok) {
      const v = res.value;
      value = typeof v === 'boolean' ? (v ? 1 : 0) : (v as number | string | null);
    } else {
      failed += 1;
    }
    const next: CleanRow = { ...r, [name]: value, [`${name}#raw`]: value === null ? '' : String(value) };
    return next;
  });

  if (failed > 0) ctx.warn(`派生列「${name}」有 ${failed} 行计算失败，已留空`);

  const columns = t.columns.some((c) => c.key === name)
    ? t.columns.map((c) => (c.key === name ? { ...c, type: 'number' as const } : c))
    : [...t.columns, makeColumn(name, name)];
  return { kind: 'table', table: makeTable(rows, columns, t.excludedCount) };
}

function runSortTopN(node: PipelineNode, inputs: NodeOutput[]): NodeOutput {
  const t = firstTable(inputs);
  if ('error' in t) return { kind: 'error', message: t.error };
  const col = String(node.params.col ?? '');
  const dir = node.params.dir === 'asc' ? 'asc' : 'desc';
  const n = Math.max(0, Math.round(Number(node.params.n ?? 0)) || 0);
  if (!col) return { kind: 'table', table: t };

  const asDate = node.params.asDate === true;
  const decorated = t.rows.map((r) => {
    const v = getVal(r, col);
    const key = asDate ? (parseDateValue(v)?.getTime() ?? NaN) : typeof v === 'number' ? v : NaN;
    return { r, key, text: getRawText(r, col) || (v === null ? '' : String(v)) };
  });

  decorated.sort((a, b) => {
    let cmp: number;
    if (Number.isFinite(a.key) && Number.isFinite(b.key)) {
      cmp = a.key - b.key;
    } else {
      cmp = a.text.localeCompare(b.text, 'zh-Hans-CN', { numeric: true });
    }
    return dir === 'asc' ? cmp : -cmp;
  });

  const rows = (n > 0 ? decorated.slice(0, n) : decorated).map((d) => d.r);
  return { kind: 'table', table: makeTable(rows, t.columns, t.excludedCount) };
}

function runGroupAgg(node: PipelineNode, inputs: NodeOutput[]): NodeOutput {
  const t = firstTable(inputs);
  if ('error' in t) return { kind: 'error', message: t.error };
  const groupCol = String(node.params.groupCol ?? '');
  if (!groupCol) return { kind: 'table', table: t };

  const aggs = Array.isArray(node.params.aggs)
    ? (node.params.aggs as { col?: unknown; method?: unknown; as?: unknown }[])
    : [];
  const specs = aggs
    .map((a) => ({
      col: String(a.col ?? ''),
      method: String(a.method ?? 'sum') as AggMethod,
      as: String(a.as ?? a.col ?? ''),
    }))
    .filter((a) => a.col !== '');

  const groups = new Map<string, CleanRow[]>();
  for (const r of t.rows) {
    const key = String(getVal(r, groupCol) ?? '(空)');
    const bucket = groups.get(key);
    if (bucket) bucket.push(r);
    else groups.set(key, [r]);
  }

  const columns: ColumnMeta[] = [makeColumn(groupCol, groupCol, 'text'), ...specs.map((s) => makeColumn(s.as, s.as))];
  const rows: CleanRow[] = [];
  let idx = 0;
  for (const [key, rs] of groups) {
    const row: CleanRow = { __idx: idx++, [groupCol]: key, [`${groupCol}#raw`]: key };
    for (const s of specs) {
      const vals = rs.map((r) => getVal(r, s.col)).filter((v): v is number => typeof v === 'number');
      const v = aggValues(vals, s.method);
      row[s.as] = v;
      row[`${s.as}#raw`] = v === null ? '' : String(v);
    }
    rows.push(row);
  }

  return { kind: 'table', table: makeTable(rows, columns, 0) };
}

function runScalarOut(node: PipelineNode, inputs: NodeOutput[]): NodeOutput {
  const t = firstTable(inputs);
  if ('error' in t) return { kind: 'error', message: t.error };
  const col = String(node.params.col ?? '');
  const method = String(node.params.method ?? 'sum') as AggMethod;
  if (!col) return { kind: 'error', message: '未选择取数列' };

  const vals = t.rows.map((r) => getVal(r, col)).filter((v): v is number => typeof v === 'number');
  return { kind: 'scalar', value: aggValues(vals, method) };
}

function runFormula(node: PipelineNode, ctx: NodeRunContext): NodeOutput {
  const expr = String(node.params.expr ?? '').trim();
  if (expr === '') return { kind: 'error', message: '公式为空' };
  const res = evaluateFormula(expr, { vars: ctx.vars });
  if (!res.ok) return { kind: 'error', message: res.error };
  return { kind: 'scalar', value: res.value };
}
