import { FieldRow, NInput, NSelect } from '../controls';
import type { NodeTypeDef } from '../types';

const OP_OPTIONS = [
  { value: 'contains', label: '包含' },
  { value: 'eq', label: '等于' },
  { value: 'ne', label: '不等于' },
  { value: 'gt', label: '大于' },
  { value: 'gte', label: '大于等于' },
  { value: 'lt', label: '小于' },
  { value: 'lte', label: '小于等于' },
  { value: 'notEmpty', label: '非空' },
  { value: 'empty', label: '为空' },
];

/** 筛选：按列值过滤行 */
export const filterDef: NodeTypeDef = {
  type: 'filter',
  label: '筛选',
  icon: '⚙',
  desc: '按列值过滤行',
  hint: '按条件过滤行',
  needsTableInput: true,
  defaultParams: () => ({ col: '', op: 'contains', value: '' }),
  Config: ({ node, cols, setParam }) => (
    <>
      <FieldRow label="列"><NSelect value={String(node.params.col ?? '')} placeholder="选择列" options={cols} onChange={(v) => setParam({ col: v })} /></FieldRow>
      <FieldRow label="条件"><NSelect value={String(node.params.op ?? 'contains')} options={OP_OPTIONS} onChange={(v) => setParam({ op: v })} /></FieldRow>
      <FieldRow label="值"><NInput value={String(node.params.value ?? '')} onChange={(v) => setParam({ value: v })} /></FieldRow>
    </>
  ),
};
