import type { CellRaw, ColumnMeta, ColumnType, RawTable } from '../types';
import { MISSING_TOKENS, TOTAL_ROW_KEYWORDS } from '../constants/defaults';

/**
 * 单元格清洗 + 类型推断 + 表格清洗（ARCH §5.1/§5.2）。
 * 全部为纯函数；cleanTable 是解析层 → 计算层之间「行级数据」的唯一出口。
 */

/** 脏数据单元格错误（cleanTable 捕获后计入 dirtyCount） */
export class DirtyCellError extends Error {
  constructor(public readonly rawText: string) {
    super(`无法解析数值：${rawText}`);
    this.name = 'DirtyCellError';
  }
}

const NUMERIC_RE = /^[+-]?\d+(\.\d+)?$/;

const DATE_RES: RegExp[] = [
  /^\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?$/,
  /^\d{1,2}月\d{1,2}日$/,
  /^\d{4}\.\d{1,2}\.\d{1,2}$/,
];

/** 全角 → 半角（ASCII 全角区、全角空格；覆盖数字/字母/％/－/，/．等） */
export function toHalfWidth(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 0x3000) {
      out += ' ';
      continue;
    }
    if (code >= 0xff01 && code <= 0xff5e) {
      out += String.fromCharCode(code - 0xfee0);
      continue;
    }
    out += ch;
  }
  return out;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * 单元格清洗：typeHint 决定目标类型；无法解析时抛 DirtyCellError（按缺失处理并计数）。
 * 覆盖：千分位逗号、%（÷100）、万(×1e4)、亿(×1e8)、全角数字、(123) 负数、空/-/—/N/A → 缺失。
 */
export function parseCell(raw: CellRaw, typeHint: ColumnType): number | string | null {
  if (raw === null) return null;
  if (raw instanceof Date) {
    return typeHint === 'date' ? formatDate(raw) : raw.getTime();
  }
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'boolean') return raw ? 1 : 0;

  let s = String(raw).trim();
  s = toHalfWidth(s);
  s = s.replace(/\s+/g, '');
  if (MISSING_TOKENS.has(s.toLowerCase())) return null;

  if (typeHint === 'text' || typeHint === 'date') return s;

  // 数值 / 百分比路径
  let sign = 1;
  const paren = s.match(/^\((.+)\)$/); // (123) → -123
  if (paren) {
    sign = -1;
    s = paren[1];
  }
  let mul = 1;
  if (/万$/.test(s)) {
    mul = 1e4;
    s = s.slice(0, -1);
  } else if (/亿$/.test(s)) {
    mul = 1e8;
    s = s.slice(0, -1);
  }
  let isPercent = false;
  if (s.endsWith('%')) {
    isPercent = true;
    s = s.slice(0, -1);
  }
  s = s.replace(/,/g, ''); // 千分位
  if (!NUMERIC_RE.test(s)) throw new DirtyCellError(String(raw));
  let v = parseFloat(s) * mul * sign;
  if (isPercent) v = v / 100; // 百分号 ÷100（isPercent 由列类型记录，格式化时补回 %）
  return v;
}

/**
 * 宽容清洗（cleanTable / 列统计共用）：
 * 数值列中解析失败的「字母/汉字文本」（如员工号 YD00117、部门名）不是脏数据，
 * 原样保留文本值——名称列可正常显示，数值聚合时自动跳过；
 * 仅「不含字母的数值样式残缺值」（如 12.34.56）才置空并计入脏数据。
 */
export function parseCellLenient(
  raw: CellRaw,
  typeHint: ColumnType,
): { value: number | string | null; dirty: boolean } {
  try {
    return { value: parseCell(raw, typeHint), dirty: false };
  } catch {
    const s = toHalfWidth(String(raw ?? '')).replace(/\s+/g, '');
    if (s !== '' && /[A-Za-z\u4e00-\u9fff]/.test(s)) {
      return { value: s, dirty: false };
    }
    return { value: null, dirty: true };
  }
}

