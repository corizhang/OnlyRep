import type { CanvasBlock, RowBlockConfig } from '../types';

/**
 * 容器结构工具（行容器 → 分栏容器升级）：
 * - 旧版 config.children=[b1,b2,b3]（每子块占一列）→ columns=[{blocks:[b1]},...]
 * - 树递归遍历/更新的统一入口（columns 感知）
 */

/** 旧版 children → 新版 columns（幂等；已是 columns 则原样返回） */
export function normalizeRowConfig(cfg: RowBlockConfig & { children?: CanvasBlock[] }): RowBlockConfig {
  if (Array.isArray(cfg.columns)) return cfg;
  const children = Array.isArray(cfg.children) ? cfg.children : [];
  return {
    widths: cfg.widths,
    align: cfg.align,
    columns: children.map((b) => ({ blocks: [b] })),
  };
}

/** 深度遍历所有块（含容器列内嵌套） */
export function walkBlocks(blocks: CanvasBlock[], fn: (b: CanvasBlock) => void): void {
  for (const b of blocks) {
    fn(b);
    if (b.type === 'row') {
      for (const col of b.config.columns) walkBlocks(col.blocks, fn);
    }
  }
}

/** 树递归 map（返回新数组；容器列递归处理） */
export function mapBlocks(blocks: CanvasBlock[], fn: (b: CanvasBlock) => CanvasBlock): CanvasBlock[] {
  return blocks.map((b) => {
    if (b.type === 'row') {
      const mapped = {
        ...b,
        config: { ...b.config, columns: b.config.columns.map((c) => ({ blocks: mapBlocks(c.blocks, fn) })) },
      } as CanvasBlock;
      return fn(mapped);
    }
    return fn(b);
  });
}

/** 树递归查找块 */
export function findBlock(blocks: CanvasBlock[], id: string): CanvasBlock | null {
  for (const b of blocks) {
    if (b.id === id) return b;
    if (b.type === 'row') {
      for (const col of b.config.columns) {
        const hit = findBlock(col.blocks, id);
        if (hit) return hit;
      }
    }
  }
  return null;
}

/** 定位块的父堆栈（顶层则 parent 为 null，stack 为根数组语义） */
export function locateBlock(
  blocks: CanvasBlock[],
  id: string,
): { rowId: string | null; colIdx: number; index: number } | null {
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].id === id) return { rowId: null, colIdx: -1, index: i };
    const b = blocks[i];
    if (b.type === 'row') {
      for (let c = 0; c < b.config.columns.length; c++) {
        const inner = locateBlock(b.config.columns[c].blocks, id);
        if (inner) {
          return inner.rowId === null && inner.colIdx === -1 ? { rowId: b.id, colIdx: c, index: inner.index } : inner;
        }
      }
    }
  }
  return null;
}
