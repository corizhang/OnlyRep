import type { NamedScalars, ScalarValue } from '../../types';
import { parseFormula, type Ast } from './parser';
import { FormulaError } from './lexer';
import { daysBetween, parseDateValue, todayUtc } from '../dates';
import { builtinVarOf } from '../../formula/builtinVars';

/**
 * 公式求值（ARCH §5.2 第三段）。
 * 错误不抛到渲染层：统一包装为 { ok:false, error } 由调用方做占位/角标（PRD E2/E3）。
 */

export interface EvalContext {
  /** 全局标量环境 */
  vars: NamedScalars;
  /** 行上下文（派生列公式用）；提供时禁止聚合函数 */
  row?: Record<string, ScalarValue>;
  /** 当前行号（错误提示用） */
  rowIndex?: number;
}

export type EvalResult =
  | { ok: true; value: number | string | boolean | null }
  | { ok: false; error: string; /** 错误位置（相对去首尾空白后的表达式），编辑器实时校验用 */ pos?: number };

type Val = number | string | boolean | null;

/** 求值：解析 + 计算，异常一律转为错误结果 */
export function evaluateFormula(expr: string, ctx: EvalContext): EvalResult {
  try {
    const ast = parseFormula(expr);
    return { ok: true, value: evalAst(ast, ctx) };
  } catch (err) {
    if (err instanceof FormulaError) {
      return { ok: false, error: err.message, pos: err.pos >= 0 ? err.pos : undefined };
    }
    return { ok: false, error: err instanceof Error ? err.message : '公式计算失败' };
  }
}

/** 计算已解析的 AST（供批量场景复用解析结果） */
export function evalAst(ast: Ast, ctx: EvalContext): Val {
  switch (ast.t) {
    case 'num':
      return ast.v;
    case 'str':
      return ast.v;
    case 'bool':
      return ast.v;
    case 'id':
      return resolveIdent(ast.name, ctx);
    case 'un': {
      if (ast.op === 'NOT') return !truthy(evalAst(ast.a, ctx));
      const v = toNum(evalAst(ast.a, ctx), '一元运算');
      return ast.op === '-' ? -v : v;
    }
    case 'bin':
      return evalBinary(ast.op, ast.a, ast.b, ctx);
    case 'call':
      return evalCall(ast.name, ast.args, ctx);
    default:
      throw new FormulaError('不支持的语法节点');
  }
}

function resolveIdent(name: string, ctx: EvalContext): Val {
  if (ctx.row && Object.prototype.hasOwnProperty.call(ctx.row, name)) {
    return ctx.row[name] ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(ctx.vars, name)) {
    return ctx.vars[name] ?? null;
  }
  // 空格容错：「 全年目标 」→ 全年目标
  const trimmed = name.trim();
  if (trimmed !== name && Object.prototype.hasOwnProperty.call(ctx.vars, trimmed)) {
    return ctx.vars[trimmed] ?? null;
  }
  // 系统固定变量兜底（today / now / yesterday …）：实时取值，用户同名变量已在上方优先命中
  const builtin = builtinVarOf(trimmed);
  if (builtin !== undefined) return builtin;
  throw new FormulaError(`引用「${name}」不存在`);
}

function evalBinary(op: string, aAst: Ast, bAst: Ast, ctx: EvalContext): Val {
  // 逻辑运算短路
  if (op === '&&' || op === 'AND') {
    return truthy(evalAst(aAst, ctx)) && truthy(evalAst(bAst, ctx));
  }
  if (op === '||' || op === 'OR') {
    return truthy(evalAst(aAst, ctx)) || truthy(evalAst(bAst, ctx));
  }

  const a = evalAst(aAst, ctx);
  const b = evalAst(bAst, ctx);

  if (op === '+' && (typeof a === 'string' || typeof b === 'string')) {
    return `${str(a)}${str(b)}`;
  }

  switch (op) {
    case '==':
    case '=':
      return looseEqual(a, b);
    case '!=':
    case '<>':
      return !looseEqual(a, b);
    case '>':
    case '>=':
    case '<':
    case '<=':
      return compare(op, a, b);
    case '+':
      return toNum(a, '+') + toNum(b, '+');
    case '-':
      return toNum(a, '-') - toNum(b, '-');
    case '*':
      return toNum(a, '*') * toNum(b, '*');
    case '/': {
      const den = toNum(b, '/');
      if (den === 0) throw new FormulaError('除数为 0');
      return toNum(a, '/') / den;
    }
    case '%': {
      const den = toNum(b, '%');
      if (den === 0) throw new FormulaError('除数为 0');
      return toNum(a, '%') % den;
    }
    default:
      throw new FormulaError(`不支持的运算符「${op}」`);
  }
}

