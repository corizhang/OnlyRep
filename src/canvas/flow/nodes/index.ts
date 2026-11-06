import type { DataSource, NodeType } from '../../types';
import type { NodeTypeDef, SourceKindDef } from './types';
import { filterDef } from './steps/filter';
import { pickRowsDef } from './steps/pickRows';
import { sortTopNDef } from './steps/sortTopN';
import { deriveDef } from './steps/derive';
import { groupAggDef } from './steps/groupAgg';
import { scalarOutDef } from './steps/scalarOut';
import { formulaDef } from './steps/formula';
import { importSourceDef } from './sources/import';
import { formSourceDef } from './sources/form';
import { constantSourceDef } from './sources/constant';
import { manualSourceDef } from './sources/manual';

/**
 * 节点注册表（单一事实来源）：
 * - 处理节点 STEP_DEFS / 数据源 SOURCE_DEFS
 * - 派生元信息：NODE_TYPE_LABELS（徽标）、STEP_TYPES（添加下游浮层）、
 *   defaultParams（创建默认参数）、NODE_TYPE_META / SOURCE_KIND_META（节点库）
 * 新增节点：steps/ 下新建定义文件 + 此处注册一行，UI 各处自动生效；
 * 引擎执行分支（engine.ts）与 NodeType 联合类型（types.ts）仍需各加一处（编译器会提示）。
 */

const STEP_DEF_LIST: NodeTypeDef[] = [pickRowsDef, filterDef, sortTopNDef, groupAggDef, deriveDef, scalarOutDef, formulaDef];

export const STEP_DEFS = Object.fromEntries(STEP_DEF_LIST.map((d) => [d.type, d])) as Record<string, NodeTypeDef>;

const SOURCE_DEF_LIST: SourceKindDef[] = [importSourceDef, manualSourceDef, formSourceDef, constantSourceDef];

export const SOURCE_DEFS = Object.fromEntries(SOURCE_DEF_LIST.map((d) => [d.kind, d])) as Record<DataSource['kind'], SourceKindDef>;

/** 按类型取定义（步骤类）；source 节点请用 SOURCE_DEFS */
export function stepDef(type: NodeType): NodeTypeDef | undefined {
  return STEP_DEFS[type];
}

/** 头部徽标 / 各处标签 */
export const NODE_TYPE_LABELS: Record<NodeType, string> = {
  source: '数据源',
  ...Object.fromEntries(STEP_DEF_LIST.map((d) => [d.type, d.label])),
} as Record<NodeType, string>;

/** 添加下游浮层的步骤列表（不含计算字段，浮层单独追加） */
export const STEP_TYPES: { type: NodeType; label: string; hint: string }[] = STEP_DEF_LIST.filter((d) => d.type !== 'formula').map((d) => ({
  type: d.type,
  label: d.label,
  hint: d.hint,
}));

/** 创建节点的默认参数 */
export function defaultParams(type: NodeType): Record<string, unknown> {
  return stepDef(type)?.defaultParams() ?? {};
}

/** 节点库「处理节点」分组 */
export const NODE_TYPE_META: { type: NodeType; label: string; desc: string; icon: string }[] = STEP_DEF_LIST.map((d) => ({
  type: d.type,
  label: d.label,
  desc: d.desc,
  icon: d.icon,
}));

/** 节点库「数据源」分组 */
export const SOURCE_KIND_META: { kind: DataSource['kind']; label: string; desc: string; icon: string }[] = SOURCE_DEF_LIST.map((d) => ({
  kind: d.kind,
  label: d.label,
  desc: d.desc,
  icon: d.icon,
}));

export { AGG_LABELS } from './types';
export type { NodeTypeDef, SourceKindDef, StepConfigProps, ColOption } from './types';