/** 日期样文本（yyyy-mm-dd / yyyy/m/d / x月x日 / yyyy.mm.dd） */export function isDateLike(s: string): boolean {
  const t = toHalfWidth(s).replace(/\s+/g, '');
  return DATE_RES.some((re) => re.test(t));
}

/** 百分比样文本（含 % 或全角 ％） */
export function isPercentLike(s: string): boolean {
  const t = toHalfWidth(s).replace(/\s+/g, '');
  return t.includes('%');
}

/** 数值样文本（含千分位/万/亿/(负)/纯数字） */
export function isNumericLike(s: string): boolean {
  const t = toHalfWidth(s).replace(/\s+/g, '');
  if (t === '') return false;
  let u = t;
  const paren = u.match(/^\((.+)\)$/);
  if (paren) u = paren[1];
  u = u.replace(/,/g, '');
  if (/万$/.test(u) || /亿$/.test(u)) u = u.slice(0, -1);
  if (u.endsWith('%')) u = u.slice(0, -1);
  return NUMERIC_RE.test(u);
}

/**
 * 列类型推断：对列采样（最多 200 个非空单元格），按成功路径投票。
 * 阈值：ratio ≥ 0.5 取最高票；< 0.5 视为 text（confidence 原样返回供 UI 标「疑似」）。
 */
export function inferColumnType(cells: CellRaw[]): { type: ColumnType; confidence: number } {
  const sample: CellRaw[] = [];
  for (const c of cells) {
    if (c === null) continue;
    if (typeof c === 'string' && c.trim() === '') continue;
    sample.push(c);
    if (sample.length >= 200) break;
  }
  if (sample.length === 0) return { type: 'text', confidence: 0 };

  const votes: Record<ColumnType, number> = { number: 0, percent: 0, date: 0, text: 0 };
  for (const c of sample) {
    if (c instanceof Date) {
      votes.date++;
      continue;
    }
    const s = String(c);
    if (isDateLike(s)) votes.date++;
    else if (isPercentLike(s)) votes.percent++;
    else if (typeof c === 'number' || isNumericLike(s)) votes.number++;
    else votes.text++;
  }
  const entries = Object.entries(votes) as [ColumnType, number][];
  entries.sort((a, b) => b[1] - a[1]);
  const [best, count] = entries[0];
  const ratio = count / sample.length;
  if (ratio < 0.5) return { type: 'text', confidence: ratio };
  return { type: best, confidence: ratio };
}

/** 由表头行构建列元信息（类型推断 + 脏/缺失统计 + 单位推断） */
export function buildColumnMetas(cells: CellRaw[][], headerRowIndex: number): ColumnMeta[] {
  const header = cells[headerRowIndex] ?? [];
  let width = header.length;
  for (let r = headerRowIndex + 1; r < cells.length; r++) {
    if (cells[r].length > width) width = cells[r].length;
  }

  const usedNames = new Map<string, number>();
  const metas: ColumnMeta[] = [];

  for (let c = 0; c < width; c++) {
    const rawName = String(header[c] ?? '').trim();
    const name = rawName !== '' ? rawName : `列${c + 1}`;
    const seen = usedNames.get(name) ?? 0;
    usedNames.set(name, seen + 1);
    const key = seen === 0 ? name : `${name}#${seen + 1}`; // 同名后列加序号后缀

    const colCells: CellRaw[] = [];
    for (let r = headerRowIndex + 1; r < cells.length; r++) {
      colCells.push(cells[r][c] ?? null);
    }

    const { type, confidence } = inferColumnType(colCells);

    let dirtyCount = 0;
    let missingCount = 0;
    let unitHint = '';
    for (const cell of colCells) {
      const { value, dirty } = parseCellLenient(cell, type);
      if (dirty) dirtyCount++;
      else if (value === null) missingCount++;
      if (unitHint === '' && typeof cell === 'string') {
        const t = toHalfWidth(cell);
        if (t.includes('%')) unitHint = '%';
        else if (t.includes('万')) unitHint = '万';
        else if (t.includes('亿')) unitHint = '亿';
      }
    }

    metas.push({ key, rawName: name, type, typeConfidence: confidence, dirtyCount, missingCount, unitHint });
  }
  return metas;
}

