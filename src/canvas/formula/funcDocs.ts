/**
 * 函数字典（公式编辑器的数据源）。
 * 与 pipeline/formula/parser.ts 的 FUNCTIONS 白名单一一对应 —— 由单测守卫，
 * 新增白名单函数时必须同步补此文档，否则测试失败（防漂移）。
 */

export type FuncCategory = '逻辑' | '数学' | '统计' | '日期' | '文本';

export interface FuncDoc {
  /** 签名展示（如 IF(条件, 值1, 值2)） */
  sig: string;
  cat: FuncCategory;
  desc: string;
  example: string;
}

export const FUNC_DOCS: Record<string, FuncDoc> = {
  IF: { sig: 'IF(条件, 值1, 值2)', cat: '逻辑', desc: '条件成立返回值1，否则返回值2（值2可省略，默认空）', example: "IF(完成率>=0.8, '达标', '未达标')" },
  AND: { sig: 'AND(条件1, 条件2, …)', cat: '逻辑', desc: '所有条件都成立时返回 TRUE', example: 'AND(当日新增>1000, 完成率>0.75)' },
  OR: { sig: 'OR(条件1, 条件2, …)', cat: '逻辑', desc: '任一条件成立即返回 TRUE', example: 'OR(分行=「抚顺分行」, 分行=「长春分行」)' },
  NOT: { sig: 'NOT(条件)', cat: '逻辑', desc: '条件取反', example: 'NOT(为空)' },
  ROUND: { sig: 'ROUND(数值, 小数位?)', cat: '数学', desc: '四舍五入，小数位省略取整', example: 'ROUND(完成率*100, 1)' },
  CEILING: { sig: 'CEILING(数值)', cat: '数学', desc: '向上取整（别名 CEIL）', example: 'CEILING(剩余户数/剩余天数)' },
  CEIL: { sig: 'CEIL(数值)', cat: '数学', desc: '向上取整', example: 'CEIL(3.2)' },
  FLOOR: { sig: 'FLOOR(数值)', cat: '数学', desc: '向下取整', example: 'FLOOR(3.8)' },
  ABS: { sig: 'ABS(数值)', cat: '数学', desc: '绝对值', example: 'ABS(环比增减)' },
  MIN: { sig: 'MIN(数值1, 数值2, …)', cat: '统计', desc: '取最小值。⚠️ 对整列求最小请用「取数」节点', example: 'MIN(批1绑卡, 批2绑卡)' },
  MAX: { sig: 'MAX(数值1, 数值2, …)', cat: '统计', desc: '取最大值。⚠️ 对整列求最大请用「取数」节点', example: 'MAX(批1绑卡, 批2绑卡)' },
  SUM: { sig: 'SUM(数值1, 数值2, …)', cat: '统计', desc: '对列出的几个值求和。⚠️ 对整列求和请用「取数」节点', example: 'SUM(企微绑卡, 公众号绑卡)' },
  AVG: { sig: 'AVG(数值1, 数值2, …)', cat: '统计', desc: '对列出的几个值求平均。⚠️ 对整列求平均请用「取数」节点', example: 'AVG(批1转化, 批2转化)' },
  COUNT: { sig: 'COUNT(值1, 值2, …)', cat: '统计', desc: '统计非空值的个数', example: 'COUNT(值1, 值2, 值3)' },
  DAYS: { sig: 'DAYS(结束日期, 开始日期)', cat: '日期', desc: '两个日期相差的天数（结束-开始）', example: "DAYS('2026-12-31', TODAY())" },
  TODAY: { sig: 'TODAY()', cat: '日期', desc: '今天的日期（YYYY-MM-DD）。也可直接写变量 today / yesterday / monthEnd 等', example: 'DAYS(截止日期, TODAY())' },
  NUM: { sig: 'NUM(值)', cat: '文本', desc: '把文本/带逗号/带百分号的值转为数字，失败记 0', example: "NUM('1,234')" },
  TEXT: { sig: 'TEXT(值)', cat: '文本', desc: '把任意值转为文本', example: 'TEXT(完成率)' },
  LEN: { sig: 'LEN(文本)', cat: '文本', desc: '文本长度（字符数）', example: "LEN('快捷支付')" },
};

export const FUNC_CATEGORIES: FuncCategory[] = ['逻辑', '数学', '统计', '日期', '文本'];

/** 全部函数名（按字典序），供补全列表与测试使用 */
export const FUNC_NAMES: string[] = Object.keys(FUNC_DOCS).sort();

/** 编辑距离（≤2 判定为近似拼写，供「是否想输入…」纠正） */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

/** 给拼错的函数名找建议（大小写不敏感，距离 ≤2） */
export function suggestFunction(name: string): string | null {
  const up = name.toUpperCase();
  let best: string | null = null;
  let bestD = 3;
  for (const fn of FUNC_NAMES) {
    const d = levenshtein(up, fn);
    if (d < bestD) {
      bestD = d;
      best = fn;
    }
  }
  return bestD <= 2 ? best : null;
}
