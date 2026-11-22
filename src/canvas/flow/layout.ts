import type { PipelineNode } from '../types';

/**
 * 流程视图自动布局（ARCH P2.1）。
 *
 * 规则：按依赖深度从左到右分层（数据源在最左，末端节点在最右），同层按上游位置排序并对齐，留出节点间距；
 * 用户手动拖动过的节点用 flowPos 覆盖坐标，其余节点继续自动排布。
 * 纯函数、无 DOM 依赖，便于单测。
 */

export const NODE_W = 300;
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
  lane?: number;
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
  anchorId?: string,
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
    const upstreamY = (node: PipelineNode): number | undefined => {
      const parents = node.inputs.map((id) => out.find((p) => p.id === id)).filter((p): p is LayoutNode => Boolean(p));
      return parents.length ? parents.reduce((sum, p) => sum + p.y + hOf(p.id) / 2, 0) / parents.length : undefined;
    };
    const list = [...layers.get(depth)!].sort((a, b) => (upstreamY(a) ?? 0) - (upstreamY(b) ?? 0));
    const layerHeight = list.reduce((s, n) => s + hOf(n.id), 0) + (list.length - 1) * GAP_Y;
    const offsetY = Math.max(0, (contentHeight - layerHeight) / 2);
    let nextY = 0;
    list.forEach((node, row) => {
      // 同层纵向：累计前序节点的实际高度（配置内嵌后高度不再固定）
      const yOff = list.slice(0, row).reduce((s, m) => s + hOf(m.id), 0) + row * GAP_Y;
      const auto: FlowPos = {
        x: depth * (NODE_W + GAP_X),
        y: Math.max(nextY, (upstreamY(node) ?? (offsetY + yOff + hOf(node.id) / 2)) - hOf(node.id) / 2),
      };
      const manual = overrides[node.id];
      const pos = manual && Number.isFinite(manual.x) && Number.isFinite(manual.y) ? manual : auto;
      out.push({ id: node.id, depth, row, x: pos.x, y: pos.y });
      nextY = auto.y + hOf(node.id) + GAP_Y;
    });
  }

  // 3) 选中节点展开时临时避让：锚点保持原位，其他节点只做纵向位移。
  // 位移只存在于本次布局结果中，不写入 flowPos；折叠/取消选择后自动回到用户原坐标。
  const anchor = out.find((n) => n.id === anchorId);
  if (anchor && hOf(anchor.id) > NODE_H + 16) {
    const ordered = [anchor, ...out.filter((n) => n.id !== anchor.id).sort((a, b) => a.y - b.y || a.x - b.x)];
    const placed: LayoutNode[] = [];
    for (const node of ordered) {
      const current = { ...node };
      if (current.id !== anchor.id) {
        let guard = 0;
        while (guard++ < nodes.length * 4) {
          const collision = placed.find((p) =>
            current.x < p.x + NODE_W && current.x + NODE_W > p.x &&
            current.y < p.y + hOf(p.id) + GAP_Y && current.y + hOf(current.id) + GAP_Y > p.y,
          );
          if (!collision) break;
          const currentCenter = current.y + hOf(current.id) / 2;
          const collisionCenter = collision.y + hOf(collision.id) / 2;
          if (currentCenter >= collisionCenter) {
            current.y = collision.y + hOf(collision.id) + GAP_Y;
          } else {
            current.y = Math.max(0, collision.y - hOf(current.id) - GAP_Y);
          }
        }
      }
      placed.push(current);
    }
    out.splice(0, out.length, ...placed.sort((a, b) => a.depth - b.depth || a.row - b.row));
  }

  // 4) 边（悬空输入忽略）
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

  // Each source owns a distinct vertical lane within its layer gap.
  for (const edge of edges) {
    const sources = out.filter((n) => n.depth === byIdPos[edge.from].depth && edges.some((e) => e.from === n.id)).sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));
    edge.lane = 0.25 + 0.5 * (sources.findIndex((n) => n.id === edge.from) + 1) / (sources.length + 1);
  }
  return { nodes: out, edges, byId: byIdPos, width: maxX, height: maxY };
}

/** Orthogonal routes keep a horizontal lead-in at each port. */
function edgePoints(from: FlowPos, to: FlowPos, fromH: number, toH: number, lane: number): FlowPos[] {
  const start = { x: from.x + NODE_W, y: from.y + Math.max(20, fromH) / 2 };
  const end = { x: to.x - 7, y: to.y + Math.max(20, toH) / 2 };
  const gap = end.x - start.x;
  if (gap >= 48) {
    const x = start.x + 20 + (gap - 40) * Math.max(0, Math.min(1, lane));
    return [start, { x, y: start.y }, { x, y: end.y }, end];
  }
  // Reverse/close connections go around the top instead of turning through a node.
  const top = Math.min(from.y, to.y) - 32 - lane * 24;
  return [start, { x: start.x + 24, y: start.y }, { x: start.x + 24, y: top }, { x: end.x - 24, y: top }, { x: end.x - 24, y: end.y }, end];
}

export function edgePath(from: FlowPos, to: FlowPos, fromH: number = NODE_H, toH: number = NODE_H, lane = 0.5): string {
  const points = edgePoints(from, to, fromH, toH, lane).filter((p, i, list) => !i || p.x !== list[i - 1].x || p.y !== list[i - 1].y);
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1], p = points[i], next = points[i + 1];
    const before = Math.hypot(p.x - prev.x, p.y - prev.y);
    const after = Math.hypot(next.x - p.x, next.y - p.y);
    const r = Math.min(8, before / 2, after / 2);
    const a = { x: p.x + (prev.x - p.x) * r / before, y: p.y + (prev.y - p.y) * r / before };
    const b = { x: p.x + (next.x - p.x) * r / after, y: p.y + (next.y - p.y) * r / after };
    path += ` L ${a.x} ${a.y} Q ${p.x} ${p.y} ${b.x} ${b.y}`;
  }
  const end = points[points.length - 1];
  return `${path} L ${end.x} ${end.y}`;
}

/** Halfway along the route, keeping the delete action on its connection. */
export function edgeMid(from: FlowPos, to: FlowPos, fromH: number = NODE_H, toH: number = NODE_H, lane = 0.5): FlowPos {
  const points = edgePoints(from, to, fromH, toH, lane);
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2;
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i] && lengths[i] > 0) {
      const t = remaining / lengths[i];
      return { x: points[i].x + (points[i + 1].x - points[i].x) * t, y: points[i].y + (points[i + 1].y - points[i].y) * t };
    }
    remaining -= lengths[i];
  }
  return points[0];
}

/** 矩形相交（框选用） */
export function rectsIntersect(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
