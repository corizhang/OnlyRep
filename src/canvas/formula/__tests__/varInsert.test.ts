import { describe, expect, it } from 'vitest';
import { varBareToken, varFullToken, isInsideOpenTemplate, insertVarIntoText } from '../varInsert';

describe('varInsert 变量插入（上下文感知）', () => {
  it('裸 token：常规名原样、特殊字符加方括号', () => {
    expect(varBareToken('完成率')).toBe('完成率');
    expect(varBareToken('企微特递（5元）_绑卡')).toBe('[企微特递（5元）_绑卡]');
    expect(varFullToken('完成率')).toBe('{{完成率}}');
  });

  it('isInsideOpenTemplate：未闭合 {{ 内为 true', () => {
    expect(isInsideOpenTemplate('合计 {{', 5)).toBe(true);
    expect(isInsideOpenTemplate('合计 {{投放}} 人', 9)).toBe(false);
    expect(isInsideOpenTemplate('{{a}} / {{', 10)).toBe(true); // 只看最后一个 {{
    expect(isInsideOpenTemplate('普通文本', 4)).toBe(false);
  });

  it('模板语义：{{ 外插完整 token，{{ 内插裸名', () => {
    // 光标在 {{ 之后 → 裸名
    expect(insertVarIntoText('共 {{', 4, 4, 'A', 'template')).toEqual({ value: '共 {{A', caret: 5 });
    // 光标在普通文本 → 完整 token
    expect(insertVarIntoText('共 ', 2, 2, 'A', 'template')).toEqual({ value: '共 {{A}}', caret: 7 });
    // 选中替换
    expect(insertVarIntoText('旧值', 0, 2, 'A', 'template')).toEqual({ value: '{{A}}', caret: 5 });
  });

  it('表达式语义：恒插裸名（公式编辑器拖入场景）', () => {
    expect(insertVarIntoText('', 0, 0, '投放人数', 'expr')).toEqual({ value: '投放人数', caret: 4 });
    expect(insertVarIntoText('A/', 2, 2, 'B', 'expr')).toEqual({ value: 'A/B', caret: 3 });
  });

  it('多变量运算场景：依次插入得到正确结构', () => {
    // 各自独立的插值：两个完整 token 并列
    let r = insertVarIntoText('成功率 ', 4, 4, '累计绑卡', 'template');
    expect(r.value).toBe('成功率 {{累计绑卡}}');
    r = insertVarIntoText(r.value + ' / ', r.value.length + 3, r.value.length + 3, '投放人数', 'template');
    expect(r.value).toBe('成功率 {{累计绑卡}} / {{投放人数}}');
    // 用户手写 {{ 后依次拖入两个变量：都在未闭合 {{ 内 → 裸名，运算结构正确
    let s = insertVarIntoText('{{', 2, 2, 'a', 'template').value;
    expect(s).toBe('{{a');
    const withSlash = s + '/';
    s = insertVarIntoText(withSlash, withSlash.length, withSlash.length, 'b', 'template').value;
    expect(s).toBe('{{a/b');
  });
});
