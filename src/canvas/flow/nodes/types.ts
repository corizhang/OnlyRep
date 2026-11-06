import type { FC } from 'react';
import type { AggMethod, DataSource, NodeType, PipelineNode, SourceRuntime } from '../../types';

/** 聚合方式文案（scalarOut / groupAgg 共用） */
export const AGG_LABELS: Record<AggMethod, string> = {
  sum: '求和',
  avg: '平均',
  count: '计数',
  countDistinct: '去重计数',
  max: '最大',
  min: '最小',
};

/**
 * 节点类型定义（注册表条目）：一种处理节点 = 一个声明式文件。
 * 新增节点：在 steps/ 下新建定义文件，在 index.ts 注册一行，
 * 节点库 / 添加下游浮层 / 徽标 / 默认参数 / 节点内配置 / 右侧抽屉配置自动生效。
 */

export interface ColOption {
  value: string;
  label: string;
}

/** 节点配置组件的入参（节点内与右侧抽屉共用同一个 Config） */
export interface StepConfigProps {
  node: PipelineNode;
  /** 上游表格列（无表格上游时为 []） */
  cols: ColOption[];
  /** 行公式可用的上游列 */
  rowColumns: { key: string; label: string }[];
  /** 行公式预览样本（上游第一行） */
  rowSample?: Record<string, unknown>;
  /** 写回 params */
  setParam: (patch: Record<string, unknown>) => void;
}

export interface NodeTypeDef {
  type: NodeType;
  /** 库名称 / 头部徽标 / 创建节点时的初始名 */
  label: string;
  /** 节点库图标（单字符） */
  icon: string;
  /** 节点库卡片描述 */
  desc: string;
  /** 添加下游按钮的提示 */
  hint: string;
  /** 是否必须接表格类上游（公式=false） */
  needsTableInput: boolean;
  /** 最大输入数（默认 1；合并类节点为 2，连线时按追加处理） */
  maxInputs?: number;
  defaultParams: () => Record<string, unknown>;
  /** 配置表单（节点内嵌 + 右侧抽屉复用；antd 控件主题随上下文） */
  Config: FC<StepConfigProps>;
}

/** 数据源定义（source 节点的 4 个 kind） */
export interface SourceKindDef {
  kind: DataSource['kind'];
  label: string;
  desc: string;
  icon: string;
  Config: FC<{ srcDef: DataSource; srcRt?: SourceRuntime }>;
}
