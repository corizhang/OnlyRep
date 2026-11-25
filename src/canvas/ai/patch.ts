import type { CanvasBlock, CanvasConfig, PipelineNode } from '../types';
import { sanitizeCanvasConfig } from '../template';

/**
 * 增量 patch 协议（二期）：AI 对现有画布的局部修改。
 * 设计原则：纯函数（config + ops → newConfig），结果过 sanitize 校验，非法即整体拒绝——
 * 与全量生成同一道防线，绝不把画布改崩。
 */

export type PatchOp =
  | { op: 'setTitle'; title: string }
  | { op: 'setTheme'; accentColor?: string; pageBg?: string; themeId?: CanvasConfig['themeId'] }
  | { op: 'updateCanvas'; patch: { width?: number; baseFontSize?: number; exportScale?: 1 | 2 | 4; padding?: number; gap?: number } }
  | { op: 'addBlock'; block: CanvasBlock; afterId?: string }
  | { op: 'updateBlock'; id: string; config: Record<string, unknown> }
  | { op: 'removeBlock'; id: string }
  | { op: 'updateNode'; id: string; name?: string; params?: Record<string, unknown> }
  | { op: 'addNode'; node: PipelineNode; afterId?: string }
  | { op: 'removeNode'; id: string };

export interface PatchRequest {
  action: 'patch';
  summary: string;
  ops: PatchOp[];
}

/** 从 AI 输出识别 patch 请求（非 patch 返回 null） */
export function parsePatch(text: string): PatchRequest | null {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const p = parsed as Partial<PatchRequest>;
  if (p?.action !== 'patch' || !Array.isArray(p.ops) || p.ops.length === 0) return null;
  return { action: 'patch', summary: String(p.summary ?? '增量修改'), ops: p.ops as PatchOp[] };
}

/** 递归在块树里找块（含容器列内） */
function mapBlocks(blocks: CanvasBlock[], fn: (b: CanvasBlock) => CanvasBlock | null): CanvasBlock[] {
  const out: CanvasBlock[] = [];
  for (const b of blocks) {
    if (b.type === 'row') {
      out.push({ ...b, config: { ...b.config, columns: b.config.columns.map((col) => ({ ...col, blocks: mapBlocks(col.blocks, fn) })) } });
      continue;
    }
    const r = fn(b);
    if (r) out.push(r);
  }
  return out;
}

