import FormulaRow from '../FormulaRow';
import type { NodeTypeDef } from '../types';

/** 计算字段：公式产出新变量（无需表格上游） */
export const formulaDef: NodeTypeDef = {
  type: 'formula',
  label: '计算字段',
  icon: 'ƒ',
  desc: '公式产出新变量',
  hint: '公式产出新变量',
  needsTableInput: false,
  defaultParams: () => ({ expr: '' }),
  Config: ({ node, setParam }) => <FormulaRow node={node} label="公式" setParam={setParam} />,
};
