import { FormulaError, tokenize, type Token } from './lexer';

/**
 * 公式语法分析（ARCH §5.2 第二段）：递归下降，产出白名单 AST。
 *
 * 安全铁律（R10-02）：AST 节点类型只有 num/str/bool/id/un/bin/call 七种，
 * 函数名必须在 FUNCTIONS 白名单内；解析完成后不存在任何可执行代码入口（无 eval / new Function）。
 */

export type Ast =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'bool'; v: boolean }
  | { t: 'id'; name: string }
  | { t: 'un'; op: '-' | '+' | 'NOT'; a: Ast }
  | { t: 'bin'; op: string; a: Ast; b: Ast }
  | { t: 'call'; name: string; args: Ast[] };

/** 允许调用的函数（大小写不敏感） */
export const FUNCTIONS: readonly string[] = [
  'IF',
  'AND',
  'OR',
  'NOT',
  'ROUND',
  'CEILING',
  'CEIL',
  'FLOOR',
  'ABS',
  'MIN',
  'MAX',
  'SUM',
  'AVG',
  'COUNT',
  'DAYS',
  'TODAY',
  'NUM',
  'TEXT',
  'LEN',
];

/** 运算符优先级（数字越大优先级越高） */
const PRECEDENCE: Record<string, number> = {
  '||': 1,
  OR: 1,
  '&&': 2,
  AND: 2,
  '==': 3,
  '=': 3,
  '!=': 3,
  '<>': 3,
  '>': 4,
  '>=': 4,
  '<': 4,
  '<=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
};

class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }

  private next(): Token {
    const t = this.peek();
    if (t.type !== 'eof') this.pos += 1;
    return t;
  }

  private expect(type: Token['type'], label: string): Token {
    const t = this.peek();
    if (t.type !== type) {
      throw new FormulaError(`此处应为${label}`, t.pos);
    }
    return this.next();
  }

  /** 当前 token 若为二元运算符则返回规范化的运算符名 */
  private binOpOf(t: Token): string | null {
    if (t.type === 'op' && t.value in PRECEDENCE) return t.value;
    if (t.type === 'ident') {
      const up = t.value.toUpperCase();
      if (up === 'AND' || up === 'OR') return up;
    }
    return null;
  }

  parse(): Ast {
    const ast = this.parseExpr(0);
    const t = this.peek();
    if (t.type !== 'eof') throw new FormulaError('公式结尾有多余内容', t.pos);
    return ast;
  }

  private parseExpr(minPrec: number): Ast {
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      const op = this.binOpOf(t);
      if (!op) break;
      const prec = PRECEDENCE[op];
      if (prec < minPrec) break;
      this.next();
      const right = this.parseExpr(prec + 1);
      left = { t: 'bin', op, a: left, b: right };
    }
    return left;
  }

  private parseUnary(): Ast {
    const t = this.peek();
    if (t.type === 'op' && (t.value === '-' || t.value === '+')) {
      this.next();
      const a = this.parseUnary();
      return t.value === '-' ? { t: 'un', op: '-', a } : { t: 'un', op: '+', a };
    }
    if (t.type === 'op' && t.value === '!') {
      this.next();
      return { t: 'un', op: 'NOT', a: this.parseUnary() };
    }
    if (t.type === 'ident' && t.value.toUpperCase() === 'NOT') {
      this.next();
      return { t: 'un', op: 'NOT', a: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Ast {
    const t = this.peek();

    if (t.type === 'number') {
      this.next();
      const v = Number(t.value);
      if (!Number.isFinite(v)) throw new FormulaError(`数字「${t.value}」不合法`, t.pos);
      return { t: 'num', v };
    }

    if (t.type === 'string') {
      this.next();
      return { t: 'str', v: t.value };
    }

    if (t.type === 'lparen') {
      this.next();
      const inner = this.parseExpr(0);
      this.expect('rparen', ' 右括号');
      return inner;
    }

    if (t.type === 'ident') {
      this.next();
      const upper = t.value.toUpperCase();
      if (upper === 'TRUE') return { t: 'bool', v: true };
      if (upper === 'FALSE') return { t: 'bool', v: false };

      // 函数调用
      if (this.peek().type === 'lparen') {
        if (!FUNCTIONS.includes(upper)) {
          throw new FormulaError(`不支持函数「${t.value}」`, t.pos);
        }
        this.next(); // 吃掉 (
        const args: Ast[] = [];
        if (this.peek().type !== 'rparen') {
          for (;;) {
            args.push(this.parseExpr(0));
            if (this.peek().type === 'comma') {
              this.next();
              continue;
            }
            break;
          }
        }
        this.expect('rparen', ' 右括号');
        return { t: 'call', name: upper, args };
      }

      return { t: 'id', name: t.value };
    }

    throw new FormulaError(
      t.type === 'eof' ? '公式不完整' : `无法解析的内容「${t.value}」`,
      t.pos,
    );
  }
}

/** 解析公式字符串为 AST；语法/白名单错误抛 FormulaError */
export function parseFormula(src: string): Ast {
  const text = String(src ?? '').trim();
  if (text === '') throw new FormulaError('公式为空');
  return new Parser(tokenize(text)).parse();
}

/** 收集公式引用到的所有变量名（UI 校验「引用是否存在」用） */
export function collectIdentifiers(ast: Ast, out: Set<string> = new Set()): Set<string> {
  switch (ast.t) {
    case 'id':
      out.add(ast.name);
      break;
    case 'un':
      collectIdentifiers(ast.a, out);
      break;
    case 'bin':
      collectIdentifiers(ast.a, out);
      collectIdentifiers(ast.b, out);
      break;
    case 'call':
      ast.args.forEach((a) => collectIdentifiers(a, out));
      break;
    default:
      break;
  }
  return out;
}