/** 应用 ops（顺序执行），返回新 config；非法操作抛错（整体不应用） */
export function applyPatchOps(config: CanvasConfig, ops: PatchOp[]): CanvasConfig {
  let next = config;
  for (const [i, op] of ops.entries()) {
    const where = `第 ${i + 1} 个操作`;
    switch (op.op) {
      case 'setTitle': {
        if (!op.title?.trim()) throw new Error(`${where}（setTitle）：标题不能为空`);
        next = { ...next, title: op.title.trim() };
        break;
      }
      case 'setTheme': {
        next = {
          ...next,
          ...(op.themeId ? { themeId: op.themeId } : {}),
          ...(op.accentColor !== undefined ? { accentColor: op.accentColor } : {}),
          ...(op.pageBg !== undefined ? { pageBg: op.pageBg } : {}),
        };
        break;
      }
      case 'updateCanvas': {
        next = { ...next, ...op.patch };
        break;
      }
      case 'addBlock': {
        if (!op.block?.type) throw new Error(`${where}（addBlock）：缺少块定义`);
        const block = op.block;
        if (!op.afterId) {
          next = { ...next, blocks: [...next.blocks, block] };
          break;
        }
        const idx = next.blocks.findIndex((b) => b.id === op.afterId);
        if (idx < 0) throw new Error(`${where}（addBlock）：找不到目标块 ${op.afterId}`);
        const blocks = [...next.blocks];
        blocks.splice(idx + 1, 0, block);
        next = { ...next, blocks };
        break;
      }
      case 'updateBlock': {
        let found = false;
        next = {
          ...next,
          blocks: mapBlocks(next.blocks, (b) => {
            if (b.id !== op.id) return b;
            found = true;
            return { ...b, config: { ...b.config, ...op.config } } as CanvasBlock;
          }),
        };
        if (!found) throw new Error(`${where}（updateBlock）：找不到块 ${op.id}`);
        break;
      }
      case 'removeBlock': {
        let found = false;
        next = {
          ...next,
          blocks: mapBlocks(next.blocks, (b) => {
            if (b.id === op.id) {
              found = true;
              return null;
            }
            return b;
          }),
        };
        if (!found) throw new Error(`${where}（removeBlock）：找不到块 ${op.id}`);
        break;
      }
      case 'updateNode': {
        const idx = next.pipeline.nodes.findIndex((n) => n.id === op.id);
        if (idx < 0) throw new Error(`${where}（updateNode）：找不到节点 ${op.id}`);
        const nodes = [...next.pipeline.nodes];
        const cur = nodes[idx];
        nodes[idx] = { ...cur, ...(op.name ? { name: op.name } : {}), params: { ...cur.params, ...(op.params ?? {}) } };
        next = { ...next, pipeline: { nodes } };
        break;
      }
      case 'addNode': {
        if (!op.node?.id || !op.node?.type) throw new Error(`${where}（addNode）：节点定义不完整（缺 id/type）`);
        if (next.pipeline.nodes.some((n) => n.id === op.node.id)) throw new Error(`${where}（addNode）：节点 id 重复 ${op.node.id}`);
        // afterId：把该节点插到 afterId 下游（inputs=[afterId]；afterId 原下游重接到新节点）
        let node: PipelineNode = { ...op.node, inputs: Array.isArray(op.node.inputs) ? [...op.node.inputs] : [], enabled: op.node.enabled !== false };
        let nodes = [...next.pipeline.nodes];
        if (op.afterId) {
          if (!next.pipeline.nodes.some((n) => n.id === op.afterId)) throw new Error(`${where}（addNode）：找不到上游节点 ${op.afterId}`);
          node = { ...node, inputs: [op.afterId] };
          nodes = nodes.map((n) => (n.inputs.includes(op.afterId!) ? { ...n, inputs: n.inputs.map((i) => (i === op.afterId ? node.id : i)) } : n));
        }
        next = { ...next, pipeline: { nodes: [...nodes, node] } };
        break;
      }
      case 'removeNode': {
        const target = next.pipeline.nodes.find((n) => n.id === op.id);
        if (!target) throw new Error(`${where}（removeNode）：找不到节点 ${op.id}`);
        const dependents = next.pipeline.nodes.filter((n) => n.inputs.includes(op.id));
        if (dependents.length > 0) throw new Error(`${where}（removeNode）：节点 ${op.id} 被 ${dependents.map((d) => d.name || d.id).join('、')} 依赖，先处理下游`);
        next = { ...next, pipeline: { nodes: next.pipeline.nodes.filter((n) => n.id !== op.id) } };
        break;
      }
      default:
        throw new Error(`${where}：未知操作类型`);
    }
  }
  // 结果必须过全量校验（防线与全量生成一致）
  return sanitizeCanvasConfig(next);
}

/** 画布摘要：给 AI 的「现有画布是什么样」（块 id + 类型 + 关键文案，patch 需要知道 id） */
export function canvasSummary(config: CanvasConfig, max = 40): string {
  const lines: string[] = [];
  const walk = (blocks: CanvasBlock[], depth: number): void => {
    for (const b of blocks) {
      if (lines.length >= max) return;
      const cfg = b.config as unknown as Record<string, unknown>;
      const label = String(cfg.content ?? cfg.title ?? cfg.label ?? '').slice(0, 20);
      lines.push(`${'  '.repeat(depth)}- ${b.type} (id=${b.id})${label ? ` ${label}` : ''}`);
      if (b.type === 'row') for (const col of b.config.columns) walk(col.blocks, depth + 1);
    }
  };
  walk(config.blocks, 0);
  const nodes = config.pipeline.nodes.map((n) => `${n.id}(${n.type}:${n.name})`).join('、');
  return `当前画布「${config.title}」：\n块：\n${lines.join('\n') || '（空）'}\n节点：${nodes || '（无）'}`;
}
