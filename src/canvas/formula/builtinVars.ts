import type { NamedScalars, ScalarValue } from '../types';

/**
 * 系统固定变量（today / now …）。
 *
 * 与「表单/常量/取数/计算字段」不同，这些值不来自用户配置，而是由运行时刻决定：
 * - 取值一律**实时计算**，不写进 store.env，避免跨天后页面仍显示昨天的日期；
 * - 求值层（eval.resolveIdent）作为兜底变量池，模板、公式节点、行内公式都能直接写 `today`；
 * - 同名用户变量优先（先查 env / 行上下文，再查内置），保证既有配置不被悄悄改值。
 */

export interface BuiltinVarDef {
  /** 变量名（全小写，查找时大小写不敏感） */
  name: string;
  /** 中文名（面板/提示用） */
  label: string;
  /** 说明：口径与用法 */
  hint: string;
  value: (now: Date) => ScalarValue;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** 本地时区的 YYYY-MM-DD（与展示口径一致，不走 UTC） */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function shiftDay(base: Date, days: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export const BUILTIN_VAR_DEFS: BuiltinVarDef[] = [
  {
    name: 'today',
    label: '今天',
    hint: '当天日期 YYYY-MM-DD（本地时区，等价 TODAY()）',
    value: (d) => ymd(d),
  },
  {
    name: 'yesterday',
    label: '昨天',
    hint: '前一天日期 YYYY-MM-DD（日报标题最常用）',
    value: (d) => ymd(shiftDay(d, -1)),
  },
  {
    name: 'tomorrow',
    label: '明天',
    hint: '后一天日期 YYYY-MM-DD',
    value: (d) => ymd(shiftDay(d, 1)),
  },
  {
    name: 'now',
    label: '现在',
    hint: '当前日期时间 YYYY-MM-DD HH:mm（精确到分钟）',
    value: (d) => `${ymd(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
  },
  {
    name: 'time',
    label: '当前时刻',
    hint: '当前时刻 HH:mm（精确到分钟）',
    value: (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
  },
  {
    name: 'weekday',
    label: '星期',
    hint: '中文星期，如「周三」',
    value: (d) => WEEKDAYS[d.getDay()],
  },
  {
    name: 'year',
    label: '年',
    hint: '四位年份（数字，可直接参与计算）',
    value: (d) => d.getFullYear(),
  },
  {
    name: 'month',
    label: '月',
    hint: '月份 1~12（数字，无前导零）',
    value: (d) => d.getMonth() + 1,
  },
  {
    name: 'day',
    label: '日',
    hint: '当月第几天 1~31（数字）',
    value: (d) => d.getDate(),
  },
  {
    name: 'monthStart',
    label: '月初',
    hint: '本月第一天 YYYY-MM-01（月报区间起点）',
    value: (d) => ymd(new Date(d.getFullYear(), d.getMonth(), 1)),
  },
  {
    name: 'monthEnd',
    label: '月末',
    hint: '本月最后一天 YYYY-MM-DD（已处理大小月与闰年）',
    value: (d) => ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
  },
  {
    name: 'quarter',
    label: '季度',
    hint: '当前季度 Q1~Q4',
    value: (d) => `Q${Math.floor(d.getMonth() / 3) + 1}`,
  },
];

/** 小写名索引（查找大小写不敏感） */
const BY_LOWER = new Map(BUILTIN_VAR_DEFS.map((d) => [d.name.toLowerCase(), d]));

/** 分钟级缓存：同一分钟内所有调用共享同一份值，避免每帧重复格式化 */
let cacheMinute = Number.NaN;
let cacheVars: NamedScalars = {};

/** 当前时刻的系统固定变量表（值随分钟刷新） */
export function builtinVars(now: Date = new Date()): NamedScalars {
  const minute = Math.floor(now.getTime() / 60000);
  if (minute !== cacheMinute) {
    const next: NamedScalars = {};
    for (const def of BUILTIN_VAR_DEFS) next[def.name] = def.value(now);
    cacheVars = next;
    cacheMinute = minute;
  }
  return cacheVars;
}

/** 内置变量兜底（用户变量优先覆盖） */
export function withBuiltinVars(vars: NamedScalars, now: Date = new Date()): NamedScalars {
  return { ...builtinVars(now), ...vars };
}

/**
 * 按名取内置变量：大小写不敏感；未命中返回 undefined。
 * 用于 resolveIdent 的兜底路径（env / 行上下文都没命中时）。
 */
export function builtinVarOf(name: string, now?: Date): ScalarValue | undefined {
  const def = BY_LOWER.get(name.trim().toLowerCase());
  if (!def) return undefined;
  return builtinVars(now)[def.name];
}

/** 是否为系统固定变量名（管道节点重名警告要跳过它们） */
export function isBuiltinVarName(name: string): boolean {
  return BY_LOWER.has(name.trim().toLowerCase());
}
