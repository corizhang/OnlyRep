import { NODE_TYPE_LABELS } from '../flow/nodes';
import type { CanvasConfig } from '../types';

/**
 * AI 回答人性化改写（确定性后处理，不靠模型自觉）：
 * 1. 节点类型英文名 → 「中文名（type）」：cellEdit → 修数节点（cellEdit）
 * 2. 节点 id → 用户可见的节点名：n_branch → 「分行汇总」
 * 3. 裸参数 key（常见）→ 中文说明
 */

const TYPE_KEYS = Object.keys(NODE_TYPE_LABELS).filter((t) => t !== 'source');

/** 类型名替换表：filter → 筛选节点（filter）等；已被括号包裹的不重复替换 */
export function humanizeNodeTypes(text: string): string {
  let out = text;
  for (const t of TYPE_KEYS) {
    const label = NODE_TYPE_LABELS[t as keyof typeof NODE_TYPE_LABELS];
    const full = `${label}节点`;
    // 已是「xx节点（type）」或「xx节点(type)」形式的跳过
    out = out.replace(new RegExp(`(?<![（(a-zA-Z])${t}(?![a-zA-Z）)])`, 'g'), `${full}（${t}）`);
  }
  return out;
}

/** 节点 id 替换：n_xxx → 「用户改的节点名」；未知名称的 id 保留原文 */
export function humanizeNodeIds(text: string, config: CanvasConfig): string {
  let out = text;
  for (const n of config.pipeline.nodes) {
    if (!n.id || !n.name) continue;
    // id 出现在文本里（含引号/反引号场景统一处理）
    out = out.split(n.id).join(`「${n.name}」`);
  }
  return out;
}

/** 常见裸参数 key → 中文（只在反引号/引号内出现的才换，防误伤正文） */
const PARAM_LABELS: Record<string, string> = {
  dim: '分组维度',
  metrics: '指标列表',
  col: '目标列',
  prev: '对比基准列',
  method: '聚合方式',
  as: '输出列名',
  op: '条件',
  topN: '取前 N',
  dir: '排序方向',
};

export function humanizeParams(text: string): string {
  let out = text;
  for (const [k, label] of Object.entries(PARAM_LABELS)) {
    out = out.replace(new RegExp('`' + k + '`', 'g'), `\`${label}（${k}）\``);
  }
  return out;
}

/** 总入口：依次改写（顺序：id → 类型 → 参数） */
export function humanizeReply(text: string, config: CanvasConfig): string {
  return humanizeParams(humanizeNodeTypes(humanizeNodeIds(text, config)));
}
