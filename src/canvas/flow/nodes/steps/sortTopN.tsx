import { FieldRow, NCheck, NNum, NSelect } from '../controls';
import type { NodeTypeDef } from '../types';

/** 排序：升降序 / 取前 N */
export const sortTopNDef: NodeTypeDef = {
  type: 'sortTopN',
  label: '排序',
  icon: '⚙',
  desc: '升降序 / 取前 N',
  hint: '排序并截取前 N 行',
  needsTableInput: true,
  defaultParams: () => ({ col: '', dir: 'desc', n: 0, asDate: false }),
  Config: ({ node, cols, setParam }) => (
    <>
      <FieldRow label="排序列"><NSelect value={String(node.params.col ?? '')} placeholder="选择列" options={cols} onChange={(v) => setParam({ col: v })} /></FieldRow>
      <FieldRow label="方向">
        <NSelect
          value={String(node.params.dir ?? 'desc')}
          options={[
            { value: 'desc', label: '降序' },
            { value: 'asc', label: '升序' },
          ]}
          onChange={(v) => setParam({ dir: v })}
        />
      </FieldRow>
      <FieldRow label="前 N 行"><NNum value={Number(node.params.n ?? 0)} min={0} onChange={(v) => setParam({ n: v })} /></FieldRow>
      <NCheck checked={node.params.asDate === true} label="按日期排序" onChange={(v) => setParam({ asDate: v })} />
    </>
  ),
};
