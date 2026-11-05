import * as XLSX from 'xlsx';
import type { CellRaw } from '../types';

/**
 * xlsx/xls/csv 解析核心（SheetJS 0.18.5，dense 模式）。
 * 同时被 inline Web Worker 与主线程兜底路径复用，保证两条路径行为一致。
 */

export interface SheetInfo {
  name: string;
  rows: number;
  cols: number;
}

/** 主线程 → Worker 的解析请求（也是主线程兜底路径的入参） */
export interface ParseRequest {
  format: 'xlsx' | 'xls' | 'csv';
  /** 二进制格式（xlsx/xls）用 */
  buffer?: ArrayBuffer;
  /** csv（已按 UTF-8/GBK 解码为文本）用 */
  text?: string;
  /** 指定 sheet 下标；缺省取第一个含数据的 sheet（R1-03） */
  sheetIndex?: number;
}

export type ParseResponse =
  | { type: 'progress'; value: number }
  | { type: 'done'; sheets: SheetInfo[]; cells: CellRaw[][]; sheetName: string }
  | { type: 'error'; message: string };

export interface CoreParseResult {
  sheets: SheetInfo[];
  cells: CellRaw[][];
  sheetName: string;
}

interface DenseCell {
  v?: unknown;
  t?: string;
  /** 格式化显示文本（如 '85%'），SheetJS 读取时生成 */
  w?: unknown;
  /** numFmt 格式串（如 '0%'） */
  z?: unknown;
}

/** 解析工作簿并抽取指定 sheet 的二维数组（同步，重活） */
export function readWorkbookSync(
  req: ParseRequest,
  onProgress?: (value: number) => void,
): CoreParseResult {
  onProgress?.(5);
  let wb: XLSX.WorkBook;
  try {
    const options = {
      type: req.format === 'csv' ? ('string' as const) : ('array' as const),
      dense: true,
      cellDates: true,
    };
    wb =
      req.format === 'csv'
        ? XLSX.read(req.text ?? '', options as XLSX.ParsingOptions)
        : XLSX.read(req.buffer as ArrayBuffer, options as XLSX.ParsingOptions);
  } catch {
    // E1 / 加密工作簿：统一文案（PRD §4 ① 步）
    throw new Error('文件损坏或加密，请另存为 xlsx 后重试');
  }
  onProgress?.(55);

  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    throw new Error('文件中没有数据，请检查后重新导入');
  }

  const sheets: SheetInfo[] = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const ref = (ws as { ['!ref']?: string } | undefined)?.['!ref'];
    if (!ref) return { name, rows: 0, cols: 0 };
    const range = XLSX.utils.decode_range(ref);
    return {
      name,
      rows: range.e.r - range.s.r + 1,
      cols: range.e.c - range.s.c + 1,
    };
  });

  // 默认选第一个含数据的 sheet；用户可指定下标重解析
  let idx = req.sheetIndex ?? sheets.findIndex((s) => s.rows > 1 && s.cols > 0);
  if (idx < 0) idx = sheets.findIndex((s) => s.rows > 0);
  if (idx < 0) {
    throw new Error('文件中没有数据，请检查后重新导入');
  }
  const ws = wb.Sheets[wb.SheetNames[idx]];
  if (!ws) {
    throw new Error('文件中没有数据，请检查后重新导入');
  }

  const cells = sheetToCells(ws);
  onProgress?.(95);
  return { sheets, cells, sheetName: wb.SheetNames[idx] };
}

/**
 * worksheet → 二维数组。
 * 优先稠密模式（内存省约 40%）：
 * - 0.18.5 实际结构：行以数字下标直接挂在 worksheet 上（ws[0], ws[1], …），
 *   每行为按绝对列号索引的单元格数组（已实测确认）；
 * - 兼容 `!data` 结构（更新版本的稠密模式）；
 * 两者皆不可用时回退 sheet_to_json。
 */
function sheetToCells(ws: XLSX.WorkSheet): CellRaw[][] {
  const ref = (ws as { ['!ref']?: string })['!ref'];
  const range = XLSX.utils.decode_range(ref ?? 'A1:A1');

  // 0.18.5 dense：ws[行号] 为单元格数组
  const numericRows = ws as unknown as (DenseCell[] | undefined)[];
  if (typeof numericRows[range.s.r] !== 'undefined' && Array.isArray(numericRows[range.s.r])) {
    const out: CellRaw[][] = [];
    for (let r = range.s.r; r <= range.e.r; r++) {
      const row = numericRows[r];
      const cells: CellRaw[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        cells.push(denseCellToRaw(row?.[c]));
      }
      out.push(cells);
    }
    return out;
  }

  // 新版 dense：ws['!data']
  const denseData = (ws as { ['!data']?: (DenseCell[] | undefined)[] })['!data'];
  if (denseData && denseData.length > 0) {
    const out: CellRaw[][] = [];
    for (const row of denseData) {
      out.push((row ?? []).map(denseCellToRaw));
    }
    return out;
  }

  // 兜底：sheet_to_json（raw:true 保留原始数值；此路径下 numFmt 的 % 不参与识别）
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    blankrows: true,
    raw: true,
  });
  return aoa.map((row) => row.map(plainToRaw));
}

/**
 * 百分比数字单元格 → 文本「N%」。
 * SheetJS 会把「85%」预转为数值 0.85（t='n'）；优先用 SheetJS 按列格式生成的
 * 格式化文本 w（如 '85%' / '85.5%'，精度由格式串保证），让下游 clean.ts 的
 * 「% → ÷100 + percent 标注」逻辑自然生效。w 缺失时按 numFmt（z）自行换算，
 * toPrecision(12) 消除浮点尾差（0.855×100 → 85.5 而非 85.49999999999999）。
 */
function formatPercentText(v: number): string {
  return `${Number((v * 100).toPrecision(12))}%`;
}

function denseCellToRaw(cell: DenseCell | undefined): CellRaw {
  if (!cell || cell.t === 'z' || cell.v === undefined || cell.v === null) return null;
  const v = cell.v;
  if (cell.t === 'n' && typeof v === 'number') {
    if (typeof cell.w === 'string' && cell.w.includes('%')) {
      return cell.w.trim();
    }
    if (typeof cell.z === 'string' && cell.z.includes('%')) {
      return formatPercentText(v);
    }
  }
  if (v instanceof Date) return v;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  return String(v);
}

function plainToRaw(v: unknown): CellRaw {
  if (v === null || v === undefined) return null;
  if (
    v instanceof Date ||
    typeof v === 'string' ||
    typeof v === 'number' ||
    typeof v === 'boolean'
  ) {
    return v;
  }
  return String(v);
}
