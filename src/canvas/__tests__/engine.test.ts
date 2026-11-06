import { describe, expect, it } from 'vitest';
import type { CleanRow, CleanedTable } from '../../parser/clean';
import type { ColumnMeta } from '../../types';
import type { DataSource, PipelineNode, SourceRuntime } from '../types';
import { runGraph, topoSort, wouldCreateCycle } from '../pipeline/engine';
import { makeTable } from '../pipeline/nodes';

function col(key: string, type: ColumnMeta['type'] = 'number'): ColumnMeta {
  return { key, rawName: key, type, typeConfidence: 1, dirtyCount: 0, missingCount: 0, unitHint: '' };
}

function row(idx: number, values: Record<string, string | number | null>): CleanRow {
  const r: CleanRow = { __idx: idx };
  for (const [k, v] of Object.entries(values)) {
    r[k] = v;
    r[`${k}#raw`] = v === null ? '' : String(v);
  }
  return r;
}

const boardTable: CleanedTable = makeTable(
  [
    row(0, { 数据日期: '2026-10-29', 全量当日新增: 1204, 累计绑卡: 9083, 当日新增: 657 }),
    row(1, { 数据日期: '2026-10-28', 全量当日新增: 1045, 累计绑卡: 8496, 当日新增: 574 }),
    row(2, { 数据日期: '2026-10-27', 全量当日新增: 1127, 累计绑卡: 7984, 当日新增: 1116 }),
  ],
  [col('数据日期', 'text'), col('全量当日新增'), col('累计绑卡'), col('当日新增')],
);

const pushTable: CleanedTable = makeTable(
  [
    row(0, { 数据日期: '20261021', 渠道: '公众号', 总人数: 15009, 达标人数: 428 }),
    row(1, { 数据日期: '20261023', 渠道: '企微', 总人数: 11221, 达标人数: 161 }),
    row(2, { 数据日期: '20261027', 渠道: '企微', 总人数: 24296, 达标人数: 133 }),
  ],
  [col('数据日期', 'text'), col('渠道', 'text'), col('总人数'), col('达标人数')],
);

const sources: DataSource[] = [
  { id: 'ds_board', name: '活动看板', kind: 'import', fileName: '', sheetName: '' },
  { id: 'ds_push', name: '推送汇总', kind: 'import', fileName: '', sheetName: '' },
  { id: 'ds_params', name: '口径参数', kind: 'form', entries: [{ key: '全年目标', value: '420000' }] },
];

const runtime: Record<string, SourceRuntime> = {
  ds_board: { table: boardTable, status: 'ready', version: 1 },
  ds_push: { table: pushTable, status: 'ready', version: 1 },
};

function n(
  id: string,
  type: PipelineNode['type'],
  name: string,
  inputs: string[],
  params: Record<string, unknown> = {},
): PipelineNode {
  return { id, type, name, inputs, params, enabled: true };
}

