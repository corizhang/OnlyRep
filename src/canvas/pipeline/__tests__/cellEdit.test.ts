import { describe, expect, it } from 'vitest';
import { runNode } from '../nodes';
import type { CleanedTable } from '../../../parser/clean';
import type { PipelineNode } from '../../types';

const table = (): CleanedTable => ({
  columns: [
    { key: 'name', type: 'text', rawName: '姓名' },
    { key: 'score', type: 'number', rawName: '分数' },
    { key: 'city', type: 'text', rawName: '城市' },
  ],
  rows: [
    { __idx: 0, name: '张三', score: 80, city: '沈阳' },
    { __idx: 1, name: '李四', score: 60, city: '大连' },
    { __idx: 2, name: '王五', score: null, city: '' },
  ],
} as unknown as CleanedTable);

const node = (params: Record<string, unknown>): PipelineNode => ({
  id: 'n1',
  type: 'cellEdit',
  name: '修数',
  inputs: ['s'],
  params,
  enabled: true,
});

const ctx = { env: {}, vars: [] } as never;

const out = (n: PipelineNode) => {
  const o = runNode(n, [{ kind: 'table', table: table() }], ctx);
  if (o.kind !== 'table') throw new Error('非表输出');
  return o.table.rows;
};

describe('修数节点', () => {
  it('批量规则：等值条件 + 字面量设值', () => {
    const rows = out(node({ edits: [{ matchCol: 'name', matchOp: 'eq', matchVal: '张三', setCol: 'score', setVal: '100' }] }));
    expect(rows[0].score).toBe(100);
    expect(rows[1].score).toBe(60);
  });

  it('{{列名}} 引用同行原值', () => {
    const rows = out(node({ edits: [{ matchCol: 'city', matchOp: 'contains', matchVal: '阳', setCol: 'city', setVal: '{{city}}市' }] }));
    expect(rows[0].city).toBe('沈阳市');
    expect(rows[1].city).toBe('大连');
  });

  it('为空条件 + 多条规则按序应用', () => {
    const rows = out(node({
      edits: [
        { matchCol: 'score', matchOp: 'empty', matchVal: '', setCol: 'score', setVal: '0' },
        { matchCol: 'score', matchOp: 'lt', matchVal: '70', setCol: 'city', setVal: '待提升' },
      ],
    }));
    expect(rows[2].score).toBe(0);
    expect(rows[1].city).toBe('待提升');
    expect(rows[2].city).toBe('待提升'); // 0 < 70 命中
  });

  it('定点编辑：主键列定位', () => {
    const rows = out(node({ pointEdits: [{ keyCol: 'name', key: '李四', col: 'score', value: '88' }] }));
    expect(rows[1].score).toBe(88);
    expect(rows[0].score).toBe(80);
  });

  it('定点编辑：__idx 行号兜底', () => {
    const rows = out(node({ pointEdits: [{ keyCol: '__idx', key: '2', col: 'city', value: '鞍山' }] }));
    expect(rows[2].city).toBe('鞍山');
  });

  it('无编辑规则 → 原样透传', () => {
    const rows = out(node({ edits: [], pointEdits: [] }));
    expect(rows[0].score).toBe(80);
  });
});