function evalCall(name: string, argAsts: Ast[], ctx: EvalContext): Val {
  const args = () => argAsts.map((a) => evalAst(a, ctx));
  const need = (n: number, optional = 0) => {
    if (argAsts.length < n || argAsts.length > n + optional) {
      throw new FormulaError(`函数 ${name} 参数个数不正确`);
    }
  };

  switch (name) {
    case 'IF': {
      need(2, 1);
      const list = args();
      if (truthy(list[0])) return list[1];
      return list.length > 2 ? list[2] : null;
    }
    case 'AND': {
      const list = args();
      if (list.length === 0) throw new FormulaError('AND 至少需要 1 个参数');
      return list.every(truthy);
    }
    case 'OR': {
      const list = args();
      if (list.length === 0) throw new FormulaError('OR 至少需要 1 个参数');
      return list.some(truthy);
    }
    case 'NOT': {
      need(1);
      return !truthy(args()[0]);
    }
    case 'ROUND': {
      need(1, 1);
      const list = args();
      const v = toNum(list[0], 'ROUND');
      const n = list.length > 1 ? Math.trunc(toNum(list[1], 'ROUND')) : 0;
      const f = Math.pow(10, n);
      return Math.round(v * f) / f;
    }
    case 'CEILING':
    case 'CEIL': {
      need(1);
      return Math.ceil(toNum(args()[0], name));
    }
    case 'FLOOR': {
      need(1);
      return Math.floor(toNum(args()[0], name));
    }
    case 'ABS': {
      need(1);
      return Math.abs(toNum(args()[0], 'ABS'));
    }
    case 'MIN':
    case 'MAX': {
      const list = args().map((v) => toNum(v, name));
      if (list.length === 0) throw new FormulaError(`${name} 至少需要 1 个参数`);
      return name === 'MIN' ? Math.min(...list) : Math.max(...list);
    }
    case 'SUM':
    case 'AVG': {
      const list = args().map((v) => toNum(v, name));
      if (list.length === 0) throw new FormulaError(`${name} 至少需要 1 个参数`);
      const total = list.reduce((s, v) => s + v, 0);
      return name === 'SUM' ? total : total / list.length;
    }
    case 'COUNT': {
      const list = args();
      return list.filter((v) => v !== null && v !== '').length;
    }
    case 'DAYS': {
      need(2);
      const list = args();
      // Excel 语义：DAYS(结束日期, 开始日期) = 结束 - 开始
      const end = parseDateValue(list[0] as ScalarValue);
      const start = parseDateValue(list[1] as ScalarValue);
      if (!end || !start) throw new FormulaError('DAYS 的日期参数无法解析');
      return daysBetween(start, end);
    }
    case 'TODAY': {
      need(0);
      return todayUtc().toISOString().slice(0, 10);
    }
    case 'NUM': {
      need(1);
      const v = args()[0];
      if (typeof v === 'number') return v;
      const n = Number(String(v ?? '').replace(/[,\s%]/g, ''));
      return Number.isFinite(n) ? n : 0;
    }
    case 'TEXT': {
      need(1);
      return str(args()[0]);
    }
    case 'LEN': {
      need(1);
      return str(args()[0]).length;
    }
    default:
      throw new FormulaError(`不支持函数「${name}」`);
  }
}

function truthy(v: Val): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (v === null) return false;
  const s = v.trim().toLowerCase();
  return s !== '' && s !== '0' && s !== 'false';
}

function toNum(v: Val, where: string): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === null) return 0;
  const s = String(v).replace(/,/g, '').trim();
  if (s === '') return 0;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new FormulaError(`「${v}」不是数值（${where}）`);
  return n;
}

