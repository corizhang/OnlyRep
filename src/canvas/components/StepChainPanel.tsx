import { useState } from 'react';
import { useCanvasStore } from '../../store/useCanvasStore';
import type { AggMethod, NodeOutput, PipelineNode } from '../types';
import { columnsOf } from '../pipeline/engine';
import { newId } from '../datasource/registry';
import { Btn, Check, Field, NumberInput, Pill, Section, Select, TextInput } from './ui';
import FormulaInput, { useFormulaVariables } from '../formula/FormulaInput';

/**
 * 处理管道（PRD R2）：每个数据源下挂一条步骤链 + 全局计算字段。
 * v1 交互 = 「每源步骤链」，底层是 DAG（v2 视觉画布可复用同一引擎）。
 */

export const STEP_TYPES: { type: PipelineNode['type']; label: string; hint: string }[] = [
  { type: 'pickRows', label: '取行', hint: '取最新日期 / 前 N 行' },
  { type: 'filter', label: '筛选', hint: '按列值过滤行' },
  { type: 'sortTopN', label: '排序', hint: '升降序 / 取前 N' },
  { type: 'groupAgg', label: '分组聚合', hint: '按维度汇总' },
  { type: 'derive', label: '派生列', hint: '行内公式新增一列' },
  { type: 'scalarOut', label: '取数', hint: '对列聚合出一个数值' },
];

const AGG_LABELS: Record<AggMethod, string> = {
  sum: '求和',
  avg: '平均',
  count: '计数',
  countDistinct: '去重计数',
  max: '最大',
  min: '最小',
};

export function defaultParams(type: PipelineNode['type']): Record<string, unknown> {
  switch (type) {
    case 'filter':
      return { col: '', op: 'contains', value: '' };
    case 'pickRows':
      return { mode: 'latestDate', dateCol: '', n: 1 };
    case 'derive':
      return { name: '', expr: '' };
    case 'sortTopN':
      return { col: '', dir: 'desc', n: 0, asDate: false };
    case 'groupAgg':
      return { groupCol: '', aggs: [{ col: '', method: 'sum', as: '' }] };
    case 'scalarOut':
      return { col: '', method: 'sum' };
    case 'formula':
      return { expr: '' };
    default:
      return {};
  }
}

export default function StepChainPanel() {
  const config = useCanvasStore((s) => s.config);
  const outputs = useCanvasStore((s) => s.outputs);
  const addNode = useCanvasStore((s) => s.addNode);
  const setShowFlow = useCanvasStore((s) => s.setShowFlow);
  const [expanded, setExpanded] = useState<string | null>(null);

  const nodes = config.pipeline.nodes;
  const formulas = nodes.filter((n) => n.type === 'formula');

  return (
    <Section
      title="处理步骤"
      extra={
        <Btn size="xs" tone="ghost" onClick={() => setShowFlow(true)} title="把整条 DAG 画成流程图，可看中间结果">
          数据流视图
        </Btn>
      }
    >
      {config.dataSources.length === 0 && <p className="text-[12px] text-slate-400">先添加数据源。</p>}

      {config.dataSources.map((src) => {
        const srcNode = nodes.find((n) => n.type === 'source' && String(n.params.sourceId ?? '') === src.id);
        if (!srcNode) return null;
        const chain = downstreamOf(nodes, srcNode.id);
        const last = chain.length > 0 ? chain[chain.length - 1] : srcNode;

        return (
          <div key={src.id} className="rounded-md border border-slate-200 p-2">
            <div className="mb-1 flex items-center gap-1.5">
              <span className="text-[12px] font-medium text-slate-700">{src.name}</span>
              <Pill tone="blue">{src.kind === 'import' ? '文件' : src.kind === 'form' ? '表单' : src.kind === 'constant' ? '常量' : '手填表'}</Pill>
              <StatusDot output={outputs[srcNode.id]} />
            </div>

            {chain.length === 0 && <p className="text-[11.5px] text-slate-400">未加处理步骤，组件可直接绑定原始表。</p>}

            {chain.map((n) => {
              const upstream = n.inputs[0];
              return (
                <StepRow
                  key={n.id}
                  node={n}
                  output={outputs[n.id]}
                  upstreamOutput={upstream ? outputs[upstream] : undefined}
                  expanded={expanded === n.id}
                  onToggleExpand={() => setExpanded(expanded === n.id ? null : n.id)}
                />
              );
            })}

            <div className="mt-1 flex items-center gap-1">
              <AddStep
                onAdd={(type) => {
                  const node: PipelineNode = {
                    id: newId('n'),
                    type,
                    name: STEP_TYPES.find((s) => s.type === type)?.label ?? '步骤',
                    inputs: [last.id],
                    params: defaultParams(type),
                    enabled: true,
                  };
                  addNode(node);
                  setExpanded(node.id);
                }}
              />
            </div>
          </div>
        );
      })}

      <div className="mt-2 rounded-md border border-dashed border-slate-300 p-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[12px] font-medium text-slate-700">计算字段</span>
          <Btn
            size="xs"
            onClick={() => {
              const node: PipelineNode = {
                id: newId('n'),
                type: 'formula',
                name: `字段${formulas.length + 1}`,
                inputs: [],
                params: defaultParams('formula'),
                enabled: true,
              };
              addNode(node);
              setExpanded(node.id);
            }}
          >
            + 公式
          </Btn>
        </div>
        {formulas.length === 0 && <p className="text-[11.5px] text-slate-400">用公式把标量算成新指标，如「完成率 = 已完成/全年目标」。</p>}
        {formulas.map((n) => (
          <StepRow
            key={n.id}
            node={n}
            output={outputs[n.id]}
            upstreamOutput={undefined}
            expanded={expanded === n.id}
            onToggleExpand={() => setExpanded(expanded === n.id ? null : n.id)}
          />
        ))}
      </div>
    </Section>
  );
}

