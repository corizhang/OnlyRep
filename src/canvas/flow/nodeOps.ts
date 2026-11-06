import { createImportSource, createManualTableSource, newId, uniqueName } from '../datasource/registry';
import { defaultParams, NODE_TYPE_LABELS, stepDef } from './nodes';
import type { DataSource, NodeType, PipelineNode } from '../types';

/**
 * 节点库共用的创建逻辑（FlowSheet 拖放 / NodeLibrary 点选都走这里）。
 * 纯函数：只负责造对象，不入 store。
 * 节点/数据源的展示元信息来自注册表 flow/nodes（此处只做 re-export 兼容）。
 */

export { NODE_TYPE_META, SOURCE_KIND_META } from './nodes';

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
  const def = stepDef(type);
  const label = def?.label ?? NODE_TYPE_LABELS[type] ?? '步骤';
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
