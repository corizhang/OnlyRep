/**
 * 变量插入工具（PRD R4-07 增补）：
 * 统一「变量 → 输入框」的落点语义，参考 n8n 的上下文感知插入：
 * - 模板类输入（支持 {{表达式}} 文案）：落在 {{ }} 外 → 插入完整 {{变量}}；
 *   光标已在未闭合的 {{ 内 → 只插入裸变量名，保证多变量运算 {{ 变量1 / 变量2 }} 结构正确
 * - 表达式类输入（data-var-scope="expr"，如公式编辑器）：恒插裸变量名
 */

/** 裸变量名：含特殊字符时用方括号（与公式 lexer 的 bracket 语法一致） */
export function varBareToken(name: string): string {
  return /^[\u4e00-\u9fa5A-Za-z0-9_]+$/.test(name) ? name : `[${name}]`;
}

/** 完整模板 token */
export function varFullToken(name: string): string {
  return `{{${varBareToken(name)}}}`;
}

/** 光标是否处于未闭合的 {{ 内（模板语义输入用） */
export function isInsideOpenTemplate(text: string, caret: number): boolean {
  const before = text.slice(0, caret);
  const open = before.lastIndexOf('{{');
  if (open < 0) return false;
  return before.indexOf('}}', open) < 0;
}

/** 纯函数：在文本指定区间插入变量 token，返回新值与新光标 */
export function insertVarIntoText(
  value: string,
  start: number,
  end: number,
  name: string,
  semantics: 'template' | 'expr',
): { value: string; caret: number } {
  const token = semantics === 'expr' || isInsideOpenTemplate(value, start) ? varBareToken(name) : varFullToken(name);
  return { value: value.slice(0, start) + token + value.slice(end), caret: start + token.length };
}

/** React 兼容写入：绕过值追踪器后派发 input 事件，受控组件 onChange 正常触发 */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** 在真实输入框/文本域光标处插入变量（拖拽落点用），自动感知上下文 */
export function insertVariableIntoElement(el: HTMLInputElement | HTMLTextAreaElement, name: string): void {
  if (el.readOnly || el.disabled) return;
  const exprScope = el.dataset.varScope === 'expr' || el.closest('[data-var-scope="expr"]') !== null;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  const { value, caret } = insertVarIntoText(el.value, start, end, name, exprScope ? 'expr' : 'template');
  el.focus();
  setNativeValue(el, value);
  requestAnimationFrame(() => {
    try {
      el.setSelectionRange(caret, caret);
    } catch {
      /* 忽略：个别 input 类型不支持 selection */
    }
  });
}
