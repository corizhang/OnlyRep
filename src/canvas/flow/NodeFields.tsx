import { useCanvasStore } from '../../store/useCanvasStore';
import type { AggMethod, PipelineNode } from '../types';
import { Btn, Check, Field, NumberInput, Select, TextInput } from '../components/ui';
import FormulaInput, { useFormulaVariables } from '../formula/FormulaInput';

/**
 * 单个节点的配置表单（步骤链与流程视图共用，避免两套实现漂移）。
 * 只负责字段渲染与写回，结果预览由调用方决定展示形式。
 */

export const AGG_LABELS: Record<AggMethod, string> = {
  sum: '求和',
  avg: '平均',
  count: '计数',
  countDistinct: '去重计数',
  max: '最大',
  min: '最小',
};

export const NODE_TYPE_LABELS: Record<PipelineNode['type'], string> = {
  source: '数据源',
  pickRows: '取行',
  filter: '筛选',
  sortTopN: '排序',
  groupAgg: '分组聚合',
  derive: '派生列',
  scalarOut: '取数',
  formula: '计算字段',
};

export default function NodeFields({ node, cols }: { node: PipelineNode; cols: { value: string; label: string }[] }) {
  const updateNode = useCanvasStore((s) => s.updateNode);
  const outputs = useCanvasStore((s) => s.outputs);
  const set = (patch: Partial<PipelineNode>): void => updateNode(node.id, patch);
  const setParam = (patch: Record<string, unknown>): void => set({ params: { ...node.params, ...patch } });

  const rowColumns = cols.map((c) => ({ key: c.value, label: c.label }));
  const variables = useFormulaVariables(node.type === 'derive' ? rowColumns : undefined);
  const upOutput = node.inputs[0] ? outputs[node.inputs[0]] : undefined;
  const rowSample = upOutput && upOutput.kind === 'table' ? upOutput.table.rows[0] : undefined;

  return (
    <div className="space-y-1.5">
      <Field label="显示名" hint={node.type === 'scalarOut' || node.type === 'formula' ? '即公式里的变量名' : undefined}>
        <TextInput value={node.name} onChange={(v) => set({ name: v })} />
      </Field>

      {node.type === 'filter' && (
        <>
          <Field label="列">
            <Select value={String(node.params.col ?? '')} placeholder="选择列" options={cols} onChange={(v) => setParam({ col: v })} />
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
              onChange={(v) => setParam({ op: v })}
            />
          </Field>
          <Field label="值">
            <TextInput value={String(node.params.value ?? '')} onChange={(v) => setParam({ value: v })} />
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
              onChange={(v) => setParam({ mode: v })}
            />
          </Field>
          <Field label="日期列">
            <Select value={String(node.params.dateCol ?? '')} placeholder="选择列" options={cols} onChange={(v) => setParam({ dateCol: v })} />
          </Field>
          <Field label="N">
            <NumberInput value={Number(node.params.n ?? 1)} min={1} onChange={(v) => setParam({ n: v })} />
          </Field>
        </>
      )}

      {node.type === 'sortTopN' && (
        <>
          <Field label="排序列">
            <Select value={String(node.params.col ?? '')} placeholder="选择列" options={cols} onChange={(v) => setParam({ col: v })} />
          </Field>
          <Field label="方向">
            <Select
              value={String(node.params.dir ?? 'desc')}
              options={[
                { value: 'desc', label: '降序' },
                { value: 'asc', label: '升序' },
              ]}
              onChange={(v) => setParam({ dir: v })}
            />
          </Field>
          <Field label="取前 N 行（0=全部）">
            <NumberInput value={Number(node.params.n ?? 0)} min={0} onChange={(v) => setParam({ n: v })} />
          </Field>
          <Check checked={node.params.asDate === true} label="按日期排序" onChange={(v) => setParam({ asDate: v })} />
        </>
      )}

      {node.type === 'derive' && (
        <>
          <Field label="新列名">
            <TextInput value={String(node.params.name ?? '')} onChange={(v) => setParam({ name: v })} />
          </Field>
          <Field label="行公式" hint="列名含 - 或空格时用 [列名]；输入触发补全">
            <FormulaInput
              value={String(node.params.expr ?? '')}
              onChange={(v) => setParam({ expr: v })}
              variables={variables}
              rowSample={rowSample as Record<string, unknown> | undefined}
            />
          </Field>
        </>
      )}

      {node.type === 'groupAgg' && (
        <>
          <Field label="分组列">
            <Select value={String(node.params.groupCol ?? '')} placeholder="选择列" options={cols} onChange={(v) => setParam({ groupCol: v })} />
          </Field>
          <AggFields node={node} cols={cols} />
        </>
      )}

      {node.type === 'scalarOut' && (
        <>
          <Field label="取数列">
            <Select value={String(node.params.col ?? '')} placeholder="选择列" options={cols} onChange={(v) => setParam({ col: v })} />
          </Field>
          <Field label="聚合方式">
            <Select
              value={String(node.params.method ?? 'sum')}
              options={(Object.keys(AGG_LABELS) as AggMethod[]).map((m) => ({ value: m, label: AGG_LABELS[m] }))}
              onChange={(v) => setParam({ method: v })}
            />
          </Field>
        </>
      )}

      {node.type === 'formula' && (
        <Field label="公式" hint="可引用表单参数、变量与函数；输入触发补全">
          <FormulaInput value={String(node.params.expr ?? '')} onChange={(v) => setParam({ expr: v })} variables={variables} />
        </Field>
      )}

      {node.type === 'source' && <p className="text-[11.5px] text-slate-400">数据源的导入/编辑在左侧「数据源」面板完成。</p>}
    </div>
  );
}

function AggFields({ node, cols }: { node: PipelineNode; cols: { value: string; label: string }[] }) {
  const updateNode = useCanvasStore((s) => s.updateNode);
  const aggs = Array.isArray(node.params.aggs) ? (node.params.aggs as { col: string; method: AggMethod; as: string }[]) : [];
  const set = (next: typeof aggs): void => updateNode(node.id, { params: { ...node.params, aggs: next } });

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