function StatusDot({ output }: { output: NodeOutput | undefined }) {
  if (!output) return null;
  if (output.kind === 'error') return <Pill tone="amber">!</Pill>;
  if (output.kind === 'table') return <Pill tone="green">{output.table.rows.length} 行</Pill>;
  if (output.kind === 'scalar') return <Pill tone="green">{String(output.value ?? '—')}</Pill>;
  return null;
}

function StepRow({
  node,
  output,
  upstreamOutput,
  expanded,
  onToggleExpand,
}: {
  node: PipelineNode;
  output: NodeOutput | undefined;
  upstreamOutput: NodeOutput | undefined;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const updateNode = useCanvasStore((s) => s.updateNode);
  const removeNode = useCanvasStore((s) => s.removeNode);
  const toggleNode = useCanvasStore((s) => s.toggleNode);

  const cols = upstreamOutput && upstreamOutput.kind === 'table'
    ? upstreamOutput.table.columns.map((c) => ({ value: c.key, label: c.rawName || c.key }))
    : [];
  const rowColumns = cols.map((c) => ({ key: c.value, label: c.label }));
  const variables = useFormulaVariables(node.type === 'derive' ? rowColumns : undefined);
  const rowSample = upstreamOutput && upstreamOutput.kind === 'table' ? upstreamOutput.table.rows[0] : undefined;

  return (
    <div className={`mt-1 rounded border ${node.enabled ? 'border-slate-200' : 'border-slate-200 bg-slate-100/60'} px-1.5 py-1`}>
      <div className="flex items-center gap-1">
        <button type="button" className="w-4 text-[11.5px] text-slate-400" onClick={onToggleExpand}>
          {expanded ? '▾' : '▸'}
        </button>
        <span className={`text-[12px] ${node.enabled ? 'text-slate-700' : 'text-slate-400 line-through'}`}>{node.name}</span>
        <span className="text-[10.5px] text-slate-400">{typeLabel(node.type)}</span>
        <span className="ml-auto truncate text-[10.5px] text-slate-400">{summary(node)}</span>
        <input
          type="checkbox"
          className="h-3 w-3"
          checked={node.enabled}
          title="启停该步骤"
          onChange={() => toggleNode(node.id)}
        />
        <button type="button" className="text-[11.5px] text-slate-400 hover:text-red-500" onClick={() => removeNode(node.id)}>
          ✕
        </button>
      </div>

      {output?.kind === 'error' && <div className="pl-5 text-[11.5px] text-amber-600">{output.message}</div>}

      {expanded && (
        <div className="mt-1 space-y-1.5 border-t border-slate-100 pl-5 pt-1.5">
          <Field label="显示名">
            <TextInput value={node.name} onChange={(v) => updateNode(node.id, { name: v })} />
          </Field>

          {node.type === 'filter' && (
            <>
              <Field label="列">
                <Select value={String(node.params.col ?? '')} placeholder="选择列" options={cols} onChange={(v) => updateNode(node.id, { params: { ...node.params, col: v } })} />
              </Field>
              <Field label="条件">
                <Select
                  value={String(node.params.op ?? 'contains')}
                  options={[
                    { value: 'contains', label: '包含' },
                    { value: 'eq', label: '等于' },
                    { value: 'ne', label: '不等于' },
                    { value: 'gt', label: '大于' },
                    { value: 'gte', label: '大于等于' },
                    { value: 'lt', label: '小于' },
                    { value: 'lte', label: '小于等于' },
                    { value: 'notEmpty', label: '非空' },
                    { value: 'empty', label: '为空' },
                  ]}
                  onChange={(v) => updateNode(node.id, { params: { ...node.params, op: v } })}
                />
              </Field>
              <Field label="值">
                <TextInput value={String(node.params.value ?? '')} onChange={(v) => updateNode(node.id, { params: { ...node.params, value: v } })} />
              </Field>
            </>
          )}

          {node.type === 'pickRows' && (
            <>
              <Field label="取行方式">
                <Select
                  value={String(node.params.mode ?? 'latestDate')}
                  options={[
                    { value: 'latestDate', label: '取最新日期的全部行' },
                    { value: 'firstN', label: '前 N 行' },
                    { value: 'lastN', label: '后 N 行' },
                    { value: 'all', label: '全部行' },
                  ]}
                  onChange={(v) => updateNode(node.id, { params: { ...node.params, mode: v } })}
                />
              </Field>
              <Field label="日期列">
                <Select value={String(node.params.dateCol ?? '')} placeholder="选择列" options={cols} onChange={(v) => updateNode(node.id, { params: { ...node.params, dateCol: v } })} />
              </Field>
              <Field label="N">
                <NumberInput value={Number(node.params.n ?? 1)} min={1} onChange={(v) => updateNode(node.id, { params: { ...node.params, n: v } })} />
              </Field>
            </>
          )}

          {node.type === 'sortTopN' && (
            <>
              <Field label="排序列">
                <Select value={String(node.params.col ?? '')} placeholder="选择列" options={cols} onChange={(v) => updateNode(node.id, { params: { ...node.params, col: v } })} />
              </Field>
              <Field label="方向">
                <Select
                  value={String(node.params.dir ?? 'desc')}
                  options={[
                    { value: 'desc', label: '降序' },
                    { value: 'asc', label: '升序' },
                  ]}
                  onChange={(v) => updateNode(node.id, { params: { ...node.params, dir: v } })}
                />
              </Field>
              <Field label="取前 N 行（0=全部）">
                <NumberInput value={Number(node.params.n ?? 0)} min={0} onChange={(v) => updateNode(node.id, { params: { ...node.params, n: v } })} />
              </Field>
              <Check checked={node.params.asDate === true} label="按日期排序" onChange={(v) => updateNode(node.id, { params: { ...node.params, asDate: v } })} />
            </>
          )}

          {node.type === 'derive' && (
            <>
              <Field label="新列名">
                <TextInput value={String(node.params.name ?? '')} onChange={(v) => updateNode(node.id, { params: { ...node.params, name: v } })} />
              </Field>
              <Field label="行公式" hint="列名含 - 或空格时用 [列名]；输入触发补全">
                <FormulaInput
                  value={String(node.params.expr ?? '')}
                  onChange={(v) => updateNode(node.id, { params: { ...node.params, expr: v } })}
                  variables={variables}
                  rowSample={rowSample as Record<string, unknown> | undefined}
                />
              </Field>
            </>
          )}

          {node.type === 'groupAgg' && (
            <>
              <Field label="分组列">
                <Select value={String(node.params.groupCol ?? '')} placeholder="选择列" options={cols} onChange={(v) => updateNode(node.id, { params: { ...node.params, groupCol: v } })} />
              </Field>
              <AggEditor node={node} cols={cols} />
            </>
          )}

          {node.type === 'scalarOut' && (
            <>
              <Field label="取数列">
                <Select value={String(node.params.col ?? '')} placeholder="选择列" options={cols} onChange={(v) => updateNode(node.id, { params: { ...node.params, col: v } })} />
              </Field>
              <Field label="聚合方式">
                <Select
                  value={String(node.params.method ?? 'sum')}
                  options={(Object.keys(AGG_LABELS) as AggMethod[]).map((m) => ({ value: m, label: AGG_LABELS[m] }))}
                  onChange={(v) => updateNode(node.id, { params: { ...node.params, method: v } })}
                />
              </Field>
            </>
          )}

          {node.type === 'formula' && (
            <Field label="公式" hint="可引用表单参数、变量与函数；输入触发补全">
              <FormulaInput
                value={String(node.params.expr ?? '')}
                onChange={(v) => updateNode(node.id, { params: { ...node.params, expr: v } })}
                variables={variables}
              />
            </Field>
          )}

          {output && output.kind !== 'error' && (
            <div className="text-[11.5px] text-emerald-600">
              结果：
              {output.kind === 'table'
                ? `${output.table.rows.length} 行`
                : output.kind === 'scalar'
                  ? String(output.value)
                  : `${Object.keys(output.values).length} 个参数`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AggEditor({ node, cols }: { node: PipelineNode; cols: { value: string; label: string }[] }) {
  const updateNode = useCanvasStore((s) => s.updateNode);
  const aggs = Array.isArray(node.params.aggs) ? (node.params.aggs as { col: string; method: AggMethod; as: string }[]) : [];
  const set = (next: typeof aggs) => updateNode(node.id, { params: { ...node.params, aggs: next } });

  return (
    <div className="space-y-1">
      <span className="text-[12px] text-slate-500">聚合列</span>
      {aggs.map((a, i) => (
        <div key={i} className="flex gap-1">
          <select
            className="min-w-0 flex-1 rounded border border-slate-300 px-1 py-0.5 text-[11.5px]"
            value={a.col}
            onChange={(e) => set(aggs.map((x, j) => (j === i ? { ...x, col: e.target.value, as: x.as || e.target.value } : x)))}
          >
            <option value="">列</option>
            {cols.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            className="rounded border border-slate-300 px-1 py-0.5 text-[11.5px]"
            value={a.method}
            onChange={(e) => set(aggs.map((x, j) => (j === i ? { ...x, method: e.target.value as AggMethod } : x)))}
          >
            {(Object.keys(AGG_LABELS) as AggMethod[]).map((m) => (
              <option key={m} value={m}>
                {AGG_LABELS[m]}
              </option>
            ))}
          </select>
          <input
            className="w-16 rounded border border-slate-300 px-1 py-0.5 text-[11.5px]"
            value={a.as}
            placeholder="命名"
            onChange={(e) => set(aggs.map((x, j) => (j === i ? { ...x, as: e.target.value } : x)))}
          />
          <button type="button" className="text-slate-400 hover:text-red-500" onClick={() => set(aggs.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      <Btn size="xs" onClick={() => set([...aggs, { col: '', method: 'sum', as: '' }])}>
        + 聚合列
      </Btn>
    </div>
  );
}

function AddStep({ onAdd }: { onAdd: (type: PipelineNode['type']) => void }) {
  return (
    <select
      className="rounded border border-slate-300 bg-white px-1 py-0.5 text-[11.5px] text-slate-600"
      value=""
      onChange={(e) => {
        if (e.target.value) onAdd(e.target.value as PipelineNode['type']);
        e.target.value = '';
      }}
    >
      <option value="">+ 添加步骤</option>
      {STEP_TYPES.map((s) => (
        <option key={s.type} value={s.type}>
          {s.label} · {s.hint}
        </option>
      ))}
    </select>
  );
}

function typeLabel(t: PipelineNode['type']): string {
  return STEP_TYPES.find((s) => s.type === t)?.label ?? '公式';
}

function summary(node: PipelineNode): string {
  switch (node.type) {
    case 'filter':
      return `${node.params.col ?? ''} ${node.params.op ?? ''} ${node.params.value ?? ''}`.trim();
    case 'pickRows':
      return node.params.mode === 'latestDate' ? `最新 · ${node.params.dateCol ?? ''}` : `${node.params.mode} ${node.params.n}`;
    case 'sortTopN':
      return `${node.params.col ?? ''} ${node.params.dir === 'asc' ? '升' : '降'}${node.params.n ? ` · 前${node.params.n}` : ''}`;
    case 'groupAgg':
      return `按 ${node.params.groupCol ?? ''}`;
    case 'scalarOut':
      return `${node.params.col ?? ''} ${AGG_LABELS[(node.params.method as AggMethod) ?? 'sum']}`;
    case 'derive':
      return `${node.params.name ?? ''} = ${node.params.expr ?? ''}`;
    case 'formula':
      return String(node.params.expr ?? '');
    default:
      return '';
  }
}

/** 沿 DAG 下游收集线性链（遇到多输入节点即停，交由计算字段承载） */
function downstreamOf(nodes: PipelineNode[], startId: string): PipelineNode[] {
  const out: PipelineNode[] = [];
  let cur = startId;
  for (let guard = 0; guard < 20; guard += 1) {
    const next = nodes.find((n) => n.inputs.length === 1 && n.inputs[0] === cur && n.type !== 'formula');
    if (!next) break;
    out.push(next);
    cur = next.id;
  }
  return out;
}

export { columnsOf };
