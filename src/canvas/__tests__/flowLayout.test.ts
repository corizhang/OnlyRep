import { describe, expect, it } from 'vitest';
import type { PipelineNode } from '../types';
import { computeFlowLayout, edgePath, NODE_H, NODE_W, type LayoutNode } from '../flow/layout';

function n(id: string, inputs: string[] = [], type: PipelineNode['type'] = 'filter'): PipelineNode {
  return { id, type, name: id, inputs, params: {}, enabled: true };
}

const byId = (nodes: LayoutNode[]): Record<string, LayoutNode> => Object.fromEntries(nodes.map((x) => [x.id, x]));

describe('computeFlowLayout 自动分层', () => {
  it('线性链按依赖深度从左到右排布', () => {
    const nodes = [n('s', [], 'source'), n('a', ['s']), n('b', ['a'])];
    const r = computeFlowLayout(nodes);
    const pos = byId(r.nodes);
    expect(pos.s.depth).toBe(0);
    expect(pos.a.depth).toBe(1);
    expect(pos.b.depth).toBe(2);
    expect(pos.a.x).toBe(NODE_W + 104);
    expect(pos.a.x).toBeGreaterThan(pos.s.x);
    expect(pos.b.x).toBeGreaterThan(pos.a.x);
  });

  it('两输入汇合的节点取最长路径深度（分叉后收拢）', () => {
    const nodes = [
      n('s1', [], 'source'),
      n('s2', [], 'source'),
      n('a', ['s1']),
      n('b', ['a']),
      n('m', ['s2', 'b']),
    ];
    const r = computeFlowLayout(nodes);
    const pos = byId(r.nodes);
    expect(pos.m.depth).toBe(3);
    expect(r.edges.filter((e) => e.to === 'm')).toHaveLength(2);
  });

  it('同层节点纵向不重叠且垂直居中', () => {
    const nodes = [n('s1', [], 'source'), n('s2', [], 'source'), n('s3', [], 'source')];
    const r = computeFlowLayout(nodes);
    const ys = r.nodes.map((x) => x.y).sort((a, b) => a - b);
    expect(ys[1] - ys[0]).toBe(NODE_H + 26);
    expect(ys[2] - ys[1]).toBe(NODE_H + 26);
  });

  it('手动位置覆盖自动布局，未覆盖的仍自动', () => {
    const nodes = [n('s', [], 'source'), n('a', ['s'])];
    const r = computeFlowLayout(nodes, { s: { x: 500, y: 300 } });
    const pos = byId(r.nodes);
    expect(pos.s.x).toBe(500);
    expect(pos.s.y).toBe(300);
    expect(pos.a.x).toBe(0 + NODE_W + 104);
  });

  it('悬空输入不产生边，非法覆盖坐标被忽略', () => {
    const nodes = [n('a', ['missing'])];
    const r = computeFlowLayout(nodes, { a: { x: Number.NaN, y: 0 } });
    expect(r.edges).toHaveLength(0);
    expect(r.nodes[0].x).toBe(0);
  });

  it('存在环时不递归爆栈，深度安全降级', () => {
    const nodes = [n('a', ['b']), n('b', ['a'])];
    const r = computeFlowLayout(nodes);
    expect(r.nodes).toHaveLength(2);
    expect(r.nodes.every((x) => Number.isFinite(x.x) && Number.isFinite(x.y))).toBe(true);
  });

  it('画布尺寸覆盖所有节点右下角', () => {
    const nodes = [n('s', [], 'source'), n('a', ['s'])];
    const r = computeFlowLayout(nodes);
    for (const x of r.nodes) {
      expect(r.width).toBeGreaterThanOrEqual(x.x + NODE_W);
      expect(r.height).toBeGreaterThanOrEqual(x.y + NODE_H);
    }
  });
});

describe('edgePath 连线', () => {
  it('从右侧中点连到左侧中点', () => {
    const d = edgePath({ x: 0, y: 0 }, { x: 400, y: 100 });
    expect(d).toContain(`M ${NODE_W} ${NODE_H / 2}`);
    expect(d).toContain('C');
    expect(d.trim().endsWith(`400 ${100 + NODE_H / 2}`)).toBe(true);
  });
});
