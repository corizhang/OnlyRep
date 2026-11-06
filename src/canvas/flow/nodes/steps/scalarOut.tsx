import { FieldRow, NSelect } from '../controls';
import { AGG_LABELS } from '../types';
import type { NodeTypeDef } from '../types';
import type { AggMethod } from '../../../types';

/** 取数：对列聚合出一个数值（写入变量环境） */
export const scalarOutDef: NodeTypeDef = {
  type: 'scalarOut',
  label: '取数',
  icon: '⚙',
  desc: '对列聚合出一个数值',
  hint: '聚合出单个数值变量',
  needsTableInput: true,
  defaultParams: () => ({ col: '', method: 'sum' }),
  Config: ({ node, cols, setParam }) => (
    <>
      <FieldRow label="取数列"><NSelect value={String(node.params.col ?? '')} placeholder="选择列" options={cols} onChange={(v) => setParam({ col: v })} /></FieldRow>
      <FieldRow label="聚合">
        <NSelect
          value={String(node.params.method ?? 'sum')}
          options={(Object.keys(AGG_LABELS) as AggMethod[]).map((m) => ({ value: m, label: AGG_LABELS[m] }))}
          onChange={(v) => setParam({ method: v })}
        />
      </FieldRow>
    </>
  ),
};
