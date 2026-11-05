import type { CellRaw, RawTable } from '../../types';
import { cleanTable, type CleanedTable } from '../../parser/clean';
import { parseFile } from '../../parser/parse';
import {
  MANUAL_ROW_LIMIT,
  type DataSource,
  type ImportDataSource,
  type ManualTableDataSource,
} from '../types';

/**
 * 数据源注册表（ARCH §2 datasource/registry）：
 * - 导入源：复用既有 parseFile + cleanTable，File 与解析结果只留内存（R10-04）；
 * - 手填源：cells → RawTable → 同一套清洗规则，保证与导入源行为一致；
 * - 手填源 200 行硬上限（PRD R1-07 / E4）。
 */

let seq = 0;

export function newId(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function createImportSource(name: string): ImportDataSource {
  return { id: newId('ds'), name, kind: 'import', fileName: '', sheetName: '' };
}

export function createManualTableSource(name: string): ManualTableDataSource {
  return {
    id: newId('ds'),
    name,
    kind: 'manualTable',
    columns: ['列1', '列2', '列3'],
    rows: [
      ['', '', ''],
      ['', '', ''],
      ['', '', ''],
    ],
  };
}

/** 手填表格 → 清洗表（与导入源共用 cleanTable，合计行/空行规则一致） */
export function manualTableToCleaned(def: ManualTableDataSource): CleanedTable {
  const header: CellRaw[] = def.columns.map((c) => c);
  const cells: CellRaw[][] = [header, ...def.rows.map((r) => normalizeRow(r, def.columns.length))];
  const raw: RawTable = {
    sheetName: def.name,
    sheets: [{ name: def.name, rows: def.rows.length, cols: def.columns.length }],
    headerRowIndex: 0,
    cells,
    columns: [],
    source: 'tsv',
    fileName: '',
  };
  return cleanTable(raw, { excludeTotalKeywords: true, excludedRowIdx: new Set<number>() });
}

function normalizeRow(row: CellRaw[], width: number): CellRaw[] {
  const out: CellRaw[] = [];
  for (let i = 0; i < width; i += 1) out.push(row[i] ?? null);
  return out;
}

export interface LoadedImport {
  table: CleanedTable;
  sheets: { name: string; rows: number; cols: number }[];
  sheetName: string;
  fileName: string;
}

/** 解析导入源文件（含指定 sheet）；抛错信息可直接展示给用户 */
export async function loadImportFile(
  file: File,
  opts: { sheetName?: string; onProgress?: (v: number) => void } = {},
): Promise<LoadedImport> {
  let raw = await parseFile(file, { onProgress: opts.onProgress });

  const wanted = opts.sheetName ?? '';
  if (wanted !== '' && raw.sheetName !== wanted) {
    const idx = raw.sheets.findIndex((s) => s.name === wanted);
    if (idx >= 0) {
      raw = await parseFile(file, { sheetIndex: idx, onProgress: opts.onProgress });
    }
  }

  const table = cleanTable(raw, { excludeTotalKeywords: true, excludedRowIdx: new Set<number>() });
  return {
    table,
    sheets: raw.sheets,
    sheetName: raw.sheetName,
    fileName: file.name,
  };
}

/** 手填源行数校验：超限返回错误文案（PRD E4） */
export function checkManualRowLimit(def: ManualTableDataSource): string | null {
  if (def.rows.length > MANUAL_ROW_LIMIT) {
    return `手填数据单源上限 ${MANUAL_ROW_LIMIT} 行（当前 ${def.rows.length} 行），请改用文件导入`;
  }
  return null;
}

/** 新数据源默认名（避免重名） */
export function uniqueName(existing: DataSource[], base: string): string {
  const names = new Set(existing.map((s) => s.name));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base}${i}`)) i += 1;
  return `${base}${i}`;
}