describe('DAG 引擎', () => {
  it('拓扑排序：上游先执行', () => {
    const { order, cycle } = topoSort([
      n('b', 'filter', 'b', ['a']),
      n('a', 'source', 'a', []),
      n('c', 'scalarOut', 'c', ['b']),
    ]);
    expect(cycle).toEqual([]);
    expect(order.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('环检测：A→B→A 被识别', () => {
    const { cycle } = topoSort([n('a', 'filter', 'a', ['b']), n('b', 'filter', 'b', ['a'])]);
    expect(cycle.sort()).toEqual(['a', 'b']);
  });

  it('建链预检：会成环时返回 true', () => {
    const graph = { nodes: [n('a', 'filter', 'a', []), n('b', 'filter', 'b', ['a'])] };
    expect(wouldCreateCycle(graph, 'a', 'b')).toBe(true);
    expect(wouldCreateCycle(graph, 'b', 'a')).toBe(false);
  });

  it('取最新日期 + 标量输出', () => {
    const res = runGraph(
      {
        nodes: [
          n('src', 'source', '看板', [], { sourceId: 'ds_board' }),
          n('latest', 'pickRows', '最新', ['src'], { mode: 'latestDate', dateCol: '数据日期' }),
          n('today', 'scalarOut', '当日新增绑卡', ['latest'], { col: '全量当日新增', method: 'sum' }),
          n('total', 'scalarOut', '累计绑卡', ['latest'], { col: '累计绑卡', method: 'max' }),
        ],
      },
      { sourceDefs: sources, sources: runtime },
    );
    expect(res.env['当日新增绑卡']).toBe(1204);
    expect(res.env['累计绑卡']).toBe(9083);
  });

  it('筛选 + 汇总 + 计算字段', () => {
    const res = runGraph(
      {
        nodes: [
          n('src', 'source', '推送', [], { sourceId: 'ds_push' }),
          n('wx', 'filter', '企微', ['src'], { col: '渠道', op: 'contains', value: '企微' }),
          n('sum', 'scalarOut', '企微投放', ['wx'], { col: '总人数', method: 'sum' }),
          n('rate', 'formula', '企微成功率', [], { expr: '企微投放/35517' }),
          n('p', 'source', '参数', [], { sourceId: 'ds_params' }),
        ],
      },
      { sourceDefs: sources, sources: runtime },
    );
    expect(res.env['企微投放']).toBe(35517);
    expect(Number(res.env['企微成功率'])).toBeCloseTo(1, 5);
    expect(res.env['全年目标']).toBe(420000);
  });

  it('公式节点可引用其他公式节点（两阶段执行）', () => {
    const res = runGraph(
      {
        nodes: [
          n('p', 'source', '参数', [], { sourceId: 'ds_params' }),
          n('f1', 'formula', '完成率', [], { expr: '全年目标/2' }),
          n('f2', 'formula', '一半的一半', [], { expr: '完成率/2' }),
        ],
      },
      { sourceDefs: sources, sources: runtime },
    );
    expect(res.env['完成率']).toBe(210000);
    expect(res.env['一半的一半']).toBe(105000);
  });

  it('派生列：行公式引用列名', () => {
    const res = runGraph(
      {
        nodes: [
          n('src', 'source', '推送', [], { sourceId: 'ds_push' }),
          n('d', 'derive', '转化率列', ['src'], { name: '转化率', expr: '达标人数/总人数' }),
        ],
      },
      { sourceDefs: sources, sources: runtime },
    );
    const out = res.outputs['d'];
    expect(out.kind).toBe('table');
    if (out.kind === 'table') {
      expect(Number(out.table.rows[0]['转化率'])).toBeCloseTo(428 / 15009, 6);
      expect(out.table.columns.map((c) => c.key)).toContain('转化率');
    }
  });

  it('分组聚合', () => {
    const res = runGraph(
      {
        nodes: [
          n('src', 'source', '推送', [], { sourceId: 'ds_push' }),
          n('g', 'groupAgg', '按渠道', ['src'], {
            groupCol: '渠道',
            aggs: [
              { col: '总人数', method: 'sum', as: '投放' },
              { col: '达标人数', method: 'sum', as: '达标' },
            ],
          }),
        ],
      },
      { sourceDefs: sources, sources: runtime },
    );
    const out = res.outputs['g'];
    if (out.kind === 'table') {
      const wx = out.table.rows.find((r) => r['渠道'] === '企微');
      expect(wx?.['投放']).toBe(35517);
      expect(wx?.['达标']).toBe(294);
    } else {
      throw new Error('应输出表格');
    }
  });

  it('待导入的数据源给出可读错误而不是崩溃', () => {
    const res = runGraph(
      { nodes: [n('src', 'source', '看板', [], { sourceId: 'ds_board' })] },
      { sourceDefs: sources, sources: {} },
    );
    const out = res.outputs['src'];
    expect(out.kind).toBe('error');
    if (out.kind === 'error') expect(out.message).toContain('待导入');
  });

  it('指纹缓存：输入不变时复用上次输出', () => {
    const cache = new Map();
    const graph = {
      nodes: [
        n('src', 'source', '看板', [], { sourceId: 'ds_board' }),
        n('latest', 'pickRows', '最新', ['src'], { mode: 'latestDate', dateCol: '数据日期' }),
      ],
    };
    const a = runGraph(graph, { sourceDefs: sources, sources: runtime, cache });
    const b = runGraph(graph, { sourceDefs: sources, sources: runtime, cache });
    expect(a.outputs['latest']).toBe(b.outputs['latest']);
  });

  it('表单源改值后必须重算（指纹需含 def 内容，防缓存命中旧值）', () => {
    const cache = new Map();
    const graph = {
      nodes: [
        n('srcp', 'source', '口径参数', [], { sourceId: 'ds_params' }),
        n('f', 'formula', '完成率', [], { expr: '全年目标/2' }),
      ],
    };
    const defsA = [{ id: 'ds_params', name: '口径参数', kind: 'form', entries: [{ key: '全年目标', value: '420000' }] }] as typeof sources;
    const defsB = [{ id: 'ds_params', name: '口径参数', kind: 'form', entries: [{ key: '全年目标', value: '323033' }] }] as typeof sources;
    const r1 = runGraph(graph, { sourceDefs: defsA, sources: {}, cache });
    expect(r1.env['全年目标']).toBe(420000);
    const r2 = runGraph(graph, { sourceDefs: defsB, sources: {}, cache });
    expect(r2.env['全年目标']).toBe(323033);
  });

  it('差分：按日期列对齐（乱序安全），首日留空', () => {
    const res = runGraph(
      {
        nodes: [
          n('src', 'source', '看板', [], { sourceId: 'ds_board' }),
          n('d', 'diff', '较上日', ['src'], { col: '累计绑卡', dateCol: '数据日期', as: '较上日增加' }),
        ],
      },
      { sourceDefs: sources, sources: runtime },
    );
    const out = res.outputs['d'];
    if (out?.kind !== 'table') throw new Error('diff 应输出表格');
    const vals = out.table.rows.map((r) => r['较上日增加']);
    // 时间升序 7984 → 8496 → 9083：diff = null, 512, 587；写回原行序（10-29, 10-28, 10-27）
    expect(vals).toEqual([587, 512, null]);
  });

  it('差分：不选日期列时按现有行顺序', () => {
    const res = runGraph(
      {
        nodes: [
          n('src', 'source', '看板', [], { sourceId: 'ds_board' }),
          n('d', 'diff', '差分', ['src'], { col: '全量当日新增', dateCol: '', as: '' }),
        ],
      },
      { sourceDefs: sources, sources: runtime },
    );
    const out = res.outputs['d'];
    if (out?.kind !== 'table') throw new Error('diff 应输出表格');
    // 默认列名 = 数值列 + 较上日
    expect(out.table.rows.map((r) => r['全量当日新增较上日'])).toEqual([null, -159, 82]);
  });

  it('差分标量链路：差分 → 取最新日 → 取数', () => {
    const res = runGraph(
      {
        nodes: [
          n('src', 'source', '看板', [], { sourceId: 'ds_board' }),
          n('d', 'diff', '较上日', ['src'], { col: '累计绑卡', dateCol: '数据日期', as: '较上日增加' }),
          n('latest', 'pickRows', '最新', ['d'], { mode: 'latestDate', dateCol: '数据日期' }),
          n('v', 'scalarOut', '较上日增加', ['latest'], { col: '较上日增加', method: 'sum' }),
        ],
      },
      { sourceDefs: sources, sources: runtime },
    );
    expect(res.env['较上日增加']).toBe(587);
  });

  it('合并：两表纵向堆叠，列取并集、缺列补空', () => {
    const t1 = makeTable([row(0, { 数据日期: '20261104', 分行: '鞍山分行', m1人数: 3 })], [col('数据日期', 'text'), col('分行', 'text'), col('m1人数')]);
    const t2 = makeTable([row(0, { 数据日期: '20261105', 分行: '鞍山分行', m1人数: 5, 新列: 9 })], [col('数据日期', 'text'), col('分行', 'text'), col('m1人数'), col('新列')]);
    const rt = { ds_a: { table: t1, status: 'ready', version: 1 }, ds_b: { table: t2, status: 'ready', version: 1 } } as typeof runtime;
    const defs = [
      { id: 'ds_a', name: 'T-1', kind: 'import', fileName: '', sheetName: '' },
      { id: 'ds_b', name: 'T', kind: 'import', fileName: '', sheetName: '' },
    ] as typeof sources;
    const res = runGraph(
      {
        nodes: [
          n('a', 'source', 'T-1', [], { sourceId: 'ds_a' }),
          n('b', 'source', 'T', [], { sourceId: 'ds_b' }),
          n('u', 'union', '合并', ['a', 'b'], {}),
        ],
      },
      { sourceDefs: defs, sources: rt },
    );
    const out = res.outputs['u'];
    if (out?.kind !== 'table') throw new Error('union 应输出表格');
    expect(out.table.rows.length).toBe(2);
    expect(out.table.columns.map((c) => c.key)).toEqual(['数据日期', '分行', 'm1人数', '新列']);
    expect(out.table.rows[0]['新列']).toBe(null);
    expect(out.table.rows[1]['新列']).toBe(9);
  });

  it('合并 + 分组差分：两份日报快照按分行较上日', () => {
    const t1 = makeTable(
      [
        row(0, { 数据日期: '20261104', 分行: '鞍山分行', m1人数: 3, 达标人数: 6 }),
        row(1, { 数据日期: '20261104', 分行: '阜新分行', m1人数: 6, 达标人数: 1 }),
      ],
      [col('数据日期', 'text'), col('分行', 'text'), col('m1人数'), col('达标人数')],
    );
    const t2 = makeTable(
      [
        row(0, { 数据日期: '20261105', 分行: '鞍山分行', m1人数: 3, 达标人数: 5 }),
        row(1, { 数据日期: '20261105', 分行: '阜新分行', m1人数: 7, 达标人数: 1 }),
      ],
      [col('数据日期', 'text'), col('分行', 'text'), col('m1人数'), col('达标人数')],
    );
    const rt = { ds_a: { table: t1, status: 'ready', version: 1 }, ds_b: { table: t2, status: 'ready', version: 1 } } as typeof runtime;
    const defs = [
      { id: 'ds_a', name: 'T-1', kind: 'import', fileName: '', sheetName: '' },
      { id: 'ds_b', name: 'T', kind: 'import', fileName: '', sheetName: '' },
    ] as typeof sources;
    const res = runGraph(
      {
        nodes: [
          n('a', 'source', 'T-1', [], { sourceId: 'ds_a' }),
          n('b', 'source', 'T', [], { sourceId: 'ds_b' }),
          n('u', 'union', '合并', ['a', 'b'], {}),
          n('d', 'diff', 'm1较上日', ['u'], { col: 'm1人数', dateCol: '数据日期', groupCol: '分行', as: 'm1较上日' }),
          n('f', 'filter', '只看T', ['d'], { col: '数据日期', op: 'eq', value: '20261105' }),
        ],
      },
      { sourceDefs: defs, sources: rt },
    );
    const out = res.outputs['f'];
    if (out?.kind !== 'table') throw new Error('filter 应输出表格');
    // 鞍山 3-3=0，阜新 7-6=1
    expect(out.table.rows.map((r) => [r['分行'], r['m1较上日']])).toEqual([
      ['鞍山分行', 0],
      ['阜新分行', 1],
    ]);
  });
});