function str(v: Val): string {
  if (v === null) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v);
}

function looseEqual(a: Val, b: Val): boolean {
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  if (a === null || b === null) return a === b;
  if (typeof a === 'number' || typeof b === 'number') {
    const na = a === null ? NaN : Number(String(a).replace(/,/g, ''));
    const nb = b === null ? NaN : Number(String(b).replace(/,/g, ''));
    if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  }
  return str(a) === str(b);
}

function compare(op: string, a: Val, b: Val): boolean {
  let cmp: number;
  const na = typeof a === 'number' ? a : Number(String(a ?? '').replace(/,/g, ''));
  const nb = typeof b === 'number' ? b : Number(String(b ?? '').replace(/,/g, ''));
  if (Number.isFinite(na) && Number.isFinite(nb)) {
    cmp = na - nb;
  } else {
    cmp = str(a).localeCompare(str(b), 'zh-Hans-CN');
  }
  switch (op) {
    case '>':
      return cmp > 0;
    case '>=':
      return cmp >= 0;
    case '<':
      return cmp < 0;
    case '<=':
      return cmp <= 0;
    default:
      return false;
  }
}

/**
 * 文案模板渲染：「累计投放 {{SUM(总人数)}} 人，成功率 {{ROUND(达标/投放*100,1)}}%」
 * - {{ }} 内按完整公式求值，支持格式后缀：
 *   `|num`（千分位，最多 2 位）/ `|num(0..4)`（固定小数位）
 *   `|pct`（×100 加 %，默认 1 位）/ `|pct(0..4)`（固定小数位）
 *   `|text`（原样输出）
 * - 求值失败替换为「—」并在 errors 中返回，不中断渲染
 */
export interface TemplateResult {
  text: string;
  errors: string[];
}

interface FormatMod {
  kind: 'num' | 'pct' | 'text';
  /** 小数位；null = 用默认口径 */
  digits: number | null;
}

export function renderTemplate(
  template: string,
  ctx: EvalContext,
  fmt?: { num: (v: number) => string; pct: (v: number) => string },
): TemplateResult {
  const errors: string[] = [];
  const text = String(template ?? '').replace(/\{\{([\s\S]*?)\}\}/g, (_m, raw: string) => {
    const body = raw.trim();
    if (body === '') return '';
    const [exprPart, mod] = splitModifier(body);
    const res = evaluateFormula(exprPart, ctx);
    if (!res.ok) {
      errors.push(res.error);
      return '—';
    }
    const v = res.value;

    if (mod?.kind === 'text') return v === null ? '' : str(v);

    if (mod?.kind === 'pct') {
      const n = toNumberLoose(v);
      if (n === null) return '—';
      if (fmt && mod.digits === null) return fmt.pct(n);
      return `${(n * 100).toFixed(mod.digits ?? 1)}%`;
    }

    if (mod?.kind === 'num') {
      const n = toNumberLoose(v);
      if (n === null) return str(v);
      if (fmt && mod.digits === null) return fmt.num(n);
      const opt =
        mod.digits === null
          ? { maximumFractionDigits: 2 }
          : { minimumFractionDigits: mod.digits, maximumFractionDigits: mod.digits };
      return n.toLocaleString('zh-CN', opt);
    }

    if (typeof v === 'number') return fmt ? fmt.num(v) : String(v);
    return v === null ? '' : str(v);
  });
  return { text, errors };
}

/** 宽松数字解析（兼容 '1,234' / '12.3%' 这类文本值） */
function toNumberLoose(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v ?? '').replace(/[,\s%]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * 拆分 `表达式|修饰符`：只认末尾 `|num` / `|pct` / `|text`，可带 `(0..4)` 小数位，
 * 避免误伤表达式内部的 `||` 运算。
 */
function splitModifier(body: string): [string, FormatMod | null] {
  const m = body.match(/^(.*)\|\s*(num|pct|text)\s*(?:\(\s*(\d)\s*\))?\s*$/i);
  if (!m) return [body, null];
  const digits = m[3] === undefined ? null : Math.max(0, Math.min(4, Number(m[3])));
  return [m[1].trim(), { kind: m[2].toLowerCase() as FormatMod['kind'], digits }];
}
