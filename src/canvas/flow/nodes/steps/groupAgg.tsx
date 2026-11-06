import { useCanvasStore } from '../../../../store/useCanvasStore';
import { FieldRow, NBtn, NSelect } from '../controls';
import { Input, Select } from 'antd';
import { AGG_LABELS } from '../types';
import type { NodeTypeDef } from '../types';
import type { AggMethod, PipelineNode } from '../../../types';

/** 分组聚合：按维度汇总 */
export const groupAggDef: NodeTypeDef = {
  type: 'groupAgg',
  label: '分组聚合',
  icon: '⚙',
  desc: '按维度汇总',
  hint: '分组后按列聚合',
  needsTableInput: true,
  defaultParams: () => ({ groupCol: '', aggs: [{ col: '', method: 'sum', as: '' }] }),
  Config: ({ node, cols, setParam }) => (
    <>
      <FieldRow label="分组列"><NSelect value={String(node.params.groupCol ?? '')} placeholder="选择列" options={cols} onChange={(v) => setParam({ groupCol: v })} /></FieldRow>
      <AggRows node={node} cols={cols} />
    </>
  ),
};

function AggRows({ node, cols }: { node: PipelineNode; cols: { value: string; label: string }[] }) {
  const updateNode = useCanvasStore((s) => s.updateNode);
  const aggs = Array.isArray(node.params.aggs) ? (node.params.aggs as { col: string; method: AggMethod; as: string }[]) : [];
  const set = (next: typeof aggs): void => updateNode(node.id, { params: { ...node.params, aggs: next } });

  return (
    <div className="space-y-1">
      <span className="text-[10.5px] text-[var(--nb-text-dim,#64748b)]">聚合列</span>
      {aggs.map((a, i) => (
        <div key={i} className="flex gap-1">
          <Select
            size="small"
            className="min-w-0 flex-1"
            placeholder="列"
            value={a.col === '' ? undefined : a.col}
            options={cols}
            onChange={(v) => set(aggs.map((x, j) => (j === i ? { ...x, col: v ?? '', as: x.as || v || '' } : x)))}
          />
          <Select
            size="small"
            className="w-[78px] shrink-0"
            value={a.method}
            options={(Object.keys(AGG_LABELS) as AggMethod[]).map((m) => ({ value: m, label: AGG_LABELS[m] }))}
            onChange={(v) => set(aggs.map((x, j) => (j === i ? { ...x, method: v as AggMethod } : x)))}
          />
          <Input
            size="small"
            className="w-14 shrink-0"
            value={a.as}
            placeholder="命名"
            onChange={(e) => set(aggs.map((x, j) => (j === i ? { ...x, as: e.target.value } : x)))}
          />
          <button type="button" className="text-[11px] text-[var(--nb-text-faint,#9ca3af)] hover:text-[var(--nb-err,#dc2626)]" onClick={() => set(aggs.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      <NBtn onClick={() => set([...aggs, { col: '', method: 'sum', as: '' }])}>+ 聚合列</NBtn>
    </div>
  );
}
