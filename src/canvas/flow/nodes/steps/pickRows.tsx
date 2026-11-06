import { FieldRow, NNum, NSelect } from '../controls';
import type { NodeTypeDef } from '../types';

const MODE_OPTIONS = [
  { value: 'latestDate', label: '最新日期全部行' },
  { value: 'firstN', label: '前 N 行' },
  { value: 'lastN', label: '后 N 行' },
  { value: 'all', label: '全部行' },
];

/** 取行：取最新日期 / 前 N 行 */
export const pickRowsDef: NodeTypeDef = {
  type: 'pickRows',
  label: '取行',
  icon: '⚙',
  desc: '取最新日期 / 前 N 行',
  hint: '取最新日期或前后 N 行',
  needsTableInput: true,
  defaultParams: () => ({ mode: 'latestDate', dateCol: '', n: 1 }),
  Config: ({ node, cols, setParam }) => (
    <>
      <FieldRow label="取行"><NSelect value={String(node.params.mode ?? 'latestDate')} options={MODE_OPTIONS} onChange={(v) => setParam({ mode: v })} /></FieldRow>
      <FieldRow label="日期列"><NSelect value={String(node.params.dateCol ?? '')} placeholder="选择列" options={cols} onChange={(v) => setParam({ dateCol: v })} /></FieldRow>
      {node.params.mode === 'firstN' || node.params.mode === 'lastN' ? (
        <FieldRow label="N"><NNum value={Number(node.params.n ?? 1)} min={1} onChange={(v) => setParam({ n: v })} /></FieldRow>
      ) : null}
    </>
  ),
};
