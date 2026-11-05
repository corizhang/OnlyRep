import { describe, expect, it } from 'vitest';
import { evaluateFormula, renderTemplate } from '../pipeline/formula/eval';

const vars = { 全年目标: 420000, 已完成: 317343, 剩余天数: 63, 名称: '盛京银行' };

describe('公式求值器', () => {
  it('四则运算与优先级', () => {
    const r = evaluateFormula('1+2*3-(4-2)/2', { vars });
    expect(r).toEqual({ ok: true, value: 6 });
  });

  it('中文变量名与百分比', () => {
    const r = evaluateFormula('已完成/全年目标*100', { vars });
    expect(r.ok).toBe(true);
    if (r.ok) expect(Number(r.value)).toBeCloseTo(75.558, 2);
  });

  it('除法为零返回错误而不是抛异常', () => {
    const r = evaluateFormula('1/0', { vars });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('除数');
  });

  it('引用不存在给出明确错误', () => {
    const r = evaluateFormula('全年目标-不存在', { vars });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('不存在');
  });

  it('IF / AND / OR / 比较', () => {
    expect(evaluateFormula("IF(已完成>300000,'达标','未达标')", { vars })).toEqual({ ok: true, value: '达标' });
    expect(evaluateFormula('AND(1>0,2>1)', { vars })).toEqual({ ok: true, value: true });
    expect(evaluateFormula('OR(1>2,2>1)', { vars })).toEqual({ ok: true, value: true });
  });

  it('ROUND / CEILING / ABS', () => {
    expect(evaluateFormula('ROUND(75.5582,1)', { vars })).toEqual({ ok: true, value: 75.6 });
    expect(evaluateFormula('CEILING((420000-317343)/63)', { vars })).toEqual({ ok: true, value: 1630 });
    expect(evaluateFormula('ABS(0-3)', { vars })).toEqual({ ok: true, value: 3 });
  });

  it('DAYS 支持多种日期写法（结束-开始，Excel 语义）', () => {
    const r = evaluateFormula("DAYS('2026-12-31','2026-10-29')", { vars });
    expect(r).toEqual({ ok: true, value: 63 });
    // 反向为负：DAYS(过去, 未来) < 0
    const r2 = evaluateFormula("DAYS('2026-10-29','2026-12-31')", { vars });
    expect(r2).toEqual({ ok: true, value: -63 });
  });

  it('方括号列名可含连字符', () => {
    const r = evaluateFormula('[扫码-绑卡人数]/扫码人数', {
      vars: {},
      row: { '扫码-绑卡人数': 3, 扫码人数: 20 },
    });
    expect(r).toEqual({ ok: true, value: 0.15 });
  });

  it('函数白名单之外一律拒绝', () => {
    const r = evaluateFormula('EVIL(1)', { vars });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('不支持函数');
  });

  it('禁止 eval：代码片段不可执行', () => {
    const r = evaluateFormula('1;alert(1)', { vars });
    expect(r.ok).toBe(false);
  });

  it('文案模板替换与格式修饰符', () => {
    const out = renderTemplate('已完成 {{已完成|num}} 户，完成率 {{ROUND(已完成/全年目标*100,1)}}%', { vars });
    expect(out.text).toBe('已完成 317,343 户，完成率 75.6%');
    expect(out.errors).toHaveLength(0);
  });

  it('模板里引用报错降级为占位符', () => {
    const out = renderTemplate('值：{{不存在}}', { vars });
    expect(out.text).toBe('值：—');
    expect(out.errors.length).toBe(1);
  });

  it('格式后缀：pct 可指定小数位（比率 → 百分数）', () => {
    const v = { vars: { 达标: 391, 投放: 35517 } };
    expect(renderTemplate('{{达标/投放|pct}}', v).text).toBe('1.1%');
    expect(renderTemplate('{{达标/投放|pct(0)}}', v).text).toBe('1%');
    expect(renderTemplate('{{达标/投放|pct(2)}}', v).text).toBe('1.10%');
    expect(renderTemplate('{{达标/投放|pct(4)}}', v).text).toBe('1.1009%');
  });

  it('格式后缀：num 可指定小数位（固定位数 + 千分位）', () => {
    const v = { vars: { 金额: 1234.5678 } };
    expect(renderTemplate('{{金额|num}}', v).text).toBe('1,234.57');
    expect(renderTemplate('{{金额|num(0)}}', v).text).toBe('1,235');
    expect(renderTemplate('{{金额|num(1)}}', v).text).toBe('1,234.6');
    expect(renderTemplate('{{金额|num(3)}}', v).text).toBe('1,234.568');
  });

  it('格式后缀：text 原样输出、非数字容错', () => {
    const v = { vars: { 名称: '企微', 文本数: '1,200' } };
    expect(renderTemplate('{{名称|text}}', v).text).toBe('企微');
    expect(renderTemplate('{{名称|num(2)}}', v).text).toBe('企微');
    expect(renderTemplate('{{文本数|num(0)}}', v).text).toBe('1,200');
    expect(renderTemplate('{{文本数|pct(1)}}', v).text).toBe('120000.0%');
  });

  it('格式后缀不误伤 || 运算与普通竖线文本', () => {
    const v = { vars: { a: 1, b: 0 } };
    // 内部表达式含 || 逻辑或，末尾无修饰符
    expect(renderTemplate('{{a>0 || b>0}}', v).text).toBe('TRUE');
    // 文案里的竖线不是修饰符
    expect(renderTemplate('A | B', v).text).toBe('A | B');
  });
});
