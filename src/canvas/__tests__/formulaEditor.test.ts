import { describe, expect, it } from 'vitest';
import { FUNCTIONS } from '../pipeline/formula/parser';
import { evaluateFormula } from '../pipeline/formula/eval';
import { FUNC_DOCS, FUNC_NAMES, levenshtein, suggestFunction } from '../formula/funcDocs';
import { initialsOf, matchQuery } from '../formula/pinyin';
import { collectVariables, displayVarValue, groupVariables } from '../formula/variableEnv';
import type { CanvasConfig, NodeOutput } from '../types';

/** 函数字典与 parser 白名单必须一一对应（防漂移铁律） */
describe('funcDocs 与函数白名单一致', () => {
  it('白名单内每个函数都有文档，文档里没有白名单外的函数', () => {
    for (const fn of FUNCTIONS) {
      expect(FUNC_DOCS[fn], `缺少 ${fn} 的文档`).toBeDefined();
    }
    const whitelist = new Set(FUNCTIONS.map((f) => f.toUpperCase()));
    for (const name of FUNC_NAMES) {
      expect(whitelist.has(name), `${name} 不在 parser 白名单内`).toBe(true);
    }
  });

  it('编辑距离与函数纠错', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(suggestFunction('ROUD')).toBe('ROUND');
    expect(suggestFunction('SU')).toBe('SUM');
    expect(suggestFunction('IF')).toBe('IF'); // 本身就是函数
    expect(suggestFunction('完全不无关')).toBeNull();
  });
});

describe('拼音首字母检索', () => {
  it('常用字取首字母', () => {
    expect(initialsOf('完成率')).toBe('wcl');
    expect(initialsOf('当日新增绑卡')).toBe('drxzbk');
    expect(initialsOf('目标')).toBe('mb');
  });
  it('未收录字符优雅降级为 ?', () => {
    expect(initialsOf('氪金')).toBe('?j');
  });
  it('matchQuery：子串与拼音前缀都能命中', () => {
    expect(matchQuery('完成', '完成率')).toBe(true);
    expect(matchQuery('wcl', '完成率')).toBe(true);
    expect(matchQuery('m', '全年目标')).toBe(true); // 前缀字母 qnmb
    expect(matchQuery('w', '全年目标')).toBe(false);
    expect(matchQuery('MB', '全年目标')).toBe(true); // 大小写不敏感
    expect(matchQuery('x', '完成率')).toBe(false);
    expect(matchQuery('', '任意')).toBe(true);
  });
});

describe('变量收集与分组', () => {
  const config = {
    dataSources: [
      { id: 's1', name: '口径参数', kind: 'form', entries: [{ key: '全年目标', value: '420000' }, { key: '', value: '忽略空名' }] },
      { id: 's2', name: '目标值', kind: 'constant', value: '100' },
    ],
    pipeline: {
      nodes: [
        { id: 'n1', type: 'scalarOut', name: '当日新增绑卡', inputs: [], params: {}, enabled: true },
        { id: 'n2', type: 'formula', name: '完成率', inputs: [], params: {}, enabled: true },
        { id: 'n3', type: 'formula', name: '已停用', inputs: [], params: {}, enabled: false },
      ],
    },
  } as never as CanvasConfig;
  const outputs: Record<string, NodeOutput> = {
    n1: { kind: 'scalar', value: 1204 },
    n2: { kind: 'scalar', value: 0.756 },
  };

  it('四类来源进池：表单条目/常量/取数/计算字段，空名与停用节点不进', () => {
    const vars = collectVariables(config, outputs);
    const userVars = vars.filter((v) => v.group !== '系统');
    expect(userVars.map((v) => v.name)).toEqual(['全年目标', '目标值', '当日新增绑卡', '完成率']);
    expect(userVars.map((v) => v.group)).toEqual(['参数', '常量', '取数', '计算字段']);
    expect(userVars[2].value).toBe(1204);
  });

  it('行内列进「列」组且同名先到先得', () => {
    const vars = collectVariables(config, outputs, [{ key: '全年目标', label: '全年目标' }, { key: 'col1', label: '列一' }]);
    expect(vars.filter((v) => v.group === '列').map((v) => v.name)).toEqual(['列一']);
  });

  it('分组展示按固定顺序且跳过空组（系统固定变量恒在末尾）', () => {
    const groups = groupVariables(collectVariables(config, outputs));
    expect(groups.map((g) => g.group)).toEqual(['参数', '常量', '取数', '计算字段', '系统']);
  });

  it('变量值展示', () => {
    const vars = collectVariables(config, outputs).filter((v) => v.group !== '系统');
    expect(displayVarValue(vars[2])).toBe('1204');
    expect(displayVarValue(vars[3])).toBe('0.756');
    expect(displayVarValue(vars[0])).toBe('');
  });
});

describe('求值错误定位（编辑器实时校验依赖）', () => {
  it('语法错误返回 pos', () => {
    const r = evaluateFormula('1+', { vars: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.pos).toBe(2);
  });
  it('未知函数返回 pos=0', () => {
    const r = evaluateFormula('ROUD(1.5)', { vars: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.pos).toBe(0);
  });
  it('成功结果不带 pos', () => {
    const r = evaluateFormula('1+1', { vars: {} });
    expect(r).toEqual({ ok: true, value: 2 });
  });
});
