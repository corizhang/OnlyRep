import { describe, expect, it } from 'vitest';
import { runGraph } from '../pipeline/engine';
import { collectVariables } from '../formula/variableEnv';
import type { DataSource, PipelineNode } from '../types';

/**
 * 变量名冲突诊断（用户案例：表单「累计完成绑卡人数」改值不生效）：
 * 当表单条目与取数/计算字段节点同名时，env 是「后者覆盖前者」——
 * 表单改值被同名节点覆盖，此前该冲突警告没有返回给 UI，用户无从排查。
 */

const mkForm = (v: string): DataSource => ({
  id: 'ds2',
  name: '基础数据',
  kind: 'form',
  entries: [
    { key: '年绑卡指标', value: '420000' },
    { key: '累计完成绑卡人数', value: v },
  ],
});

const nodes = (): PipelineNode[] => [
  { id: 'n_ds2', type: 'source', name: '基础数据', inputs: [], params: { sourceId: 'ds2' }, enabled: true },
  // 同名计算字段（如历史遗留的公式节点）——覆盖表单条目
  { id: 'n_f', type: 'formula', name: '累计完成绑卡人数', inputs: [], params: { expr: '324212' }, enabled: true },
];

describe('变量名冲突：表单条目被同名节点覆盖', () => {
  it('env 取覆盖后的值，且 runGraph 返回冲突警告', () => {
    const r = runGraph({ nodes: nodes() }, { sourceDefs: [mkForm('325612')], sources: {} });
    // 表单节点（深度0）先执行写入 325612，同名计算字段（324212）随后覆盖 → env 停留在旧值，改表单不生效
    expect(r.env['累计完成绑卡人数']).toBe(324212);
    expect(r.warnings.some((w) => w.includes('变量名「累计完成绑卡人数」重复'))).toBe(true);
  });

  it('collectVariables 在先出现的变量上标注同名冲突', () => {
    const config = { dataSources: [mkForm('325612')], pipeline: { nodes: nodes() } } as never;
    const vars = collectVariables(config, {});
    const v = vars.find((x) => x.name === '累计完成绑卡人数');
    expect(v?.hint).toContain('同名冲突');
  });

  it('表单条目改值本身即时生效（无同名冲突时）', () => {
    const nodesClean = (): PipelineNode[] => [
      { id: 'n_ds2', type: 'source', name: '基础数据', inputs: [], params: { sourceId: 'ds2' }, enabled: true },
    ];
    const cache = new Map();
    const r1 = runGraph({ nodes: nodesClean() }, { sourceDefs: [mkForm('324212')], sources: {}, cache });
    const r2 = runGraph({ nodes: nodesClean() }, { sourceDefs: [mkForm('325612')], sources: {}, cache });
    expect(r1.env['累计完成绑卡人数']).toBe(324212);
    expect(r2.env['累计完成绑卡人数']).toBe(325612);
    expect(r2.warnings).toHaveLength(0);
  });
});
