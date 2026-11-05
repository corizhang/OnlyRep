import type { CleanedTable } from '../../parser/clean';
import type {
  DataSource,
  FieldBinding,
  NamedScalars,
  NodeOutput,
  NumberFormat,
  ResolvedField,
  ScalarValue,
  TableBinding,
} from '../types';
import { evaluateFormula } from '../pipeline/formula/eval';
import { parseScalar } from '../pipeline/engine';
import { formatValue } from '../../compute/format';

/**
 * 绑定解析（ARCH §5.4）：绑定 → 值。失联/错误一律以状态返回，不抛异常（PRD E1/E2/E3）。
 */

export interface ResolveContext {
  outputs: Record<string, NodeOutput>;
  env: NamedScalars;
  sources: DataSource[];
}

export function resolveField(binding: FieldBinding | undefined, ctx: ResolveContext): ResolvedField {
  if (!binding || binding.kind === 'none') return { kind: 'missing', reason: '未绑定' };

  switch (binding.kind) {
    case 'node': {
      const out = ctx.outputs[binding.nodeRef];
      if (!out) return { kind: 'missing', reason: '引用的节点不存在' };
      if (out.kind === 'scalar') return { kind: 'value', value: out.value };
      if (out.kind === 'scalars') return { kind: 'missing', reason: '该节点未产出单个数值' };
      if (out.kind === 'table') return { kind: 'missing', reason: '该节点输出的是表格，不是数值' };
      return { kind: 'error', message: out.message };
    }
    case 'form': {
      const src = ctx.sources.find((s) => s.id === binding.sourceRef);
      if (!src || src.kind !== 'form') return { kind: 'missing', reason: '表单源已删除' };
      const entry = src.entries.find((e) => e.key.trim() === binding.key);
      if (!entry) return { kind: 'missing', reason: `表单项「${binding.key}」不存在` };
      return { kind: 'value', value: parseScalar(entry.value) };
    }
    case 'constant': {
      const src = ctx.sources.find((s) => s.id === binding.sourceRef);
      if (!src || src.kind !== 'constant') return { kind: 'missing', reason: '常量源已删除' };
      return { kind: 'value', value: parseScalar(src.value) };
    }
    case 'formula': {
      const res = evaluateFormula(binding.expr, { vars: ctx.env });
      return res.ok ? { kind: 'value', value: res.value } : { kind: 'error', message: res.error };
    }
  }
}

/** 表格绑定 → CleanedTable（失联时返回 reason 供占位提示） */
export function resolveTable(
  binding: TableBinding | undefined,
  ctx: ResolveContext,
): { table: CleanedTable } | { reason: string } {
  if (!binding || !binding.nodeRef) return { reason: '未绑定表格' };
  const out = ctx.outputs[binding.nodeRef];
  if (!out) return { reason: '引用的节点不存在' };
  if (out.kind === 'table') return { table: out.table };
  if (out.kind === 'error') return { reason: out.message };
  return { reason: '该节点输出的不是表格' };
}

/** 已解析值 → 展示文本（数字走 FormatOpts，含百分号/千分位/前后缀） */
export function formatResolved(
  res: ResolvedField,
  fmt: NumberFormat,
  colUnit = '',
): { text: string; state: 'ok' | 'missing' | 'error'; message?: string } {
  if (res.kind === 'missing') return { text: '—', state: 'missing', message: res.reason };
  if (res.kind === 'error') return { text: '—', state: 'error', message: res.message };

  const v = res.value;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return { text: '—', state: 'error', message: '数值无效' };
    const num = formatValue(v, fmt, colUnit);
    return { text: `${num}${fmt.suffix ?? ''}`, state: 'ok' };
  }
  if (typeof v === 'boolean') return { text: v ? '是' : '否', state: 'ok' };
  if (v === null) return { text: '—', state: 'missing', message: '空值' };
  return { text: String(v), state: 'ok' };
}

/** 取数值（非数值回 null），供进度条等计算型组件用 */
export function numericOf(res: ResolvedField): number | null {
  if (res.kind !== 'value') return null;
  const v = res.value;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = Number(v.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** 绑定的人类可读描述（配置面板回显） */
export function describeBinding(
  binding: FieldBinding | undefined,
  ctx: { outputs: Record<string, NodeOutput>; sources: DataSource[]; graphNodes: { id: string; name: string }[] },
): string {
  if (!binding || binding.kind === 'none') return '未绑定';
  switch (binding.kind) {
    case 'node': {
      const name = ctx.graphNodes.find((n) => n.id === binding.nodeRef)?.name;
      return name ? `变量 · ${name}` : '节点已删除';
    }
    case 'form': {
      const src = ctx.sources.find((s) => s.id === binding.sourceRef);
      return `表单 · ${src?.name ?? '已删除'} / ${binding.key}`;
    }
    case 'constant': {
      const src = ctx.sources.find((s) => s.id === binding.sourceRef);
      return `常量 · ${src?.name ?? '已删除'}`;
    }
    case 'formula':
      return `公式 · ${binding.expr}`;
  }
}

/** 标量环境里的可用变量（绑定选择器列表用） */
export function availableScalars(env: NamedScalars): { key: string; value: ScalarValue }[] {
  return Object.keys(env)
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
    .map((key) => ({ key, value: env[key] }));
}
