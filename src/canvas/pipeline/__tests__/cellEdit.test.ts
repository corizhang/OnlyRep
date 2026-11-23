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

  it('修数后 #raw 同步：下游筛选「包含」能命中新值（用户真实场景回归）', () => {
    // 模拟导入表（带 #raw 伴生值，与解析器产物一致）
    const withRaw = (): CleanedTable => ({
      columns: [
        { key: '客群', type: 'text', rawName: '客群名称' },
        { key: '渠道', type: 'text', rawName: '渠道' },
      ],
      rows: [
        { __idx: 0, '客群': '短信-特邀推送', '客群#raw': '短信-特邀推送', '渠道': '短信', '渠道#raw': '短信' },
        { __idx: 1, '客群': '公众号-快捷支付', '客群#raw': '公众号-快捷支付', '渠道': '公众号', '渠道#raw': '公众号' },
      ],
    } as unknown as CleanedTable);
    const editNode: PipelineNode = { id: 'e', type: 'cellEdit', name: '修数', inputs: ['s'], params: { edits: [{ matchCol: '客群', matchOp: 'contains', matchVal: '短信', setCol: '客群', setVal: '公众号-{{客群}}' }] }, enabled: true };
    const edited = runNode(editNode, [{ kind: 'table', table: withRaw() }], ctx);
    if (edited.kind !== 'table') throw new Error('非表输出');
    expect(edited.table.rows[0]['客群']).toBe('公众号-短信-特邀推送');
    expect(edited.table.rows[0]['客群#raw']).toBe('公众号-短信-特邀推送');

    // 下游筛选：客群 包含 公众号 → 应含修数改出来的行
    const filterNode: PipelineNode = { id: 'f', type: 'filter', name: '筛选', inputs: ['e'], params: { col: '客群', op: 'contains', value: '公众号' }, enabled: true };
    const filtered = runNode(filterNode, [edited], ctx);
    if (filtered.kind !== 'table') throw new Error('非表输出');
    expect(filtered.table.rows).toHaveLength(2); // 修复前只有 1 行（raw 残留旧值）
  });

  it('同节点规则按序：后规则基于前规则的改动匹配', () => {
    const rows = out(node({
      edits: [
        { matchCol: 'name', matchOp: 'eq', matchVal: '张三', setCol: 'city', setVal: '北京' },
        { matchCol: 'city', matchOp: 'eq', matchVal: '北京', setCol: 'score', setVal: '99' },
      ],
    }));
    expect(rows[0].city).toBe('北京');
    expect(rows[0].score).toBe(99); // 第二规则基于改后的 city 命中
  });
});
