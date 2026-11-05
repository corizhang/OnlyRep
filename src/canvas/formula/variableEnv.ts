import type { CanvasConfig, NodeOutput, ScalarValue } from '../types';
import { BUILTIN_VAR_DEFS, builtinVars } from './builtinVars';

/**
 * 公式变量收集（公式编辑器左侧变量树 + 自动补全 + 高亮分组的数据源）。
 * 与 engine.runGraph 的 env 构建口径一致：表单条目名 / 常量源名 /
 * 取数节点显名 / 计算字段显名，同名先到先得（与 env 覆盖顺序一致）。
 * 「系统」组是实时计算的固定变量（today / now …），由求值层兜底，不进 env。
 */

export type VarGroup = '参数' | '常量' | '取数' | '计算字段' | '列' | '合计' | '系统';

export interface FormulaVariable {
  name: string;
  group: VarGroup;
  /** 当前值（行内列没有） */
  value?: ScalarValue;
  /** 来源说明（悬停提示） */
  hint?: string;
}

function scalarOf(output: NodeOutput | undefined): ScalarValue | undefined {
  return output && output.kind === 'scalar' ? output.value : undefined;
}

export function collectVariables(
  config: CanvasConfig,
  outputs: Record<string, NodeOutput>,
  rowColumns?: { key: string; label: string }[],
  blockTotals?: FormulaVariable[],
): FormulaVariable[] {
  const out: FormulaVariable[] = [];
  const seen = new Set<string>();
  const push = (name: string, group: VarGroup, value: ScalarValue | undefined, hint: string): void => {
    const n = name.trim();
    if (n === '' || seen.has(n)) return;
    seen.add(n);
    out.push({ name: n, group, value, hint });
  };

  for (const s of config.dataSources) {
    if (s.kind === 'form') {
      for (const e of s.entries) push(e.key, '参数', undefined, `表单 · ${s.name}`);
    } else if (s.kind === 'constant') {
      push(s.name, '常量', undefined, '常量源');
    }
  }
  for (const n of config.pipeline.nodes) {
    if (!n.enabled) continue;
    if (n.type === 'scalarOut') push(n.name, '取数', scalarOf(outputs[n.id]), '取数节点（对列聚合）');
    else if (n.type === 'formula') push(n.name, '计算字段', scalarOf(outputs[n.id]), '计算字段');
  }
  for (const c of rowColumns ?? []) push(c.label, '列', undefined, '上游表格列（仅行公式内可用）');
  for (const v of blockTotals ?? []) push(v.name, '合计', v.value, v.hint ?? '');

  // 系统固定变量：值由当前时刻实时计算；同名用户变量已占用则跳过（用户优先）
  const sys = builtinVars();
  for (const def of BUILTIN_VAR_DEFS) push(def.name, '系统', sys[def.name], `${def.label} · ${def.hint}`);
  return out;
}

/** 变量按组分桶（保持 collectVariables 的组顺序） */
export function groupVariables(vars: FormulaVariable[]): { group: VarGroup; items: FormulaVariable[] }[] {
  const order: VarGroup[] = ['参数', '常量', '取数', '计算字段', '列', '合计', '系统'];
  return order
    .map((group) => ({ group, items: vars.filter((v) => v.group === group) }))
    .filter((b) => b.items.length > 0);
}

/** 变量值展示（悬停/预览用） */
export function displayVarValue(v: FormulaVariable | undefined): string {
  if (!v || v.value === undefined) return '';
  const val = v.value;
  if (val === null) return '空';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') return Number.isInteger(val) ? String(val) : String(Math.round(val * 10000) / 10000);
  return String(val);
}