// ========== 清洗产物 ==========

/** 清洗后的数据行：key → 清洗值；`key#raw` → 原始文本（供脏数据对照 / countDistinct） */
export interface CleanRow {
  /** 原始行号（RawTable.cells 下标） */
  __idx: number;
  [col: string]: string | number | null | undefined;
}

export interface DirtyCellInfo {
  rowIdx: number;
  raw: string;
}

export interface CleanedTable {
  rows: CleanRow[];
  columns: ColumnMeta[];
  /** 数据区总行数（表头之后） */
  totalRows: number;
  /** 依据当前排除规则被排除的行数（空行/合计行/手动勾选） */
  excludedCount: number;
  /** 每列脏数据明细（供 UI 黄色标注与清洗对照） */
  dirtyCells: Record<string, DirtyCellInfo[]>;
}

/** 读取清洗值 */
export function getVal(row: CleanRow, key: string): string | number | null {
  const v = row[key];
  return v === undefined || v === null ? null : v;
}

/** 读取原始文本（`key#raw`） */
export function getRawText(row: CleanRow, key: string): string {
  const v = row[`${key}#raw`];
  return v === undefined || v === null ? '' : String(v);
}

/**
 * 表格清洗：按列类型逐格 parseCell；自动排除全空行，
 * 可选排除「合计/总计/小计」关键词行，叠加用户手动勾选排除的行。
 */
export function cleanTable(
  raw: RawTable,
  opts: { excludeTotalKeywords: boolean; excludedRowIdx: ReadonlySet<number> },
): CleanedTable {
  const columns = buildColumnMetas(raw.cells, raw.headerRowIndex);
  const rows: CleanRow[] = [];
  let excludedCount = 0;
  const dirtyCells: Record<string, DirtyCellInfo[]> = {};
  for (const meta of columns) dirtyCells[meta.key] = [];

  for (let r = raw.headerRowIndex + 1; r < raw.cells.length; r++) {
    const rowCells = raw.cells[r] ?? [];

    // 自动排除全空行
    const nonBlank = rowCells.some((c) => c !== null && String(c).trim() !== '');
    if (!nonBlank) {
      excludedCount++;
      continue;
    }
    // 排除「合计/总计/小计」关键词行（按首个非空单元格前缀匹配）
    const firstText = rowCells.find((c) => c !== null && String(c).trim() !== '');
    const firstTextStr = String(firstText ?? '').trim();
    if (
      opts.excludeTotalKeywords &&
      TOTAL_ROW_KEYWORDS.some((kw) => firstTextStr.startsWith(kw))
    ) {
      excludedCount++;
      continue;
    }
    // 用户手动勾选排除
    if (opts.excludedRowIdx.has(r)) {
      excludedCount++;
      continue;
    }

    const row: CleanRow = { __idx: r };
    for (let c = 0; c < columns.length; c++) {
      const meta = columns[c];
      const cell = rowCells[c] ?? null;
      row[`${meta.key}#raw`] = cell === null ? '' : String(cell).trim();
      const { value, dirty } = parseCellLenient(cell, meta.type);
      row[meta.key] = value;
      if (dirty) dirtyCells[meta.key].push({ rowIdx: r, raw: String(cell) });
    }
    rows.push(row);
  }

  return {
    rows,
    columns,
    totalRows: Math.max(0, raw.cells.length - raw.headerRowIndex - 1),
    excludedCount,
    dirtyCells,
  };
}
