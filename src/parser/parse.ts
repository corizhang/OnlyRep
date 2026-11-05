import type { CellRaw, RawTable } from '../types';
import { buildColumnMetas, isNumericLike } from './clean';
import {
  readWorkbookSync,
  type CoreParseResult,
  type ParseRequest,
  type ParseResponse,
} from './xlsxCore';
import XlsxWorker from './xlsx.worker?worker&inline';

/**
 * 主线程解析门面：文件 → Worker 解析（失败回退主线程）→ RawTable；
 * TSV 粘贴解析、表头行识别、CSV 编码（UTF-8 → GBK 兜底）。
 */

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

class WorkerUnavailableError extends Error {
  constructor() {
    super('worker unavailable');
    this.name = 'WorkerUnavailableError';
  }
}

export interface ParseOptions {
  /** 指定 sheet 下标（多 Sheet 选择，R1-03） */
  sheetIndex?: number;
  /** 解析进度 0~100 */
  onProgress?: (value: number) => void;
}

const SUPPORTED_EXTS: ReadonlySet<string> = new Set(['xlsx', 'xls', 'csv']);

/** 文件解析入口（xlsx/xls/csv） */
export async function parseFile(file: File, opts: ParseOptions = {}): Promise<RawTable> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!SUPPORTED_EXTS.has(ext)) {
    throw new ParseError('仅支持 xlsx/xls/csv 或从 Excel 复制的表格');
  }
  if (file.size === 0) {
    throw new ParseError('文件中没有数据，请检查后重新导入');
  }

  const req: ParseRequest =
    ext === 'csv'
      ? { format: 'csv', text: decodeCsv(await file.arrayBuffer()) }
      : { format: ext as 'xlsx' | 'xls', buffer: await file.arrayBuffer() };

  opts.onProgress?.(2);
  const result = await runParse(req, opts.onProgress);
  return toRawTable(result.cells, {
    source: ext as RawTable['source'],
    fileName: file.name,
    sheetName: result.sheetName,
    sheets: result.sheets,
  });
}

/** Worker 调用；创建失败或 onerror 时回退主线程分片解析（ARCH 风险 R7） */
export async function runParse(
  req: ParseRequest,
  onProgress?: (value: number) => void,
): Promise<CoreParseResult> {
  let worker: Worker | null = null;
  try {
    worker = new XlsxWorker();
  } catch {
    worker = null;
  }

  if (worker) {
    try {
      return await new Promise<CoreParseResult>((resolve, reject) => {
        const w = worker as Worker;
        const cleanup = () => w.terminate();
        w.onmessage = (e: MessageEvent<ParseResponse>) => {
          const msg = e.data;
          if (msg.type === 'progress') {
            onProgress?.(msg.value);
          } else if (msg.type === 'done') {
            cleanup();
            resolve(msg);
          } else {
            cleanup();
            reject(new ParseError(msg.message));
          }
        };
        w.onerror = () => {
          cleanup();
          reject(new WorkerUnavailableError());
        };
        w.postMessage(req);
      });
    } catch (err) {
      if (!(err instanceof WorkerUnavailableError)) throw err;
      // Worker 不可用 → 继续走主线程兜底
    }
  }
  return mainThreadParse(req, onProgress);
}

/** 主线程兜底：解析为同步重活，前后让出主线程并回传进度（每阶段让出一次事件循环） */
async function mainThreadParse(
  req: ParseRequest,
  onProgress?: (value: number) => void,
): Promise<CoreParseResult> {
  onProgress?.(5);
  await nextTick();
  const result = readWorkbookSync(req, onProgress);
  await nextTick();
  onProgress?.(100);
  return result;
}

function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** CSV 编码兜底：先按 UTF-8 解码，检测到乱码（U+FFFD）比例超阈值时按 GBK 重读（ARCH 风险 R8） */
export function decodeCsv(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  const bad = (utf8.match(/\uFFFD/g) ?? []).length;
  if (bad > 0 && bad / Math.max(utf8.length, 1) > 0.001) {
    try {
      return new TextDecoder('gbk').decode(buffer);
    } catch {
      return utf8;
    }
  }
  return utf8;
}

/** TSV 粘贴解析（R1-02）；非表格内容抛 ParseError（E10 文案） */
export function parseTsv(text: string): CellRaw[][] {
  const trimmed = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  const noTableMsg = '剪贴板中未识别到表格数据，请从 Excel 复制单元格区域';
  if (trimmed === '') throw new ParseError(noTableMsg);

  const lines = trimmed.split('\n');
  const rows: CellRaw[][] = lines.map((line) =>
    line.split('\t').map((v) => (v === '' ? null : v)),
  );
  const hasMultiRow = rows.length >= 2;
  const hasMultiCol = rows.some((r) => r.length > 1);
  if (!hasMultiRow && !hasMultiCol) throw new ParseError(noTableMsg);
  return rows;
}

/** 表头行识别：前 20 行内找「≥2 个非空且多数为文本」的行；找不到则取第 1 行（R1-04） */
export function detectHeaderRow(cells: CellRaw[][]): number {
  const limit = Math.min(cells.length, 20);
  for (let i = 0; i < limit; i++) {
    const row = cells[i] ?? [];
    const nonEmpty = row.filter((c) => c !== null && String(c).trim() !== '');
    if (nonEmpty.length < 2) continue;
    const textLike = nonEmpty.filter(
      (c) => typeof c === 'string' && String(c).trim() !== '' && !isNumericLike(String(c)),
    );
    if (textLike.length / nonEmpty.length >= 0.6) return i;
  }
  return 0;
}

/** 由二维数组组装 RawTable（含列元信息与表头行识别） */
export function toRawTable(
  cells: CellRaw[][],
  info: {
    source: RawTable['source'];
    fileName: string;
    sheetName: string;
    sheets: RawTable['sheets'];
  },
): RawTable {
  const headerRowIndex = detectHeaderRow(cells);
  return {
    sheetName: info.sheetName,
    sheets: info.sheets,
    headerRowIndex,
    cells,
    columns: buildColumnMetas(cells, headerRowIndex),
    source: info.source,
    fileName: info.fileName,
  };
}
