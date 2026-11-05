import type { PipelineNode } from '../types';

/**
 * 流程视图自动布局（ARCH P2.1）。
 *
 * 规则：按依赖深度从左到右分层（数据源在最左，末端节点在最右），同层按管道内定义顺序纵向排列并整体居中；
 * 用户手动拖动过的节点用 flowPos 覆盖坐标，其余节点继续自动排布。
 * 纯函数、无 DOM 依赖，便于单测。
 */

export const NODE_W = 248;
/** 兜底估高：节点实际高度由 DOM 测量后经 heights 覆盖 */
export const NODE_H = 78;
const GAP_X = 104;
const GAP_Y = 26;

export interface FlowPos {
  x: number;
  y: number;
}

export interface LayoutNode extends FlowPos {
  id: string;
  /** 依赖深度（0 = 无上游） */
  depth: number;
  /** 同层内的序号 */
  row: number;
}

export interface LayoutEdge {
  from: string;
  to: string;
}

export interface LayoutResult {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  byId: Record<string, LayoutNode>;
  /** 画布内容尺寸（含节点尺寸） */
  width: number;
  height: number;
}

/** 计算依赖深度：沿 inputs 回溯的最长路径；环与悬空输入安全降级 */
export function depthOf(nodeId: string, byId: Map<string, PipelineNode>, memo = new Map<string, number>(), visiting = new Set<string>()): number {
  const cached = memo.get(nodeId);
  if (cached !== undefined) return cached;
  if (visiting.has(nodeId)) return 0; // 环：就地截断，避免死循环
  const node = byId.get(nodeId);
  if (!node) return 0;

  visiting.add(nodeId);
  let depth = 0;
  for (const input of node.inputs) {
    if (!byId.has(input)) continue;
    depth = Math.max(depth, depthOf(input, byId, memo, visiting) + 1);
  }
  visiting.delete(nodeId);
  memo.set(nodeId, depth);
  return depth;
}

export function computeFlowLayout(
  nodes: PipelineNode[],
  overrides: Record<string, FlowPos> = {},
  heights: Record<string, number> = {},
): LayoutResult {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const memo = new Map<string, number>();
  /** 节点实际高度：DOM 测量值优先，兜底 NODE_H */
  const hOf = (id: string): number => {
    const h = heights[id];
    return typeof h === 'number' && Number.isFinite(h) && h > 20 ? h : NODE_H;
  };

  // 1) 分层
  const layers = new Map<number, PipelineNode[]>();
  for (const node of nodes) {
    const d = depthOf(node.id, byId, memo);
    const list = layers.get(d) ?? [];
    list.push(node);
    layers.set(d, list);
  }

  // 2) 同层纵向排列 + 整体垂直居中（层高按实际高度累加）
  const contentHeight = Math.max(
    1,
    ...Array.from(layers.values(), (l) => l.reduce((s, n) => s + hOf(n.id), 0) + (l.length - 1) * GAP_Y),
  );

  const out: LayoutNode[] = [];
  for (const depth of Array.from(layers.keys()).sort((a, b) => a - b)) {
    const list = layers.get(depth)!;
    const layerHeight = list.reduce((s, n) => s + hOf(n.id), 0) + (list.length - 1) * GAP_Y;
    const offsetY = Math.max(0, (contentHeight - layerHeight) / 2);
    list.forEach((node, row) => {
      // 同层纵向：累计前序节点的实际高度（配置内嵌后高度不再固定）
      const yOff = list.slice(0, row).reduce((s, m) => s + hOf(m.id), 0) + row * GAP_Y;
      const auto: FlowPos = {
        x: depth * (NODE_W + GAP_X),
        y: offsetY + yOff,
      };
      const manual = overrides[node.id];
      const pos = manual && Number.isFinite(manual.x) && Number.isFinite(manual.y) ? manual : auto;
      out.push({ id: node.id, depth, row, x: pos.x, y: pos.y });
    });
  }

  // 3) 边（悬空输入忽略）
  const edges: LayoutEdge[] = [];
  for (const node of nodes) {
    for (const input of node.inputs) {
      if (byId.has(input)) edges.push({ from: input, to: node.id });
    }
  }

  const byIdPos: Record<string, LayoutNode> = {};
  let maxX = 0;
  let maxY = 0;
  for (const n of out) {
    byIdPos[n.id] = n;
    maxX = Math.max(maxX, n.x + NODE_W);
    maxY = Math.max(maxY, n.y + hOf(n.id));
  }

  return { nodes: out, edges, byId: byIdPos, width: maxX, height: maxY };
}

/** 边的三次贝塞尔路径（左右连接，中段走水平切线）；高度传 DOM 实测值，默认兜底 NODE_H */
export function edgePath(from: FlowPos, to: FlowPos, fromH: number = NODE_H, toH: number = NODE_H): string {
  const x1 = from.x + NODE_W;
  const y1 = from.y + Math.max(20, fromH) / 2;
  const x2 = to.x;
  const y2 = to.y + Math.max(20, toH) / 2;
  const dx = Math.max(36, Math.abs(x2 - x1) * 0.45);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}
