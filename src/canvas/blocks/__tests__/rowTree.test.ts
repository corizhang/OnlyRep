import { describe, expect, it } from 'vitest';
import { normalizeRowConfig, walkBlocks, findBlock } from '../rowTree';
import type { CanvasBlock, RowBlockConfig } from '../../types';

const txt = (id: string): CanvasBlock => ({
  id,
  type: 'text',
  config: { content: id, role: 'note', fontSizeScale: 1, bold: false, align: 'left', colorMode: 'theme', customColor: '' },
});

describe('容器结构迁移与树工具', () => {
  it('老版 children（每子块一列）→ columns', () => {
    const legacy = { widths: [34, 33, 33], align: 'stretch', children: [txt('a'), txt('b'), txt('c')] } as unknown as RowBlockConfig & { children: CanvasBlock[] };
    const norm = normalizeRowConfig(legacy);
    expect(norm.columns).toHaveLength(3);
    expect(norm.columns[0].blocks[0].id).toBe('a');
    expect(norm.columns[2].blocks[0].id).toBe('c');
  });

  it('已是 columns 结构 → 幂等原样', () => {
    const cur = { widths: [50, 50], align: 'stretch' as const, columns: [{ blocks: [txt('a')] }, { blocks: [] }] };
    expect(normalizeRowConfig(cur)).toBe(cur);
  });

  it('树遍历覆盖嵌套列', () => {
    const nested: CanvasBlock = {
      id: 'r1',
      type: 'row',
      config: {
        widths: [50, 50],
        align: 'stretch',
        columns: [
          { blocks: [txt('x'), { id: 'r2', type: 'row', config: { widths: [100], align: 'stretch', columns: [{ blocks: [txt('deep')] }] } }] },
          { blocks: [] },
        ],
      },
    };
    const ids: string[] = [];
    walkBlocks([nested], (b) => ids.push(b.id));
    expect(ids).toEqual(['r1', 'x', 'r2', 'deep']);
    expect(findBlock([nested], 'deep')?.id).toBe('deep');
  });
});
