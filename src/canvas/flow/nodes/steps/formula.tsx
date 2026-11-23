import FormulaRow from '../FormulaRow';
import type { NodeTypeDef } from '../types';

/** 计算字段：无上游时计算标量；连接表格后按行计算并追加一列 */
export const formulaDef: NodeTypeDef = {
  type: 'formula',
  category: '取数与公式',
  label: '计算字段',
  icon: 'ƒ',
  desc: '公式产出新变量',
  hint: '公式产出新变量',
  needsTableInput: false,
  defaultParams: () => ({ expr: '' }),
  Config: ({ node, rowColumns, rowSample, setParam }) => (
    <>
      <div className="text-[10px] text-[var(--nb-text-faint)]">{node.inputs.length ? `逐行计算 · 输出列名：${node.name}` : '标量公式 · 拖入表格上游后可引用列并逐行计算'}</div>
      <FormulaRow node={node} label="公式" rowColumns={rowColumns} rowSample={rowSample} setParam={setParam} />
    </>
  ),
};
