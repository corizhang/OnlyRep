import { FieldRow, NInput } from '../controls';
import FormulaRow from '../FormulaRow';
import type { NodeTypeDef } from '../types';

/** 派生列：行内公式新增一列 */
export const deriveDef: NodeTypeDef = {
  type: 'derive',
  label: '派生列',
  icon: '⚙',
  desc: '行内公式新增一列',
  hint: '行公式计算出新列',
  needsTableInput: true,
  defaultParams: () => ({ name: '', expr: '' }),
  Config: ({ node, rowColumns, rowSample, setParam }) => (
    <>
      <FieldRow label="新列名"><NInput value={String(node.params.name ?? '')} onChange={(v) => setParam({ name: v })} /></FieldRow>
      <FormulaRow node={node} label="行公式" rowColumns={rowColumns} rowSample={rowSample} setParam={setParam} />
    </>
  ),
};
