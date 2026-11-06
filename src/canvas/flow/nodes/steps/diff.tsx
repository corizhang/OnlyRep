import { FieldRow, NInput, NSelect } from '../controls';
import type { NodeTypeDef } from '../types';

/**
 * 差分（较上日增加）：对数值列按日期逐行求「本行 - 上一行」，产出新列。
 * 列场景直接用输出表；数字场景 = 差分 → 取最新日 → 取数。
 * 分组列可选：多日快照合并后按「分行」等维度分组做较上日。
 */
export const diffDef: NodeTypeDef = {
  type: 'diff',
  label: '差分',
  icon: 'Δ',
  desc: '较上日增加一列',
  hint: '逐行求与上一行的差值',
  needsTableInput: true,
  defaultParams: () => ({ col: '', dateCol: '', groupCol: '', as: '' }),
  Config: ({ node, cols, setParam }) => (
    <>
      <FieldRow label="数值列"><NSelect value={String(node.params.col ?? '')} placeholder="选择列（如累计值）" options={cols} onChange={(v) => setParam({ col: v })} /></FieldRow>
      <FieldRow label="日期列"><NSelect value={String(node.params.dateCol ?? '')} placeholder="按现有行顺序" options={cols} onChange={(v) => setParam({ dateCol: v })} /></FieldRow>
      <FieldRow label="分组列"><NSelect value={String(node.params.groupCol ?? '')} placeholder="不分组（全表逐行）" options={cols} onChange={(v) => setParam({ groupCol: v })} /></FieldRow>
      <FieldRow label="新列名"><NInput value={String(node.params.as ?? '')} placeholder="较上日增加" onChange={(v) => setParam({ as: v })} /></FieldRow>
    </>
  ),
};
