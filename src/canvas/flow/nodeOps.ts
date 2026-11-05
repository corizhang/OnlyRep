import { createImportSource, createManualTableSource, newId, uniqueName } from '../datasource/registry';
import { defaultParams, STEP_TYPES } from '../components/StepChainPanel';
import type { DataSource, NodeType, PipelineNode } from '../types';

/**
 * 节点库共用的创建逻辑（FlowSheet 拖放 / NodeLibrary 点选都走这里）。
 * 纯函数：只负责造对象，不入 store。
 */

/** 节点库「数据源」分组元信息 */
export const SOURCE_KIND_META: { kind: DataSource['kind']; label: string; desc: string; icon: string }[] = [
  { kind: 'import', label: '文件', desc: '导入 xlsx / csv', icon: '⇪' },
  { kind: 'manualTable', label: '手填表', desc: '可编辑网格', icon: '▦' },
  { kind: 'form', label: '表单', desc: '名称 + 数值口径参数', icon: '≡' },
  { kind: 'constant', label: '常量', desc: '单个数值', icon: 'π' },
];

/** 节点库「处理节点」分组元信息（STEP_TYPES + 计算字段） */
export const NODE_TYPE_META: { type: NodeType; label: string; desc: string; icon: string }[] = [
  ...STEP_TYPES.map((s) => ({ type: s.type as NodeType, label: s.label, desc: s.hint, icon: '⚙' })),
  { type: 'formula' as NodeType, label: '计算字段', desc: '公式产出新变量', icon: 'ƒ' },
];

/** 按类型创建数据源（名称自动去重） */
export function createSourceOfKind(dataSources: DataSource[], kind: DataSource['kind']): DataSource {
  const base = { import: '导入数据', manualTable: '手填表格', form: '口径参数', constant: '常量' }[kind];
  const name = uniqueName(dataSources, base);
  if (kind === 'import') return createImportSource(name);
  if (kind === 'manualTable') return createManualTableSource(name);
  if (kind === 'form') return { id: newId('ds'), name, kind: 'form', entries: [{ key: '参数1', value: '0' }] };
  return { id: newId('ds'), name, kind: 'constant', value: '0' };
}

/** 按类型创建处理节点（名称自动去重）；表格类步骤需已校验 inputId 合法 */
export function createStepNode(nodes: PipelineNode[], type: NodeType, inputId: string | null): PipelineNode {
  const label = type === 'formula' ? '计算字段' : STEP_TYPES.find((s) => s.type === type)?.label ?? '步骤';
  const dup = nodes.filter((n) => n.name === label || n.name.startsWith(`${label} `)).length;
  return {
    id: newId('n'),
    type,
    name: dup > 0 ? `${label} ${dup + 1}` : label,
    inputs: type === 'formula' ? [] : [inputId as string],
    params: defaultParams(type),
    enabled: true,
  };
}
