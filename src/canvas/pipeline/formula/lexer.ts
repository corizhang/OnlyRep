/**
 * 公式词法分析（ARCH §5.2 第一段）。
 * 词法白名单：数字 / 字符串 / 标识符 / 运算符 / 括号 / 逗号。
 * 标识符支持中文与方括号写法（列名含 `-`、空格时必须用 [列名]）。
 */

export type TokenType = 'number' | 'string' | 'ident' | 'op' | 'lparen' | 'rparen' | 'comma' | 'eof';

export interface Token {
  type: TokenType;
  value: string;
  /** 原始字符偏移，用于错误定位 */
  pos: number;
}

export class FormulaError extends Error {
  constructor(
    message: string,
    public readonly pos = -1,
  ) {
    super(message);
    this.name = 'FormulaError';
  }
}

const OPS = ['>=', '<=', '==', '!=', '<>', '&&', '||', '+', '-', '*', '/', '>', '<', '=', '!', '%'];

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

/** 标识符首字符：字母（含中文/下划线），排除数字与运算符 */
function isIdentStart(ch: string): boolean {
  return /[A-Za-z_\u4e00-\u9fa5]/.test(ch);
}

function isIdentPart(ch: string): boolean {
  return /[A-Za-z0-9_\u4e00-\u9fa5]/.test(ch);
}

export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\u3000') {
      i += 1;
      continue;
    }

    // 数字：123 / 123.45 / .5
    if (isDigit(ch) || (ch === '.' && isDigit(src[i + 1] ?? ''))) {
      const start = i;
      let seenDot = false;
      while (i < src.length && (isDigit(src[i]) || (src[i] === '.' && !seenDot))) {
        if (src[i] === '.') seenDot = true;
        i += 1;
      }
      tokens.push({ type: 'number', value: src.slice(start, i), pos: start });
      continue;
    }

    // 字符串：'...' 或 "..."
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const start = i;
      i += 1;
      let out = '';
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\' && i + 1 < src.length) {
          out += src[i + 1];
          i += 2;
          continue;
        }
        out += src[i];
        i += 1;
      }
      if (i >= src.length) throw new FormulaError('字符串缺少结束引号', start);
      i += 1; // 跳过结束引号
      tokens.push({ type: 'string', value: out, pos: start });
      continue;
    }

    // 方括号标识符：[扫码-绑卡人数]
    if (ch === '[') {
      const start = i;
      const end = src.indexOf(']', i + 1);
      if (end < 0) throw new FormulaError('方括号缺少 ]', start);
      const name = src.slice(i + 1, end).trim();
      if (name === '') throw new FormulaError('方括号内列名不能为空', start);
      tokens.push({ type: 'ident', value: name, pos: start });
      i = end + 1;
      continue;
    }

    if (isIdentStart(ch)) {
      const start = i;
      while (i < src.length && isIdentPart(src[i])) i += 1;
      tokens.push({ type: 'ident', value: src.slice(start, i), pos: start });
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'lparen', value: '(', pos: i });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ')', pos: i });
      i += 1;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'comma', value: ',', pos: i });
      i += 1;
      continue;
    }

    const op = OPS.find((o) => src.startsWith(o, i));
    if (op) {
      tokens.push({ type: 'op', value: op, pos: i });
      i += op.length;
      continue;
    }

    throw new FormulaError(`无法识别的字符「${ch}」`, i);
  }
  tokens.push({ type: 'eof', value: '', pos: src.length });
  return tokens;
}
