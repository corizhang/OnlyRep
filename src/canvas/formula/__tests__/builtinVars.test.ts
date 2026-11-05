import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUILTIN_VAR_DEFS, builtinVarOf, builtinVars, withBuiltinVars } from '../builtinVars';
import { evaluateFormula, renderTemplate } from '../../pipeline/formula/eval';
import { collectVariables, groupVariables } from '../variableEnv';
import type { CanvasConfig, NodeOutput } from '../../types';

/** 固定时间：2026-11-04（周三）15:16 */
function freeze(): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 4, 15, 16, 32));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('系统固定变量取值', () => {
  it('today / yesterday / tomorrow 按本地日期滚动', () => {
    freeze();
    const v = builtinVars();
    expect(v.today).toBe('2026-11-04');
    expect(v.yesterday).toBe('2026-11-03');
    expect(v.tomorrow).toBe('2026-11-05');
  });

  it('now / time / weekday / 年月日口径', () => {
    freeze();
    const v = builtinVars();
    expect(v.now).toBe('2026-11-04 15:16');
    expect(v.time).toBe('15:16');
    expect(v.weekday).toBe('周三');
    expect(v.year).toBe(2026);
    expect(v.month).toBe(11);
    expect(v.day).toBe(4);
  });

  it('月初/月末/季度处理大小月与闰年', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2028, 1, 10, 9, 0, 0)); // 2028-02-10，闰年
    const v = builtinVars();
    expect(v.monthStart).toBe('2028-02-01');
    expect(v.monthEnd).toBe('2028-02-29');
    expect(v.quarter).toBe('Q1');
  });

  it('跨天后重新取值（分钟级缓存不粘连旧日期）', () => {
    freeze();
    expect(builtinVars().today).toBe('2026-11-04');
    vi.setSystemTime(new Date(2026, 10, 5, 0, 1, 0));
    expect(builtinVars().today).toBe('2026-11-05');
    expect(builtinVars().yesterday).toBe('2026-11-04');
  });

  it('名称大小写不敏感，未知名返回 undefined', () => {
    freeze();
    expect(builtinVarOf('TODAY')).toBe('2026-11-04');
    expect(builtinVarOf('Now')).toBe('2026-11-04 15:16');
    expect(builtinVarOf('今天')).toBeUndefined();
  });

  it('用户变量覆盖同名内置变量', () => {
    freeze();
    const merged = withBuiltinVars({ today: '口径日' });
    expect(merged.today).toBe('口径日');
    expect(merged.yesterday).toBe('2026-11-03');
  });

  it('变量名不与函数名混淆：TODAY 是函数，today 是变量', () => {
    freeze();
    expect(evaluateFormula('today', { vars: {} })).toEqual({ ok: true, value: '2026-11-04' });
    expect(evaluateFormula('TODAY()', { vars: {} })).toEqual({ ok: true, value: '2026-11-04' });
  });
});

describe('求值层兜底与模板渲染', () => {
  it('公式可直接引用内置变量并参与运算', () => {
    freeze();
    expect(evaluateFormula('year - 2025', { vars: {} })).toEqual({ ok: true, value: 1 });
    // 内置日期是合法日期文本，可喂给 DAYS
    const r = evaluateFormula("DAYS('2026-12-31', today)", { vars: {} });
    expect(r).toEqual({ ok: true, value: 57 });
  });

  it('env 中的同名变量优先于内置变量', () => {
    freeze();
    const r = evaluateFormula('today', { vars: { today: '2020-01-01' } });
    expect(r).toEqual({ ok: true, value: '2020-01-01' });
  });

  it('模板里直接写 {{today}} / {{now}}', () => {
    freeze();
    const out = renderTemplate('{{yesterday}} 日报 · {{weekday}} {{time}}', { vars: {} });
    expect(out.text).toBe('2026-11-03 日报 · 周三 15:16');
    expect(out.errors).toEqual([]);
  });

  it('格式化后缀对日期文本无副作用', () => {
    freeze();
    expect(renderTemplate('{{today|text}}', { vars: {} }).text).toBe('2026-11-04');
    expect(renderTemplate('{{year|num(0)}}', { vars: {} }).text).toBe('2,026');
  });
});

describe('变量面板的「系统」分组', () => {
  const config = { dataSources: [], pipeline: { nodes: [] } } as never as CanvasConfig;
  const outputs: Record<string, NodeOutput> = {};

  it('内置变量全部入池，且排在用户变量之后', () => {
    freeze();
    const vars = collectVariables(config, outputs);
    expect(vars.map((v) => v.name)).toEqual(BUILTIN_VAR_DEFS.map((d) => d.name));
    expect(vars.every((v) => v.group === '系统')).toBe(true);
    expect(vars.find((v) => v.name === 'today')?.value).toBe('2026-11-04');
    expect(vars.find((v) => v.name === 'today')?.hint).toContain('YYYY-MM-DD');
  });

  it('用户已有同名变量时不重复出现（用户优先）', () => {
    freeze();
    const cfg = {
      dataSources: [{ id: 's1', name: '参数', kind: 'form', entries: [{ key: 'today', value: '自定义' }] }],
      pipeline: { nodes: [] },
    } as never as CanvasConfig;
    const vars = collectVariables(cfg, outputs);
    expect(vars.filter((v) => v.name === 'today')).toHaveLength(1);
    expect(vars.find((v) => v.name === 'today')?.group).toBe('参数');
  });

  it('分组顺序：系统固定排在最后', () => {
    freeze();
    const groups = groupVariables(collectVariables(config, outputs));
    expect(groups.map((g) => g.group)).toEqual(['系统']);
  });
});
