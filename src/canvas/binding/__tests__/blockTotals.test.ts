import { describe, expect, it } from 'vitest';
import type { CleanedTable, CleanRow } from '../../../parser/clean';
import { collectBlockTotalVars } from '../blockTotals';
import type { ResolveContext } from '../resolve';
import type { CanvasConfig, DataTableConfig, NodeOutput, TableColumnConfig } from '../../types';

function cleanTable(rows: Record<string, string | number>[]): CleanedTable {
  return {
    rows: rows.map((r, i) => ({ __idx: i, ...r })) as CleanRow[],
    columns: [],
    totalRows: rows.length,
    excludedCount: 0,
    dirtyCells: {},
  };
}

function tableBlock(id: string, title: string, nodeRef: string, columns: TableColumnConfig[]) {
  const config: DataTableConfig = {
    id,
    type: 'dataTable',
    title,
    table: { nodeRef },
    columns,
    zebra: true,
    showHeader: true,
    headerBold: false,
    totalRow: true,
    totalLabel: '合计',
    highlightRules: [],
    maxRows: 0,
    fontSizeScale: 1,
    showIndex: false,
    cardBg: '',
  } as unknown as DataTableConfig;
  return { id, type: 'dataTable' as const, config };
}

describe('collectBlockTotalVars 合计行变量（R4-07 增补）', () => {
  const cols: TableColumnConfig[] = [
    { col: '投放人数', label: '投放人数', align: 'right', format: 'number', decimals: 'auto' },
    { col: '累计绑卡', label: '累计绑卡', align: 'right', format: 'number', decimals: 'auto' },
  ];
  const table = cleanTable([
    { 投放人数: 11221, 累计绑卡: 194 },
    { 投放人数: 24296, 累计绑卡: 197 },
  ]);
  const outputs: Record<string, NodeOutput> = {
    n1: { kind: 'table', table },
    n2: { kind: 'table', table },
  };
  const ctx: ResolveContext = { outputs, env: {}, sources: [] };

  it('两个表格同名同字段 → 第二个自动加序号，不再互相覆盖', () => {
    const config = {
      blocks: [tableBlock('b1', '表格', 'n1', cols), tableBlock('b2', '表格', 'n2', cols)],
      dataSources: [],
      pipeline: { nodes: [] },
    } as unknown as CanvasConfig;
    const { env, vars } = collectBlockTotalVars(config, ctx);
    expect(env['表格_投放人数']).toBe(35517);
    expect(env['表格2_投放人数']).toBe(35517);
    expect(env['表格_累计绑卡']).toBe(391);
    expect(env['表格2_累计绑卡']).toBe(391);
    expect(vars.map((v) => v.name)).toEqual([
      '表格_投放人数',
      '表格_累计绑卡',
      '表格2_投放人数',
      '表格2_累计绑卡',
    ]);
  });

  it('三个表格、前两个同名第三个不同名 → 第三个用原始名', () => {
    const third: TableColumnConfig[] = [
      { col: '累计绑卡', label: '累计绑卡', align: 'right', format: 'number', decimals: 'auto' },
    ];
    const config = {
      blocks: [
        tableBlock('b1', '表格', 'n1', cols),
        tableBlock('b2', '表格', 'n2', cols),
        tableBlock('b3', '分行', 'n1', third),
      ],
      dataSources: [],
      pipeline: { nodes: [] },
    } as unknown as CanvasConfig;
    const { env } = collectBlockTotalVars(config, ctx);
    expect(env['表格_投放人数']).toBeDefined();
    expect(env['表格2_投放人数']).toBeDefined();
    expect(env['分行_累计绑卡']).toBe(391);
  });

  it('绑定失联 → 不注入、不报错', () => {
    const config = {
      blocks: [tableBlock('b1', '表格', 'missing', cols)],
      dataSources: [],
      pipeline: { nodes: [] },
    } as unknown as CanvasConfig;
    const { env, vars } = collectBlockTotalVars(config, ctx);
    expect(env).toEqual({});
    expect(vars).toEqual([]);
  });
});
